import { Module } from "@nestjs/common";
import { PublicModule } from "../public/public.module.js";
import { PaymentController } from "./payment.controller.js";
import { PaymentService } from "./payment.service.js";

@Module({
  imports: [PublicModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService]
})
export class PaymentModule {}
