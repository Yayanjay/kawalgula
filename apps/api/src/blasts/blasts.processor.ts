import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { BlastsService } from "./blasts.service";

@Processor("blasts")
export class BlastsProcessor extends WorkerHost {
  constructor(private blastsService: BlastsService) {
    super();
  }

  async process(job: Job) {
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
  }
}
