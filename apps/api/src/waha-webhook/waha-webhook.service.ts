import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WahaClientService } from "../waha-client/waha-client.service";
import { WhatsappSessionService } from "../whatsapp-session/whatsapp-session.service";
import { renderTemplate } from "@kawalgula/shared";

const TAKEN_REGEX = /sudah|selesai|udah|minum/i;
const SKIPPED_REGEX = /belum|lewati|skip/i;

@Injectable()
export class WahaWebhookService {
  private readonly logger = new Logger(WahaWebhookService.name);

  constructor(
    private prisma: PrismaService,
    private waha: WahaClientService,
    private whatsappSession: WhatsappSessionService,
  ) {}

  async handleEvent(body: any) {
    const event = body?.event;

    if (event === "session.status") {
      const status = body?.payload?.status ?? "UNKNOWN";
      const number = body?.payload?.me?.id?.replace("@c.us", "") ?? undefined;
      this.whatsappSession.setSessionStatus(status, number);
      this.logger.log(`Session status: ${status}`);
      return;
    }

    if (event === "message") {
      await this.handleMessage(body.payload);
      return;
    }

    if (event === "message.ack") {
      const ack = body?.payload?.ack;
      const ackName = body?.payload?.ackName ?? "UNKNOWN";
      const msgId = body?.payload?.id ?? "?";
      const to = body?.payload?.to ?? "?";
      this.logger.log(
        `Message ack: status=${ackName}(${ack}) id=${msgId} to=${to}`,
      );
      return;
    }

    this.logger.warn(`Unknown webhook event: ${event}`);
  }

  private async handleMessage(payload: any) {
    if (!payload?.from) return;

    if (payload.fromMe === true) return;

    const from = payload.from;
    this.logger.log(`Webhook message from="${from}" body="${(payload.body || "").slice(0, 80)}"`);

    let patient: any = null;

    const body = payload.body || "";
    const tokenMatch = body.match(/[a-f0-9]{8}/i);

    if (from.includes("@lid")) {
      const normalizedLid = from.replace("@lid", "");
      patient = await this.prisma.patient.findFirst({
        where: {
          active: true,
          OR: [{ lid: normalizedLid }, { lid: `${normalizedLid}@lid` }],
        },
      });

      if (!patient) {
        const phone = await this.waha.getPhoneByLid(normalizedLid);
        if (phone) {
          patient = await this.prisma.patient.findUnique({ where: { waNumber: phone, active: true } });
          if (patient) {
            await this.prisma.patient.update({ where: { id: patient.id }, data: { lid: normalizedLid } }).catch(() => {});
          }
        }
      }
    } else {
      const waNumber = from.replace("@c.us", "").replace(/\D/g, "");
      this.logger.log(`Extracted waNumber="${waNumber}" from from="${from}"`);
      patient = await this.prisma.patient.findUnique({ where: { waNumber, active: true } });
    }

    if (!patient && tokenMatch) {
      patient = await this.prisma.patient.findFirst({ where: { enrollmentToken: tokenMatch[0].toLowerCase(), active: true } });
      if (patient && from.includes("@lid")) {
        const normalizedLid = from.replace("@lid", "");
        await this.prisma.patient.update({ where: { id: patient.id }, data: { lid: normalizedLid } }).catch(() => {});
      }
    }

    if (!patient) {
      this.logger.warn(`Webhook: no patient for from="${from}"`);
      return;
    }

    this.logger.log(`Webhook: patient found id=${patient.id} name=${patient.name} consent=${patient.consentStatus}`);

    if (patient.consentStatus !== "opted_in") {
      this.logger.log(`Webhook: processing consent for ${patient.name} (${patient.waNumber})`);
      await this.handleConsent(patient.id, patient.waNumber, payload);
      return;
    }

    const buttonText = payload?.button?.text || payload?.buttonText || "";
    const input = (buttonText + " " + body).toLowerCase().trim();

    const isTaken = TAKEN_REGEX.test(input);
    const isSkipped = SKIPPED_REGEX.test(input);

    if (!isTaken && !isSkipped) {
      const template = await this.prisma.templateMessage.findUnique({
        where: { key: "usage_hint" },
      });

      if (template) {
        await this.waha.sendText(
          `${patient.waNumber}@c.us`,
          `${template.title}\n\n${template.body}`,
        );
      }
      return;
    }

    const status = isTaken ? "taken" : "skipped";
    const source = buttonText ? "button" : "free_text";

    const recentReminder = await this.prisma.reminder.findFirst({
      where: {
        patientId: patient.id,
        status: "sent",
      },
      orderBy: { scheduledAt: "desc" },
    });

    if (recentReminder) {
      await this.prisma.reminder.update({
        where: { id: recentReminder.id },
        data: { status: "confirmed" },
      });

      await this.prisma.consumptionLog.create({
        data: {
          patientId: patient.id,
          patientMedicationId: recentReminder.patientMedicationId,
          reminderId: recentReminder.id,
          status,
          source,
          rawText: buttonText || body || null,
          createdById: "SYSTEM",
        },
      });
      this.logger.log(`Consumption: ${status} by ${patient.name} via ${source}`);
    } else {
      const assignment = await this.prisma.patientMedication.findFirst({
        where: { patientId: patient.id, active: true },
        orderBy: { createdAt: "desc" },
      });

      if (assignment) {
        await this.prisma.consumptionLog.create({
          data: {
            patientId: patient.id,
            patientMedicationId: assignment.id,
            status,
            source,
            rawText: buttonText || body || null,
            createdById: "SYSTEM",
          },
        });
      }
    }

    await this.waha.sendText(`${patient.waNumber}@c.us`, `Tercatat. Terima kasih.`);
  }

