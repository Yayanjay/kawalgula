import { randomBytes } from "crypto";
import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WahaClientService } from "../waha-client/waha-client.service";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { PaginationRequest } from "@kawalgula/shared";
import { renderTemplate } from "@kawalgula/shared";

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private prisma: PrismaService,
    private waha: WahaClientService,
  ) {}

  async list(dto: PaginationRequest) {
    const { page = 1, size = 10, search, sort } = dto;
    const skip = (page - 1) * size;

    const where: any = { active: true };
    if (search?.value && search?.key?.length) {
      const keys = search.key.filter((k) => ["name", "waNumber"].includes(k));
      if (keys.length) {
        where.OR = keys.map((k) => ({
          [k]: { contains: search.value, mode: "insensitive" },
        }));
      }
    }

    const orderBy: any[] = [];
    if (sort?.length) {
      for (const s of sort) {
        const allowedKeys = ["name", "waNumber", "createdAt", "consentStatus", "treatmentStatus"];
        if (allowedKeys.includes(s.key)) {
          orderBy.push({ [s.key]: s.direction.toLowerCase() });
        }
      }
    }
    if (!orderBy.length) {
      orderBy.push({ createdAt: "desc" });
    }

    const [rows, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: Math.min(size, 100),
        orderBy,
        select: {
          id: true,
          name: true,
          waNumber: true,
          dob: true,
          consentStatus: true,
          consentAt: true,
          active: true,
          treatmentStatus: true,
          createdAt: true,
          _count: { select: { patientMedications: true } },
        },
      }),
      this.prisma.patient.count({ where }),
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
    const patient = await this.prisma.patient.findFirst({
      where: { id, active: true },
      include: {
        patientMedications: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
          include: { medication: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException("Pasien tidak ditemukan");
    }

    return { data: patient };
  }

  async create(dto: CreatePatientDto, adminId: string) {
    const waNumber = this.normalizeWaNumber(dto.waNumber);

    const existing = await this.prisma.patient.findUnique({
      where: { waNumber },
    });

    if (existing) {
      throw new ConflictException("Nomor WA sudah terdaftar");
    }

    const patient = await this.prisma.patient.create({
      data: {
        name: dto.name,
        waNumber,
        enrollmentToken: randomBytes(4).toString("hex"),
        dob: dto.dob ? new Date(dto.dob) : null,
        consentStatus: "pending",
        createdById: adminId,
      },
    });

    return { data: patient };
  }

  async getEnrollmentLink(patientId: string): Promise<{ url: string }> {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException("Pasien tidak ditemukan");

    let token = patient.enrollmentToken;
    if (!token) {
      token = randomBytes(4).toString("hex");
      await this.prisma.patient.update({ where: { id: patientId }, data: { enrollmentToken: token } });
    }

    const status = await this.waha.getSessionStatus();
    const botNumber = status.number;
    if (!botNumber) {
      throw new InternalServerErrorException(
        "Nomor WhatsApp belum terhubung. Buka halaman WhatsApp untuk menghubungkan nomor terlebih dahulu.",
      );
    }

    const tpl = await this.prisma.templateMessage.findUnique({
      where: { key: "wa_prefill" },
    });
    const text = tpl
      ? renderTemplate(tpl.body, { token })
      : `Halo KawalGula, saya ingin mengikuti program DM tracker ${token}`;
    const url = `https://wa.me/${botNumber}?text=${encodeURIComponent(text)}`;
    return { url };
  }

  private normalizeWaNumber(raw: string): string {
    const digits = raw.replace(/\D/g, "");

    let normalized: string;
    if (digits.startsWith("62")) {
      normalized = digits;
    } else if (digits.startsWith("0")) {
      normalized = "62" + digits.slice(1);
    } else if (digits.startsWith("8")) {
      normalized = "62" + digits;
    } else {
      throw new BadRequestException(
        "Format nomor WA tidak valid. Gunakan 08xxx atau +62xxx.",
      );
    }

    if (normalized.length < 10 || normalized.length > 15) {
      throw new BadRequestException(
        "Nomor WA harus 10-15 digit setelah kode negara.",
      );
    }

    return normalized;
  }

  async update(id: string, dto: UpdatePatientDto) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, active: true },
    });

    if (!patient) {
      throw new NotFoundException("Pasien tidak ditemukan");
    }

    const data: any = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.dob !== undefined && { dob: dto.dob ? new Date(dto.dob) : undefined }),
      ...(dto.treatmentStatus !== undefined && { treatmentStatus: dto.treatmentStatus as any }),
    };

    const updated = await this.prisma.patient.update({
      where: { id },
      data,
    });

    if (dto.treatmentStatus === "completed") {
      await this.prisma.reminder.updateMany({
        where: { patientId: id, status: { in: ["pending", "sent"] } },
        data: { status: "missed" },
      });
    }

    return { data: updated };
  }

  async resendOptin(id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, active: true },
    });

    if (!patient) {
      throw new NotFoundException("Pasien tidak ditemukan");
    }

    if (patient.consentStatus === "opted_in") {
      await this.sendAlreadyOptedIn(patient.name, patient.waNumber);
    } else {
      await this.sendOptIn(patient.id, patient.name, patient.waNumber);
    }

    return { data: null };
  }

  async delete(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new NotFoundException("Pasien tidak ditemukan");
    await this.prisma.patient.delete({ where: { id } });
  }

  private async resolveLid(waNumber: string, patientId?: string): Promise<string | null> {
    try {
      const rawLid = await this.waha.getLidByPhone(waNumber);
      if (rawLid) {
        const lid = rawLid.replace("@lid", "");
        this.logger.log(`Opt-in LID resolve for ${waNumber}: ${lid}`);
        if (patientId) {
          await this.prisma.patient.update({
            where: { id: patientId },
            data: { lid },
          }).catch(() => {});
        }
        return lid;
      }
    } catch {
      // ignore; treat as no LID
    }
    this.logger.log(`Opt-in LID resolve for ${waNumber}: none`);
    return null;
  }

  private async sendOptIn(patientId: string, name: string, waNumber: string) {
    const template = await this.prisma.templateMessage.findUnique({
      where: { key: "enrollment" },
    });

    if (!template) return;

    const body = renderTemplate(template.body, { name });
    const text = `${template.title}\n\n${body}`;

    const lid = await this.resolveLid(waNumber, patientId);
    const targets = [`${waNumber}@c.us`];
    if (lid) targets.push(`${lid}@lid`);

    const attempted: { chatId: string; wahaId?: string }[] = [];
    let sentAny = false;
    let lastError: any;

    for (const chatId of targets) {
      try {
        const wahaMessageId = await this.waha.sendText(chatId, text);
        attempted.push({ chatId, wahaId: wahaMessageId });
        this.logger.log(
          `Opt-in sent to ${name} (${waNumber}) via ${chatId}, wahaId=${wahaMessageId}`,
        );
        sentAny = true;
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `Opt-in send failed for ${name} (${waNumber}) via ${chatId}: ${error.message}`,
        );
      }
    }

    if (sentAny) {
      await this.prisma.outboundMessage.create({
        data: {
          patientId,
          kind: "opt_in",
          payload: { attempted, body },
          status: "sent",
          createdById: "SYSTEM",
        },
      });
    } else {
      this.logger.error(
        `Opt-in send failed for ${name} (${waNumber}): ${lastError?.message}`,
      );
      await this.prisma.outboundMessage.create({
        data: {
          patientId,
          kind: "opt_in",
          payload: { attempted, body },
          status: "failed",
          error: "Gagal mengirim pesan opt-in",
          createdById: "SYSTEM",
        },
      });
    }
  }

  private async sendAlreadyOptedIn(name: string, waNumber: string) {
    const template = await this.prisma.templateMessage.findUnique({
      where: { key: "already_opted_in" },
    });

    if (!template) return;

    const lid = await this.resolveLid(waNumber);
    const body = renderTemplate(template.body, { name });
    const text = `${template.title}\n\n${body}`;

    const targets = [`${waNumber}@c.us`];
    if (lid) targets.push(`${lid}@lid`);

    let sentAny = false;
    let lastError: any;

    for (const chatId of targets) {
      try {
        await this.waha.sendText(chatId, text);
        this.logger.log(
          `Already-opted-in sent to ${name} (${waNumber}) via ${chatId}`,
        );
        sentAny = true;
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `Already-opted-in send failed for ${name} (${waNumber}) via ${chatId}: ${error.message}`,
        );
      }
    }

    if (sentAny) {
      this.logger.log(`Already-opted-in delivered for ${name} (${waNumber})`);
    } else {
      this.logger.error(
        `Already-opted-in send failed for ${name} (${waNumber}): ${lastError?.message}`,
      );
    }
  }
}
