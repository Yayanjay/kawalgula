import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ConsumptionService {
  constructor(private prisma: PrismaService) {}

  async list(dto: { patientId?: string; startDate?: string; endDate?: string; page?: number; size?: number; sort?: { key: string; direction: string }[]; search?: { key: string[]; value: string } }) {
    const { page = 1, size = 10, search, sort, patientId, startDate, endDate } = dto;
    const skip = (page - 1) * size;

    const where: any = {};
    if (patientId) {
      where.patientId = patientId;
    }
    if (startDate || endDate) {
      where.reportedAt = {};
      if (startDate) where.reportedAt.gte = new Date(startDate);
      if (endDate) where.reportedAt.lte = new Date(endDate);
    }
    if (search?.value && search?.key?.length) {
      const keys = search.key.filter((k) =>
        ["medicationName"].includes(k),
      );
      if (keys.length) {
        where.OR = [];
        for (const k of keys) {
          if (k === "medicationName") {
            where.OR.push({
              patientMedication: {
                medication: { name: { contains: search.value, mode: "insensitive" } },
              },
            });
          }
        }
      }
    }

    const orderBy: any[] = [{ reportedAt: "desc" }];
    if (sort?.length) {
      for (const s of sort) {
        const allowedKeys = ["reportedAt", "status"];
        if (allowedKeys.includes(s.key)) {
          orderBy.unshift({ [s.key]: s.direction.toLowerCase() });
        }
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.consumptionLog.findMany({
        where,
        skip,
        take: Math.min(size, 100),
        orderBy,
        include: {
          patient: { select: { name: true, waNumber: true } },
          patientMedication: {
            include: { medication: { select: { name: true } } },
          },
        },
      }),
      this.prisma.consumptionLog.count({ where }),
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

  async summary(dto: { patientId?: string; startDate?: string; endDate?: string }) {
    const { patientId, startDate, endDate } = dto;

    const where: any = {};
    if (patientId) where.patientId = patientId;
    if (startDate || endDate) {
      where.reportedAt = {};
      if (startDate) where.reportedAt.gte = new Date(startDate);
      if (endDate) where.reportedAt.lte = new Date(endDate);
    }

    const rows = await this.prisma.consumptionLog.findMany({
      where,
      select: { status: true },
    });

    const total = rows.length;
    let taken = 0;
    let skipped = 0;
    let missed = 0;

    for (const r of rows) {
      if (r.status === "taken") taken++;
      else if (r.status === "skipped") skipped++;
      else if (r.status === "missed") missed++;
    }

    return { data: { total, taken, skipped, missed } };
  }

  async exportCsv(dto: { patientId?: string; startDate?: string; endDate?: string }) {
    const { data: rows } = await this.list({ ...dto, page: 1, size: 10000 });

    let csv = "Tanggal,Nama Pasien,WA Number,Nama Obat,Status,Sumber\n";

    for (const row of rows as any[]) {
      const date = new Date(row.reportedAt).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      });
      const medName = row.patientMedication?.medication?.name ?? "-";
      csv += `${date},${row.patient.name},${row.patient.waNumber},${medName},${row.status},${row.source}\n`;
    }

    return csv;
  }
}
