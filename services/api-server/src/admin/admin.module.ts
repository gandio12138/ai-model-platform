import { Module } from "@nestjs/common";
import { ConfigResolutionModule } from "../config-resolution/config-resolution.module.js";
import { PaymentModule } from "../payment/payment.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";

@Module({
  imports: [PaymentModule, ConfigResolutionModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
