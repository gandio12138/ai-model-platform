import { Module } from "@nestjs/common";
import { PaymentModule } from "../payment/payment.module.js";
import { PublicModule } from "../public/public.module.js";
import { CustomerController } from "./customer.controller.js";

@Module({
  imports: [PublicModule, PaymentModule],
  controllers: [CustomerController]
})
export class CustomerModule {}
