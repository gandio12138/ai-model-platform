import { Inject, Injectable } from "@nestjs/common";
import { ConfigResolutionService } from "../config-resolution/config-resolution.service.js";

@Injectable()
export class AppConfigService {
  constructor(@Inject(ConfigResolutionService) private readonly configResolution: ConfigResolutionService) {}

  async getConfig(query: Record<string, unknown>, headers: Record<string, unknown> = {}) {
    return this.configResolution.resolveAppConfig(query, headers);
  }
}
