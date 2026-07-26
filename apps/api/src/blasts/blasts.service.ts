import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { WahaClientService } from "../waha-client/waha-client.service";
import { renderTemplate, PaginationRequest } from "@kawalgula/shared";
import { CreateBlastDto } from "./dto/create-blast.dto";

@Injectable()
export class BlastsService {
  private mediaBaseUrl: string;

  constructor(
    private prisma: PrismaService,
    private waha: WahaClientService,
    config: ConfigService,
  ) {
    this.mediaBaseUrl = config.get<string>(
      "MEDIA_BASE_URL",
      "http://localhost:3000",
    );
  }

  private resolveUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    return `${this.mediaBaseUrl}${path}`;
  }

  async create(dto: CreateBlastDto, adminId: string) {
    const blast = await this.prisma.blast.create({
      data: {
        title: dto.title,
        body: dto.body,
        mediaUrl: dto.mediaUrl,
        mediaType: dto.mediaType,
        createdById: adminId,
      },
    });
    return { data: blast };
  }

  async list(dto: PaginationRequest) {
    const { page = 1, size = 10, sort } = dto;
    const skip = (page - 1) * size;

    const orderBy: any[] = [];
    if (sort?.length) {
      for (const s of sort) {
        const allowedKeys = ["title", "status", "createdAt", "sentAt"];
        if (allowedKeys.includes(s.key)) {
          orderBy.push({ [s.key]: s.direction.toLowerCase() });
        }
      }
    }
    if (!orderBy.length) {
      orderBy.push({ createdAt: "desc" });
    }

    const [rows, total] = await Promise.all([
      this.prisma.blast.findMany({
        skip,
        take: Math.min(size, 100),
        orderBy,
      }),
      this.prisma.blast.count(),
    ]);

    return {
      data: rows,
      pagination: {
        page,
        size,
        total_item: total,
        total_pages: Math.ceil(total / size),
      },
    };
  }

  async findById(id: string) {
    const blast = await this.prisma.blast.findUnique({
      where: { id },
      include: {
        recipients: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!blast) {
      throw new NotFoundException("Broadcast tidak ditemukan");
    }

    return { data: blast };
  }

  async delete(id: string) {
    const blast = await this.prisma.blast.findUnique({ where: { id } });
    if (!blast) {
      throw new NotFoundException("Broadcast tidak ditemukan");
    }
    if (blast.status !== "draft") {
      throw new BadRequestException("Hanya broadcast draft yang bisa dihapus");
    }

    await this.prisma.blast.delete({ where: { id } });
    return { data: { message: "Broadcast dihapus" } };
  }

  async send(id: string) {
    const blast = await this.prisma.blast.findUnique({ where: { id } });
    if (!blast) {
      throw new NotFoundException("Broadcast tidak ditemukan");
    }
    if (blast.status !== "draft") {
      throw new BadRequestException("Broadcast sudah dikirim");
    }

    const patients = await this.prisma.patient.findMany({
      where: { consentStatus: "opted_in", active: true },
    });

    if (!patients.length) {
      throw new BadRequestException("Tidak ada pasien yang aktif dan sudah setuju");
    }

    await this.prisma.blast.update({
      where: { id },
      data: {
        status: "sending",
        totalRecipients: patients.length,
      },
    });

    const recipientData = patients.map((p) => ({
      blastId: id,
      patientId: p.id,
      patientName: p.name,
      waNumber: p.waNumber,
    }));

    await this.prisma.blastRecipient.createMany({ data: recipientData });

    let successCount = 0;
    let failCount = 0;

    for (const patient of patients) {
      const chatId = `${patient.waNumber}@c.us`;
      const renderedBody = renderTemplate(blast.body, {
        name: patient.name,
      });

      try {
        let wahaMessageId: string;
        if (blast.mediaUrl) {
          const absoluteUrl = this.resolveUrl(blast.mediaUrl);
          wahaMessageId = await this.waha.sendImage(chatId, absoluteUrl, renderedBody);
        } else {
          wahaMessageId = await this.waha.sendText(chatId, renderedBody);
        }

        await this.prisma.blastRecipient.updateMany({
          where: { blastId: id, patientId: patient.id },
          data: { status: "sent", wahaMessageId, sentAt: new Date() },
        });

        await this.prisma.outboundMessage.create({
          data: {
            patientId: patient.id,
            kind: "blast",
            payload: { blastId: id, body: renderedBody, mediaUrl: blast.mediaUrl },
            wahaMessageId,
            status: "sent",
            createdById: "SYSTEM",
          },
        });

        successCount++;
      } catch (error: any) {
        await this.prisma.blastRecipient.updateMany({
          where: { blastId: id, patientId: patient.id },
          data: { status: "failed", error: error.message },
        });

        await this.prisma.outboundMessage.create({
          data: {
            patientId: patient.id,
            kind: "blast",
            payload: { blastId: id, body: renderedBody, mediaUrl: blast.mediaUrl },
            status: "failed",
            error: error.message,
            createdById: "SYSTEM",
          },
        });

        failCount++;
      }

      if (patients.length > 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    const updated = await this.prisma.blast.update({
      where: { id },
      data: {
        status: "sent",
        sentAt: new Date(),
        successCount,
        failCount,
      },
    });

    return { data: updated };
  }

  async retryFailed(id: string) {
    const blast = await this.prisma.blast.findUnique({ where: { id } });
    if (!blast) {
      throw new NotFoundException("Broadcast tidak ditemukan");
    }
    if (blast.status !== "sent") {
      throw new BadRequestException("Hanya broadcast terkirim yang bisa di-retry");
    }

    const failed = await this.prisma.blastRecipient.findMany({
      where: { blastId: id, status: "failed" },
    });

    if (!failed.length) {
      throw new BadRequestException("Tidak ada penerima yang gagal");
    }

    let newSuccess = 0;
    let newFail = 0;

    for (const recipient of failed) {
      const chatId = `${recipient.waNumber}@c.us`;
      const renderedBody = renderTemplate(blast.body, {
        name: recipient.patientName,
      });

      try {
        let wahaMessageId: string;
        if (blast.mediaUrl) {
          const absoluteUrl = this.resolveUrl(blast.mediaUrl);
          wahaMessageId = await this.waha.sendImage(chatId, absoluteUrl, renderedBody);
        } else {
          wahaMessageId = await this.waha.sendText(chatId, renderedBody);
        }

        await this.prisma.blastRecipient.update({
          where: { id: recipient.id },
          data: { status: "sent", wahaMessageId, sentAt: new Date(), error: null },
        });

        await this.prisma.outboundMessage.create({
          data: {
            patientId: recipient.patientId,
            kind: "blast",
            payload: { blastId: id, body: renderedBody, mediaUrl: blast.mediaUrl },
            wahaMessageId,
            status: "sent",
            createdById: "SYSTEM",
          },
        });

        newSuccess++;
      } catch (error: any) {
        await this.prisma.outboundMessage.create({
          data: {
            patientId: recipient.patientId,
            kind: "blast",
            payload: { blastId: id, body: renderedBody, mediaUrl: blast.mediaUrl },
            status: "failed",
            error: error.message,
            createdById: "SYSTEM",
          },
        });

        newFail++;
      }

      if (failed.length > 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    const remainingFailed = await this.prisma.blastRecipient.count({
      where: { blastId: id, status: "failed" },
    });

    const totalSent = await this.prisma.blastRecipient.count({
      where: { blastId: id, status: "sent" },
    });

    const updated = await this.prisma.blast.update({
      where: { id },
      data: {
        successCount: totalSent,
        failCount: remainingFailed,
      },
    });

    return { data: updated };
  }
}
