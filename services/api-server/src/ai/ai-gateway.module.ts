import { Module } from "@nestjs/common";
import { PublicModule } from "../public/public.module.js";
import { AiGatewayController } from "./ai-gateway.controller.js";
import { AiGatewayService } from "./ai-gateway.service.js";

@Module({
  imports: [PublicModule],
  controllers: [AiGatewayController],
  providers: [AiGatewayService],
  exports: [AiGatewayService]
})
export class AiGatewayModule {}
