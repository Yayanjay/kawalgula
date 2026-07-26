import { Injectable, InternalServerErrorException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";

export interface WahaButton {
  type: "reply";
  text: string;
}

@Injectable()
export class WahaClientService {
  private client: AxiosInstance;
  private sessionName: string;

  constructor(private config: ConfigService) {
    const apiUrl = config.get<string>("WAHA_API_URL", "http://localhost:3001");
    const apiKey = config.get<string>("WAHA_API_KEY", "waha-api-key-change-me");
    this.sessionName = config.get<string>("WAHA_SESSION_NAME", "default");

    this.client = axios.create({
      baseURL: apiUrl,
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      timeout: config.get<number>("WAHA_TIMEOUT_MS", 30000),
    });
  }

  private async ensureSessionWorking(): Promise<void> {
    const { status } = await this.getSessionStatus();
    if (status !== "WORKING") {
      throw new BadRequestException(
        "Sesi WhatsApp belum terhubung. Buka halaman WhatsApp untuk menghubungkan nomor terlebih dahulu.",
      );
    }
  }

  async sendButtons(
    chatId: string,
    header: string,
    body: string,
    footer: string,
    buttons: WahaButton[],
  ): Promise<string> {
    await this.ensureSessionWorking();
    try {
      const { data } = await this.client.post("/api/sendButtons", {
        session: this.sessionName,
        chatId,
        header,
        body,
        footer,
        buttons,
      });
      return data?.id ?? "unknown";
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Gagal mengirim pesan WA: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  async sendImage(
    chatId: string,
    imageUrl: string,
    caption?: string,
  ): Promise<string> {
    await this.ensureSessionWorking();
    try {
      const { data } = await this.client.post("/api/sendImage", {
        session: this.sessionName,
        chatId,
        image: { url: imageUrl },
        caption,
      });
      const id = data?.id;
      if (id && typeof id === "object" && "id" in id) {
        return String((id as Record<string, unknown>).id);
      }
      return (id as string) ?? "unknown";
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Gagal mengirim gambar WA: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  async sendText(chatId: string, text: string): Promise<string> {
    await this.ensureSessionWorking();

    let lastError: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data } = await this.client.post("/api/sendText", {
          session: this.sessionName,
          chatId,
          text,
        });
        const id = data?.id;
        if (id && typeof id === "object" && "id" in id) {
          return String((id as Record<string, unknown>).id);
        }
        return (id as string) ?? "unknown";
      } catch (error: any) {
        lastError = error;
        // transient/rate-limit errors: retry once after a short delay
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw new InternalServerErrorException(
          `Gagal mengirim pesan teks: ${error.response?.data?.message || error.message}`,
        );
      }
    }
    throw new InternalServerErrorException(
      `Gagal mengirim pesan teks: ${lastError?.response?.data?.message || lastError?.message}`,
    );
  }

  async startSession(): Promise<void> {
    try {
      await this.client.post("/api/sessions", {
        name: this.sessionName,
        start: true,
        config: {
          webhooks: [
            {
              url: this.config.get<string>("WAHA_WEBHOOK_URL"),
              events: ["message", "session.status"],
            },
          ],
        },
      });
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || "";
      const alreadyExists =
        error.response?.status === 409 ||
        msg.toLowerCase().includes("already exists") ||
        msg.toLowerCase().includes("use put");

      if (alreadyExists) {
        await this.client.post(`/api/sessions/${this.sessionName}/start`);
      } else {
        throw new InternalServerErrorException(
          `Gagal memulai session WAHA: ${msg}`,
        );
      }
    }
  }

  async stopSession(): Promise<void> {
    try {
      await this.client.post(`/api/sessions/${this.sessionName}/stop`);
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Gagal menghentikan session WAHA: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  async deleteSession(): Promise<void> {
    try {
      await this.client.delete(`/api/sessions/${this.sessionName}`);
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Gagal menghapus session WAHA: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  async getSessionStatus(): Promise<{ status: string; number?: string }> {
    try {
      const { data } = await this.client.get(`/api/sessions/${this.sessionName}`);
      return {
        status: data?.status ?? "STOPPED",
        number: data?.me?.id?.replace("@c.us", "") ?? undefined,
      };
    } catch (error: any) {
      return { status: "STOPPED" };
    }
  }

  async getQr(): Promise<Buffer | null> {
    try {
      const { data } = await this.client.get(
        `/api/${this.sessionName}/auth/qr?format=image`,
        { responseType: "arraybuffer" },
      );
      return Buffer.from(data);
    } catch {
      return null;
    }
  }

  async getLidByPhone(phone: string): Promise<string | null> {
    try {
      const { data } = await this.client.get(
        `/api/${this.sessionName}/lids/pn/${phone}`,
      );
      return data?.lid ?? null;
    } catch {
      return null;
    }
  }

  async getPhoneByLid(lid: string): Promise<string | null> {
    try {
      const { data } = await this.client.get(
        `/api/${this.sessionName}/lids/${lid}@lid`,
      );
      return data?.phoneNumber?.replace(/^\+/, "").replace("@c.us", "") ?? null;
    } catch {
      return null;
    }
  }
}
