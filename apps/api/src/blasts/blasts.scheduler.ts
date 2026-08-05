import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

@Injectable()
export class BlastsScheduler implements OnModuleInit {
  constructor(@InjectQueue("blasts") private blastsQueue: Queue) {}

  async onModuleInit() {
    await this.blastsQueue.upsertJobScheduler(
      "blast-watchdog",
      { every: 60000 },
      {
        name: "watchdog",
        data: {},
        opts: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        },
      },
    );
  }
}
