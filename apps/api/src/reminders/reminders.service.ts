import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WahaClientService } from "../waha-client/waha-client.service";
import { GeneralParametersService } from "../general-parameters/general-parameters.service";
import { renderTemplate } from "@kawalgula/shared";
import { DateTime } from "luxon";

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private prisma: PrismaService,
    private waha: WahaClientService,
    private generalParameters: GeneralParametersService,
  ) {}

  async seedReminders() {
    const oneDayLater = DateTime.utc().plus({ days: 1 }).toJSDate();

    const patients = await this.prisma.patient.findMany({
      where: {
        consentStatus: "opted_in",
        active: true,
        treatmentStatus: "active",
      },
      include: {
        patientMedications: {
          where: { active: true },
        },
      },
    });

    for (const patient of patients) {
      for (const pm of patient.patientMedications) {
        for (const timeStr of pm.scheduleTimes) {
          const [hour, minute] = timeStr.split(":").map(Number);

          for (
            let scheduled = this.buildNextWibUtc(hour, minute);
            scheduled <= oneDayLater;
            scheduled = DateTime.fromJSDate(scheduled).plus({ days: 1 }).toJSDate()
          ) {
            const exists = await this.prisma.reminder.findFirst({
              where: {
                patientMedicationId: pm.id,
                scheduledAt: scheduled,
              },
            });

            if (!exists) {
              await this.prisma.reminder.create({
                data: {
                  patientId: patient.id,
                  patientMedicationId: pm.id,
                  scheduledAt: scheduled,
                  status: "pending",
                  createdById: "SYSTEM",
                },
              });
            }
          }
        }
      }
    }
  }

  async dispatchReminders(patientMedicationId?: string) {
    const now = new Date();
    const maxRetries = await this.generalParameters.getInt(
      "reminder_max_retries",
      3,
    );

    const pendingWhere: any = { status: "pending" };
    if (patientMedicationId) {
      pendingWhere.patientMedicationId = patientMedicationId;
    } else {
      pendingWhere.scheduledAt = { lte: now };
    }

    const retryWhere: any = {
      status: "sent",
      nextRetryAt: { lte: now },
      retryCount: { lt: maxRetries },
    };
    if (patientMedicationId) {
      retryWhere.patientMedicationId = patientMedicationId;
    }

    const includeClause = {
      patient: true,
      patientMedication: {
        include: { medication: true },
      },
    };

    const [pending, retries] = await Promise.all([
      this.prisma.reminder.findMany({
        where: pendingWhere,
        include: includeClause,
        take: 50,
      }),
      this.prisma.reminder.findMany({
        where: retryWhere,
        include: includeClause,
        take: 50,
      }),
    ]);

    const reminders = [...pending, ...retries];

    for (const reminder of reminders) {
      const isRetry = reminder.status === "sent";
      const template = await this.prisma.templateMessage.findUnique({
        where: { key: "reminder" },
      });

      if (!template) continue;

      const chatId = `${reminder.patient.waNumber}@c.us`;
      const body = renderTemplate(template.body, {
        name: reminder.patient.name,
        medication_name: reminder.patientMedication.medication.name,
        dosage: reminder.patientMedication.medication.dosage,
        unit: reminder.patientMedication.medication.unit,
      });

      const text = `${template.title}\n\n${body}`;

      try {
        const wahaMessageId = await this.waha.sendText(chatId, text);
        this.logger.log(
          `${isRetry ? "Retry" : "Reminder"} sent to ${reminder.patient.name} for ${reminder.patientMedication.medication.name}`,
        );

        const updateData: any = {
          sentAt: new Date(),
          wahaMessageId,
        };
        if (!isRetry) {
          updateData.status = "sent";
        } else {
          updateData.nextRetryAt = null;
        }

        await this.prisma.reminder.update({
          where: { id: reminder.id },
          data: updateData,
        });

        await this.prisma.outboundMessage.create({
          data: {
            patientId: reminder.patientId,
            kind: "reminder",
            payload: { chatId, body },
            wahaMessageId,
            status: "sent",
            createdById: "SYSTEM",
          },
        });
      } catch (error: any) {
        this.logger.error(
          `${isRetry ? "Retry" : "Reminder"} failed for ${reminder.patient.name}: ${error.message}`,
        );
        await this.prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: "failed" },
        });

        await this.prisma.outboundMessage.create({
          data: {
            patientId: reminder.patientId,
            kind: "reminder",
            payload: { chatId },
            status: "failed",
            error: error.message,
            createdById: "SYSTEM",
          },
        });
      }
    }
  }

  async sendManualReminder(patientMedicationId: string): Promise<number> {
    const pm = await this.prisma.patientMedication.findFirst({
      where: { id: patientMedicationId, active: true },
      include: { patient: true, medication: true },
    });

    if (!pm) {
      throw new NotFoundException("Assignment obat tidak ditemukan");
    }

    if (pm.patient.consentStatus !== "opted_in") {
      throw new BadRequestException("Pasien belum opted_in");
    }

    const template = await this.prisma.templateMessage.findUnique({
      where: { key: "reminder" },
    });
    if (!template) {
      throw new BadRequestException("Template reminder belum dibuat");
    }

    const chatId = `${pm.patient.waNumber}@c.us`;
    const body = renderTemplate(template.body, {
      name: pm.patient.name,
      medication_name: pm.medication.name,
      dosage: pm.medication.dosage,
      unit: pm.medication.unit,
    });
    const text = `${template.title}\n\n${body}`;

    try {
      const wahaMessageId = await this.waha.sendText(chatId, text);

      await this.prisma.reminder.create({
        data: {
          patientId: pm.patientId,
          patientMedicationId: pm.id,
          scheduledAt: new Date(),
          status: "sent",
          sentAt: new Date(),
          wahaMessageId,
          manual: true,
        },
      });

      await this.prisma.outboundMessage.create({
        data: {
          patientId: pm.patientId,
          kind: "reminder",
          payload: { chatId, body },
          wahaMessageId,
          status: "sent",
          createdById: "SYSTEM",
        },
      });

      this.logger.log(
        `Manual reminder sent to ${pm.patient.name} for ${pm.medication.name}`,
      );
      return 1;
    } catch (error: any) {
      await this.prisma.outboundMessage.create({
        data: {
          patientId: pm.patientId,
          kind: "reminder",
          payload: { chatId },
          status: "failed",
          error: error.message,
          createdById: "SYSTEM",
        },
      });
      this.logger.error(
        `Manual reminder failed for ${pm.patient.name}: ${error.message}`,
      );
      throw error;
    }
  }

  async markMissed() {
    const now = new Date();
    let missedCount = 0;

    const sentReminders = await this.prisma.reminder.findMany({
      where: { status: "sent", manual: false },
    });

    for (const reminder of sentReminders) {
      const hasConsumption = await this.prisma.consumptionLog.findFirst({
        where: { reminderId: reminder.id },
      });

      if (hasConsumption) continue;

      const nextReminder = await this.prisma.reminder.findFirst({
        where: {
          patientMedicationId: reminder.patientMedicationId,
          scheduledAt: { gt: reminder.scheduledAt },
          manual: false,
        },
        orderBy: { scheduledAt: "asc" },
      });

      if (!nextReminder || nextReminder.scheduledAt > now) continue;

      await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: "missed" },
      });

      await this.prisma.consumptionLog.create({
        data: {
          patientId: reminder.patientId,
          patientMedicationId: reminder.patientMedicationId,
          reminderId: reminder.id,
          status: "missed",
          source: "system_missed",
          createdById: "SYSTEM",
        },
      });

      missedCount++;
    }

    if (missedCount > 0) {
      this.logger.log(`Missed marker: ${missedCount} reminders marked as missed`);
    }
  }

  private buildNextWibUtc(hour: number, minute: number): Date {
    const nowWib = DateTime.now().setZone("Asia/Jakarta");
    const todayWib = nowWib.startOf("day");
    const targetWib = todayWib.set({ hour, minute });

    if (targetWib <= nowWib) {
      return targetWib.plus({ days: 1 }).toUTC().toJSDate();
    }

    return targetWib.toUTC().toJSDate();
  }
}
