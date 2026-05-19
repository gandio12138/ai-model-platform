import { Module } from "@nestjs/common";
import { CustomerSessionService } from "./customer-session.service.js";
import { PublicAuthGuard } from "./public-auth.guard.js";
import { PublicController } from "./public.controller.js";
import { PublicService } from "./public.service.js";

@Module({
  controllers: [PublicController],
  providers: [PublicService, PublicAuthGuard, CustomerSessionService],
  exports: [PublicService, PublicAuthGuard, CustomerSessionService]
})
export class PublicModule {}
