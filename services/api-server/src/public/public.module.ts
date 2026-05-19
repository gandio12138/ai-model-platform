import { Module } from "@nestjs/common";
import { PublicAuthGuard } from "./public-auth.guard.js";
import { PublicController } from "./public.controller.js";
import { PublicService } from "./public.service.js";

@Module({
  controllers: [PublicController],
  providers: [PublicService, PublicAuthGuard]
})
export class PublicModule {}
