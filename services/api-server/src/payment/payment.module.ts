import { Module } from "@nestjs/common";
import { PublicModule } from "../public/public.module.js";
import { AlipayQrAdapter } from "./adapters/alipay-qr.adapter.js";
import { PaymentAdapterRegistry } from "./adapters/payment-adapter.registry.js";
import { WechatNativeAdapter } from "./adapters/wechat-native.adapter.js";
import { PaymentConfigService } from "./payment-config.service.js";
import { PaymentController } from "./payment.controller.js";
import { PaymentService } from "./payment.service.js";

@Module({
  imports: [PublicModule],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentConfigService, PaymentAdapterRegistry, AlipayQrAdapter, WechatNativeAdapter],
  exports: [PaymentService]
})
export class PaymentModule {}
