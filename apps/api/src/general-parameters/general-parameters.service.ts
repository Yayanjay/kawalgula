import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class GeneralParametersService {
  private readonly logger = new Logger(GeneralParametersService.name);

  constructor(private prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    const param = await this.prisma.generalParameter.findUnique({
      where: { key },
    });
    return param?.value ?? null;
  }

  async getInt(key: string, fallback: number): Promise<number> {
    const val = await this.get(key);
    if (val === null) return fallback;
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) {
      this.logger.warn(
        `GeneralParameter "${key}" has non-numeric value "${val}", using fallback ${fallback}`,
      );
      return fallback;
    }
    return parsed;
  }
}
