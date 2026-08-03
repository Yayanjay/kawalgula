import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { GeneralParametersService } from "../general-parameters/general-parameters.service";

@Injectable()
export class WahaThrottleService implements OnModuleInit {
  private readonly logger = new Logger(WahaThrottleService.name);

  private maxPerMinute = 20;
  private burst = 3;
  private enabled = true;

  private tokens = 3;
  private lastRefillMs = Date.now();
  private refillRate = 20 / 60;
  private waiters: (() => void)[] = [];
  private refillTimer: NodeJS.Timeout | null = null;

  constructor(private generalParameters: GeneralParametersService) {}

  async onModuleInit() {
    this.maxPerMinute = await this.generalParameters.getInt(
      "waha_max_messages_per_minute",
      20,
    );
    this.burst = await this.generalParameters.getInt("waha_max_burst", 3);

    if (this.maxPerMinute <= 0) {
      this.enabled = false;
      this.logger.warn(
        "WAHA rate limiter disabled (waha_max_messages_per_minute <= 0)",
      );
      return;
    }

    this.refillRate = this.maxPerMinute / 60;
    this.tokens = Math.min(this.burst, this.maxPerMinute);

    this.logger.log(
      `WAHA rate limiter: max ${this.maxPerMinute} msg/min, burst ${this.burst}`,
    );
  }

  private refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillMs) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsedSec * this.refillRate);
    this.lastRefillMs = now;
  }

  async acquire(): Promise<void> {
    if (!this.enabled) return;

    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
    this.scheduleRefill();
  }

  private scheduleRefill() {
    if (this.refillTimer) return;

    this.refillTimer = setInterval(() => {
      this.refill();
      while (this.waiters.length && this.tokens >= 1) {
        this.tokens -= 1;
        this.waiters.shift()!();
      }
      if (!this.waiters.length) {
        clearInterval(this.refillTimer!);
        this.refillTimer = null;
      }
    }, 250);
  }
}
