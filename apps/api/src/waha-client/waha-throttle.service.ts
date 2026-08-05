import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { GeneralParametersService } from "../general-parameters/general-parameters.service";

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

@Injectable()
export class WahaThrottleService implements OnModuleInit {
  private readonly logger = new Logger(WahaThrottleService.name);

  private maxPerMinute = 20;
  private burst = 3;
  private maxWaitMs = 60000;
  private enabled = true;

  private tokens = 3;
  private lastRefillMs = Date.now();
  private refillRate = 20 / 60;
  private waiters: Waiter[] = [];
  private refillTimer: NodeJS.Timeout | null = null;

  constructor(private generalParameters: GeneralParametersService) {}

  async onModuleInit() {
    this.maxPerMinute = await this.generalParameters.getInt(
      "waha_max_messages_per_minute",
      20,
    );
    this.burst = await this.generalParameters.getInt("waha_max_burst", 3);
    this.maxWaitMs = await this.generalParameters.getInt(
      "waha_throttle_max_wait_ms",
      60000,
    );

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
      `WAHA rate limiter: max ${this.maxPerMinute} msg/min, burst ${this.burst}, max wait ${this.maxWaitMs}ms`,
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

    this.scheduleRefill();

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(
          new Error(
            `Antrian WA penuh, menunggu lebih dari ${this.maxWaitMs}ms (timeout)`,
          ),
        );
      }, this.maxWaitMs);

      this.waiters.push({ resolve, reject, timer });
    });
  }

  private scheduleRefill() {
    if (this.refillTimer) return;

    this.refillTimer = setInterval(() => {
      this.refill();
      while (this.waiters.length && this.tokens >= 1) {
        this.tokens -= 1;
        const waiter = this.waiters.shift()!;
        clearTimeout(waiter.timer);
        waiter.resolve();
      }
      if (!this.waiters.length) {
        clearInterval(this.refillTimer!);
        this.refillTimer = null;
      }
    }, 250);
  }
}
