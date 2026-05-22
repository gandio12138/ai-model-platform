import { Module } from "@nestjs/common";
import { AiGatewayModule } from "../ai/ai-gateway.module.js";
import { ConfigResolutionModule } from "../config-resolution/config-resolution.module.js";
import { PaymentModule } from "../payment/payment.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { ProviderModelSyncScheduler } from "./provider-model-sync.scheduler.js";

@Module({
  imports: [PaymentModule, ConfigResolutionModule, AiGatewayModule],
  controllers: [AdminController],
  providers: [AdminService, ProviderModelSyncScheduler]
})
export class AdminModule {}
