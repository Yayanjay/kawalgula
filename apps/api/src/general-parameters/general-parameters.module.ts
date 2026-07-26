import { Module, Global } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { GeneralParametersService } from "./general-parameters.service";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [GeneralParametersService],
  exports: [GeneralParametersService],
})
export class GeneralParametersModule {}