  private async handleConsent(
    patientId: string,
    waNumber: string,
    payload: any,
  ) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    const token = patient?.enrollmentToken;

    const buttonText = payload?.button?.text || payload?.buttonText || "";
    const body = payload?.body || "";
    const input = (buttonText + " " + body).toLowerCase().trim();

    this.logger.log(
      `handleConsent: patientId=${patientId} token="${token}" body="${(body || "").slice(0, 100)}" input="${input.slice(0, 100)}"`,
    );

    const isDeclined = /nanti/i.test(input) || /tidak/i.test(input) || /batal/i.test(input);
    const isAgreed = (token && input.includes(token.toLowerCase())) || /setuju/i.test(input) || /ya/i.test(input);

    this.logger.log(
      `handleConsent: isAgreed=${isAgreed} isDeclined=${isDeclined} tokenMatch=${token ? input.includes(token.toLowerCase()) : "no-token"}`,
    );

    const chatId = `${waNumber}@c.us`;

    if (isAgreed) {
      await this.prisma.patient.update({
        where: { id: patientId },
        data: {
          consentStatus: "opted_in",
          consentAt: new Date(),
          ...(token ? { enrollmentToken: null } : {}),
        },
      });
      this.logger.log(`Consent: opted_in for patientId=${patientId} (token=${token ? "matched" : "keyword"})`);

      const template = await this.prisma.templateMessage.findUnique({
        where: { key: "optin_confirm" },
      });

      if (template) {
        const patient = await this.prisma.patient.findUnique({
          where: { id: patientId },
        });
        const msg = renderTemplate(template.body, { name: patient?.name || "" });
        await this.waha.sendText(chatId, `${template.title}\n\n${msg}`);
      }

      return;
    }

    if (isDeclined) {
      await this.prisma.patient.update({
        where: { id: patientId },
        data: {
          consentStatus: "opted_out",
          consentAt: new Date(),
          ...(token ? { enrollmentToken: null } : {}),
        },
      });
      this.logger.log(`Consent: opted_out for patientId=${patientId}`);

      const template = await this.prisma.templateMessage.findUnique({
        where: { key: "usage_hint" },
      });

      if (template) {
        await this.waha.sendText(chatId, `${template.title}\n\n${template.body}`);
      }

      return;
    }

    const template = await this.prisma.templateMessage.findUnique({
      where: { key: "enrollment" },
    });

    if (template) {
      const text = `${template.title}\n\n${template.body}\n\nBalas "setuju" untuk mendaftar atau "nanti" untuk menunda.`;
      await this.waha.sendText(chatId, text);
    }
  }
}
