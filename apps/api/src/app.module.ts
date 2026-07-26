import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { AuthModule } from "./auth/auth.module";
import { WahaClientModule } from "./waha-client/waha-client.module";
import { WhatsappSessionModule } from "./whatsapp-session/whatsapp-session.module";
import { TemplatesModule } from "./templates/templates.module";
import { PatientsModule } from "./patients/patients.module";
import { MedicationsModule } from "./medications/medications.module";
import { PatientMedicationsModule } from "./patient-medications/patient-medications.module";
import { QueueModule } from "./queue/queue.module";
import { GeneralParametersModule } from "./general-parameters/general-parameters.module";
import { RemindersModule } from "./reminders/reminders.module";
import { WahaWebhookModule } from "./waha-webhook/waha-webhook.module";
import { ConsumptionModule } from "./consumption/consumption.module";
import { UploadsModule } from "./uploads/uploads.module";
import { BlastsModule } from "./blasts/blasts.module";
import { HealthController } from "./health.controller";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), ".env.local"),
        join(process.cwd(), "..", "..", ".env.local"),
        join(process.cwd(), ".env"),
        join(process.cwd(), "..", "..", ".env"),
      ],
      ignoreEnvFile: process.env.NODE_ENV === "production",
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, "..", "..", "web", "dist"),
      exclude: ["/api/(.*)"],
      serveRoot: "/",
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), "uploads"),
      serveRoot: "/uploads",
      serveStaticOptions: {
        index: false,
        maxAge: "1d",
      },
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    WahaClientModule,
    WhatsappSessionModule,
    TemplatesModule,
    PatientsModule,
    MedicationsModule,
    PatientMedicationsModule,
    QueueModule,
    GeneralParametersModule,
    RemindersModule,
    WahaWebhookModule,
    ConsumptionModule,
    UploadsModule,
    BlastsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
