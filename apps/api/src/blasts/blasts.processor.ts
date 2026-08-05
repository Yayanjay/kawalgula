import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { BlastsService } from "./blasts.service";

@Processor("blasts")
export class BlastsProcessor extends WorkerHost {
  private readonly logger = new Logger(BlastsProcessor.name);

  constructor(private blastsService: BlastsService) {
    super();
  }

  async process(job: Job) {
    try {
      switch (job.name) {
        case "send-recipient":
          await this.blastsService.sendRecipient(
            job.data.blastId,
            job.data.recipientId,
          );
          break;
        case "watchdog":
          await this.blastsService.watchdog();
          break;
      }
    } catch (error: any) {
      this.logger.error(
        `Job ${job.name} (${job.id}) failed: ${error?.message || error}`,
        error?.stack,
      );
      throw error;
    }
  }
}
