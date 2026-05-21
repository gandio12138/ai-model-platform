import { Module } from "@nestjs/common";
import { ConfigResolutionModule } from "../config-resolution/config-resolution.module.js";
import { AppConfigController } from "./app-config.controller.js";
import { AppConfigService } from "./app-config.service.js";

@Module({
  imports: [ConfigResolutionModule],
  controllers: [AppConfigController],
  providers: [AppConfigService]
})
export class AppConfigModule {}
