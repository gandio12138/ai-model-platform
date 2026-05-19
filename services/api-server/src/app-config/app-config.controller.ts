import { Controller, Get, Headers, Inject, Query } from "@nestjs/common";
import { AppConfigService } from "./app-config.service.js";

@Controller("/api/app")
export class AppConfigController {
  constructor(@Inject(AppConfigService) private readonly appConfig: AppConfigService) {}

  @Get("config")
  config(@Query() query: Record<string, unknown>, @Headers() headers: Record<string, unknown>) {
    return this.appConfig.getConfig(query, headers);
  }
}
