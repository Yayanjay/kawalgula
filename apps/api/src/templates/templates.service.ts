import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateTemplateDto } from "./dto/update-template.dto";
import { PaginationRequest, TemplateVariables } from "@kawalgula/shared";
import { renderTemplate } from "@kawalgula/shared";

import { TemplateType } from "@prisma/client";

const TEMPLATE_DEFAULTS: Record<
  string,
  { type: TemplateType; title: string; body: string }
> = {
  enrollment: {
    type: TemplateType.enrollment,
    title: "Program Pemantauan Obat DM",
    body: 'Halo {{name}},\n\nAnda telah didaftarkan dalam program pemantauan konsumsi obat DM oleh Puskesmas. Apakah Anda bersedia untuk mengikuti program ini?\n\nBalas "setuju" untuk mendaftar atau "nanti" untuk menunda.',
  },
  reminder: {
    type: TemplateType.reminder,
    title: "Pengingat Minum Obat",
    body: 'Halo {{name}},\n\nSaatnya minum obat {{medication_name}} dosis {{dosage}} {{unit}}.\n\nApakah Anda sudah meminum obat?\n\nBalas "sudah" jika sudah minum, "belum" jika belum.',
  },
  optin_confirm: {
    type: TemplateType.optin_confirm,
    title: "Pendaftaran Berhasil",
    body: "Terima kasih {{name}}, Anda telah terdaftar dalam program pemantauan konsumsi obat DM. Anda akan menerima pengingat sesuai jadwal pengobatan.\n\nJika ada pertanyaan, silakan hubungi Puskesmas.",
  },
  usage_hint: {
    type: TemplateType.usage_hint,
    title: "Cara Membalas",
    body: "Balas dengan kata kunci:\n- *Sudah* atau *Minum* jika sudah minum obat\n- *Belum* atau *Lewati* jika belum minum obat\n\nAtau gunakan tombol yang tersedia pada pesan pengingat.",
  },
  already_opted_in: {
    type: TemplateType.already_opted_in,
    title: "Sudah Terdaftar",
    body: "Halo {{name}}, Anda sudah terdaftar dalam program pemantauan konsumsi obat DM. Anda akan menerima pengingat sesuai jadwal pengobatan.",
  },
  taken_confirm: {
    type: TemplateType.confirmation,
    title: "Konfirmasi Minum",
    body: "Tercatat. Terima kasih.",
  },
  belum_retry: {
    type: TemplateType.confirmation,
    title: "Konfirmasi Belum (ulang)",
    body: "{{name}}, tercatat. Kami akan mengingatkan lagi nanti.",
  },
  belum_exhausted: {
    type: TemplateType.confirmation,
    title: "Konfirmasi Lewati",
    body: "{{name}}, baik, dicatat sebagai lewati untuk jadwal ini.",
  },
  wa_prefill: {
    type: TemplateType.enrollment,
    title: "Isi Otomatis WA",
    body: "Halo KawalGula, saya ingin mengikuti program DM tracker {{token}}",
  },
};

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

  async reset(key: string) {
    const defaults = TEMPLATE_DEFAULTS[key];
    if (!defaults) {
      throw new NotFoundException(
        `Template dengan key "${key}" tidak ditemukan`,
      );
    }

    const template = await this.prisma.templateMessage.upsert({
      where: { key },
      update: { title: defaults.title, body: defaults.body },
      create: {
        key,
        type: defaults.type,
        title: defaults.title,
        body: defaults.body,
        createdById: "SYSTEM",
      },
    });

    return { data: template };
  }

  async list(dto: PaginationRequest) {
    const { page = 1, size = 10, search, sort } = dto;
    const skip = (page - 1) * size;

    const where: any = {};
    if (search?.value && search?.key?.length) {
      const keys = search.key;
      where.OR = keys.map((k) => ({
        [k]: { contains: search.value, mode: "insensitive" },
      }));
    }

    const orderBy: any[] = [];
    if (sort?.length) {
      for (const s of sort) {
        const allowedKeys = ["key", "title", "type", "updatedAt"];
        if (allowedKeys.includes(s.key)) {
          orderBy.push({ [s.key]: s.direction.toLowerCase() });
        }
      }
    }
    if (!orderBy.length) {
      orderBy.push({ updatedAt: "desc" });
    }

    const [rows, total] = await Promise.all([
      this.prisma.templateMessage.findMany({
        where,
        skip,
        take: Math.min(size, 100),
        orderBy,
      }),
      this.prisma.templateMessage.count({ where }),
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

  async findByKey(key: string) {
    const template = await this.prisma.templateMessage.findUnique({
      where: { key },
    });

    if (!template) {
      throw new NotFoundException(`Template dengan key "${key}" tidak ditemukan`);
    }

    return { data: template };
  }

  async update(key: string, dto: UpdateTemplateDto) {
    const template = await this.prisma.templateMessage.findUnique({
      where: { key },
    });

    if (!template) {
      throw new NotFoundException(`Template dengan key "${key}" tidak ditemukan`);
    }

    const updated = await this.prisma.templateMessage.update({
      where: { key },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
      },
    });

    return { data: updated };
  }

  async preview(key: string, variables: TemplateVariables) {
    const template = await this.prisma.templateMessage.findUnique({
      where: { key },
    });

    if (!template) {
      throw new NotFoundException(`Template dengan key "${key}" tidak ditemukan`);
    }

    return {
      data: {
        title: renderTemplate(template.title, variables),
        body: renderTemplate(template.body, variables),
      },
    };
  }
}
