import { Module } from "@nestjs/common";
import { PublicModule } from "../public/public.module.js";
import { AppConfigController } from "./app-config.controller.js";
import { AppConfigService } from "./app-config.service.js";

@Module({
  imports: [PublicModule],
  controllers: [AppConfigController],
  providers: [AppConfigService]
})
export class AppConfigModule {}
