import { Module } from "@nestjs/common";
import { ConfigResolutionService } from "./config-resolution.service.js";

@Module({
  providers: [ConfigResolutionService],
  exports: [ConfigResolutionService]
})
export class ConfigResolutionModule {}
