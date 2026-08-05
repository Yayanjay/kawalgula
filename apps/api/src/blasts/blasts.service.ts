import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { WahaClientService } from "../waha-client/waha-client.service";
import { GeneralParametersService } from "../general-parameters/general-parameters.service";
import { renderTemplate, PaginationRequest } from "@kawalgula/shared";
import { CreateBlastDto } from "./dto/create-blast.dto";

@Injectable()
export class BlastsService {
  private readonly logger = new Logger(BlastsService.name);
  private mediaBaseUrl: string;

  constructor(
    private prisma: PrismaService,
    private waha: WahaClientService,
    config: ConfigService,
    private generalParameters: GeneralParametersService,
    @InjectQueue("blasts") private blastsQueue: Queue,
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

    await this.prisma.blastRecipient.createMany({
      data: patients.map((p) => ({
        blastId: id,
        patientId: p.id,
        patientName: p.name,
        waNumber: p.waNumber,
      })),
    });

    const recipients = await this.prisma.blastRecipient.findMany({
      where: { blastId: id, status: "pending" },
      select: { id: true },
    });

    await this.enqueueRecipients(id, recipients.map((r) => r.id));

    const updated = await this.prisma.blast.findUnique({ where: { id } });
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
      select: { id: true },
    });

    if (!failed.length) {
      throw new BadRequestException("Tidak ada penerima yang gagal");
    }

    await this.prisma.blastRecipient.updateMany({
      where: { blastId: id, status: "failed" },
      data: { status: "pending", error: null },
    });

    await this.prisma.blast.update({
      where: { id },
      data: { status: "sending" },
    });

    await this.enqueueRecipients(id, failed.map((r) => r.id));

    const updated = await this.prisma.blast.findUnique({ where: { id } });
    return { data: updated };
  }

  async sendRecipient(blastId: string, recipientId: string) {
    let blast: any;
    let recipient: any;
    try {
      [blast, recipient] = await Promise.all([
        this.prisma.blast.findUnique({ where: { id: blastId } }),
        this.prisma.blastRecipient.findUnique({ where: { id: recipientId } }),
      ]);
    } catch (error: any) {
      this.logger.error(
        `Failed to load blast/recipient for ${recipientId}: ${error.message}`,
      );
      throw error;
    }

    if (!blast || !recipient) {
      this.logger.warn(`Blast ${blastId} or recipient ${recipientId} not found, skipping`);
      return;
    }

    if (recipient.status !== "pending") {
      this.logger.warn(
        `Recipient ${recipientId} is ${recipient.status}, skipping send`,
      );
      return;
    }

    const chatId = `${recipient.waNumber}@c.us`;
    let renderedBody: string;
    try {
      renderedBody = renderTemplate(blast.body, {
        name: recipient.patientName,
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to render blast body for recipient ${recipientId}: ${error.message}`,
      );
      await this.prisma.blastRecipient.update({
        where: { id: recipient.id },
        data: { status: "failed", error: `Render gagal: ${error.message}` },
      });
      return;
    }

    try {
      let wahaMessageId: string;
      if (blast.mediaUrl) {
        const absoluteUrl = this.resolveUrl(blast.mediaUrl);
        wahaMessageId = await this.waha.sendImage(
          chatId,
          absoluteUrl,
          renderedBody,
        );
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
          payload: { blastId, body: renderedBody, mediaUrl: blast.mediaUrl },
          wahaMessageId,
          status: "sent",
          createdById: "SYSTEM",
        },
      });

      this.logger.log(`Blast ${blastId}: sent to ${recipient.waNumber}`);
    } catch (error: any) {
      const message =
        error?.response?.data?.message || error.message || "Gagal mengirim";

      await this.prisma.blastRecipient.update({
        where: { id: recipient.id },
        data: { status: "failed", error: message },
      });

      await this.prisma.outboundMessage.create({
        data: {
          patientId: recipient.patientId,
          kind: "blast",
          payload: { blastId, body: renderedBody, mediaUrl: blast.mediaUrl },
          status: "failed",
          error: message,
          createdById: "SYSTEM",
        },
      });

      this.logger.error(`Blast ${blastId}: failed to send to ${recipient.waNumber}: ${message}`);
    }

    await this.finalizeIfDone(blastId);
  }

  async watchdog() {
    const stuckMinutes = await this.generalParameters.getInt(
      "blast_stuck_minutes",
      10,
    );
    const cutoff = new Date(Date.now() - stuckMinutes * 60 * 1000);

    const stuck = await this.prisma.blast.findMany({
      where: {
        status: "sending",
        updatedAt: { lt: cutoff },
      },
    });

    for (const blast of stuck) {
      try {
        const pending = await this.prisma.blastRecipient.findMany({
          where: { blastId: blast.id, status: "pending" },
          select: { id: true },
        });

        if (!pending.length) {
          await this.finalizeIfDone(blast.id);
          continue;
        }

        const toEnqueue: string[] = [];
        for (const recipient of pending) {
          const jobId = this.recipientJobId(recipient.id);
          const job = await this.blastsQueue.getJob(jobId);
          if (!job) {
            toEnqueue.push(recipient.id);
          }
        }

        if (!toEnqueue.length) {
          this.logger.log(
            `Blast ${blast.id} sending: ${pending.length} recipients already queued`,
          );
          continue;
        }

        this.logger.warn(
          `Blast ${blast.id} stuck in sending, re-enqueueing ${toEnqueue.length} of ${pending.length} pending recipients`,
        );
        await this.enqueueRecipients(blast.id, toEnqueue);
      } catch (error: any) {
        this.logger.error(
          `Watchdog failed for blast ${blast.id}: ${error.message}`,
        );
      }
    }
  }

  private recipientJobId(recipientId: string): string {
    return `send-${recipientId}`;
  }

  private async enqueueRecipients(blastId: string, recipientIds: string[]) {
    await this.blastsQueue.addBulk(
      recipientIds.map((recipientId) => ({
        name: "send-recipient",
        data: { blastId, recipientId },
        opts: {
          jobId: this.recipientJobId(recipientId),
          removeOnComplete: true,
          removeOnFail: true,
        },
      })),
    );
  }

  private async finalizeIfDone(blastId: string) {
    const pending = await this.prisma.blastRecipient.count({
      where: { blastId, status: "pending" },
    });
    if (pending > 0) return;

    const blast = await this.prisma.blast.findUnique({ where: { id: blastId } });
    if (!blast || blast.status !== "sending") return;

    const [successCount, failCount] = await Promise.all([
      this.prisma.blastRecipient.count({
        where: { blastId, status: "sent" },
      }),
      this.prisma.blastRecipient.count({
        where: { blastId, status: "failed" },
      }),
    ]);

    await this.prisma.blast.update({
      where: { id: blastId },
      data: {
        status: "sent",
        sentAt: new Date(),
        successCount,
        failCount,
      },
    });

    this.logger.log(
      `Blast ${blastId} finalized: ${successCount} sent, ${failCount} failed`,
    );
  }
}
