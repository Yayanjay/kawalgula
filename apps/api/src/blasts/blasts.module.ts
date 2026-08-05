import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { BlastsController } from "./blasts.controller";
import { BlastsService } from "./blasts.service";
import { BlastsProcessor } from "./blasts.processor";
import { BlastsScheduler } from "./blasts.scheduler";

@Module({
  imports: [
    BullModule.registerQueue({
      name: "blasts",
    }),
  ],
  controllers: [BlastsController],
  providers: [BlastsService, BlastsProcessor, BlastsScheduler],
})
export class BlastsModule {}
