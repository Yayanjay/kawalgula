import { Global, Module } from "@nestjs/common";
import { WahaClientService } from "./waha-client.service";
import { WahaThrottleService } from "./waha-throttle.service";

@Global()
@Module({
  providers: [WahaClientService, WahaThrottleService],
  exports: [WahaClientService],
})
export class WahaClientModule {}
