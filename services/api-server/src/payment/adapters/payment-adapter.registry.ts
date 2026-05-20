import { Inject, Injectable } from "@nestjs/common";
import { AlipayQrAdapter } from "./alipay-qr.adapter.js";
import { PaymentAdapter } from "./payment-adapter.js";
import { WechatNativeAdapter } from "./wechat-native.adapter.js";

@Injectable()
export class PaymentAdapterRegistry {
  private readonly adapters: PaymentAdapter[];

  constructor(
    @Inject(AlipayQrAdapter) alipay: AlipayQrAdapter,
    @Inject(WechatNativeAdapter) wechat: WechatNativeAdapter
  ) {
    this.adapters = [alipay, wechat];
  }

  resolve(input: { channelCode?: string | null; paymentMethod?: string | null }) {
    return this.adapters.find((adapter) => adapter.canHandle(input)) ?? null;
  }
}
