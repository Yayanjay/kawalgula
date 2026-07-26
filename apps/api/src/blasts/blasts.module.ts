import { Module } from "@nestjs/common";
import { BlastsController } from "./blasts.controller";
import { BlastsService } from "./blasts.service";

@Module({
  controllers: [BlastsController],
  providers: [BlastsService],
})
export class BlastsModule {}
