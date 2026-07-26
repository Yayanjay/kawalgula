import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateTemplateDto } from "./dto/update-template.dto";
import { PaginationRequest, TemplateVariables } from "@kawalgula/shared";
import { renderTemplate } from "@kawalgula/shared";

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

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
