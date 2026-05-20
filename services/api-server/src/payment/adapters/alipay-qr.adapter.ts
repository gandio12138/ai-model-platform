import { createSign, createVerify } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PaymentConfigService } from "../payment-config.service.js";
import {
  NormalizedPaymentEvent,
  NormalizedRefundState,
  PaymentAdapter,
  PaymentAdapterUnavailableError,
  PaymentVerificationError,
  PreparePaymentInput,
  PreparedPayment,
  QueryPaymentInput,
  RefundPaymentInput,
  WebhookInput
} from "./payment-adapter.js";

@Injectable()
export class AlipayQrAdapter implements PaymentAdapter {
  readonly code = "alipay_qr";

  constructor(@Inject(PaymentConfigService) private readonly config: PaymentConfigService) {}

  canHandle(input: { channelCode?: string | null; paymentMethod?: string | null }) {
    return ["alipay_qr", "alipay_web", "web_alipay_pc"].includes(
      String(input.paymentMethod ?? input.channelCode ?? "")
    );
  }

  async prepare(input: PreparePaymentInput): Promise<PreparedPayment> {
    this.assertConfigured();
    const expiresAt = new Date(Date.now() + this.config.alipay.qrExpireMinutes * 60_000);
    const response = await this.request("alipay.trade.precreate", {
      out_trade_no: input.order.order_no,
      total_amount: centsToYuan(Number(input.order.amount)),
      subject: input.product?.display_name ?? input.product?.name ?? input.product?.product_name ?? "OneToken 充值",
      timeout_express: `${this.config.alipay.qrExpireMinutes}m`
    });
    const payload = response.alipay_trade_precreate_response as Record<string, unknown> | undefined;
    if (!payload || payload.code !== "10000") {
      throw new PaymentAdapterUnavailableError(String(payload?.sub_msg ?? payload?.msg ?? "Alipay precreate failed"));
    }
    const qrContent = String(payload.qr_code ?? "");
    if (!qrContent) {
      throw new PaymentAdapterUnavailableError("Alipay did not return qr_code");
    }
    return {
      type: "qr_code",
      provider: "alipay",
      order_no: input.order.order_no,
      qr_content: qrContent,
      expires_at: expiresAt.toISOString(),
      raw: payload
    };
  }

  async verifyAndParseNotification(input: WebhookInput): Promise<NormalizedPaymentEvent> {
    this.assertConfigured();
    const body = input.body;
    if (!this.verifyForm(body)) {
      throw new PaymentVerificationError("Alipay signature verification failed");
    }
    if (String(body.app_id ?? "") !== this.config.alipay.appId) {
      throw new PaymentVerificationError("Alipay app_id mismatch");
    }
    if (this.config.alipay.pid && String(body.seller_id ?? "") !== this.config.alipay.pid) {
      throw new PaymentVerificationError("Alipay seller_id mismatch");
    }
    const tradeStatus = String(body.trade_status ?? "");
    return {
      provider: "alipay",
      eventId: String(body.notify_id ?? body.trade_no ?? `${body.out_trade_no}:${tradeStatus}`),
      orderNo: String(body.out_trade_no ?? ""),
      providerTradeNo: body.trade_no ? String(body.trade_no) : null,
      tradeState: tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED" ? "SUCCESS" : "UNKNOWN",
      amount: yuanToCents(String(body.total_amount ?? "0")),
      currency: "CNY",
      paidAt: body.gmt_payment ? new Date(String(body.gmt_payment).replace(" ", "T") + "+08:00") : null,
      raw: body
    };
  }

  async query(input: QueryPaymentInput): Promise<NormalizedPaymentEvent> {
    this.assertConfigured();
    const response = await this.request("alipay.trade.query", {
      out_trade_no: input.order.order_no
    });
    const payload = response.alipay_trade_query_response as Record<string, unknown> | undefined;
    if (!payload || payload.code !== "10000") {
      return {
        provider: "alipay",
        eventId: `alipay_query:${input.order.order_no}:${Date.now()}`,
        orderNo: input.order.order_no,
        tradeState: "UNKNOWN",
        amount: Number(input.order.amount),
        currency: input.order.currency,
        raw: payload ?? response
      };
    }
    const tradeStatus = String(payload.trade_status ?? "");
    return {
      provider: "alipay",
      eventId: `alipay_query:${input.order.order_no}:${payload.trade_no ?? Date.now()}`,
      orderNo: input.order.order_no,
      providerTradeNo: payload.trade_no ? String(payload.trade_no) : null,
      tradeState: tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED" ? "SUCCESS" : "UNKNOWN",
      amount: yuanToCents(String(payload.total_amount ?? payload.buyer_pay_amount ?? "0")),
      currency: input.order.currency,
      paidAt: payload.send_pay_date ? new Date(String(payload.send_pay_date).replace(" ", "T") + "+08:00") : null,
      raw: payload
    };
  }

  async refund(input: RefundPaymentInput): Promise<NormalizedRefundState> {
    this.assertConfigured();
    const response = await this.request("alipay.trade.refund", {
      out_trade_no: input.order.order_no,
      refund_amount: centsToYuan(Number(input.refund.amount)),
      out_request_no: input.refund.refund_no,
      refund_reason: input.refund.reason ?? "Admin refund"
    });
    const payload = response.alipay_trade_refund_response as Record<string, unknown> | undefined;
    const success = payload?.code === "10000";
    return {
      provider: "alipay",
      eventId: `alipay_refund:${input.refund.refund_no}:${payload?.trade_no ?? Date.now()}`,
      orderNo: input.order.order_no,
      refundNo: input.refund.refund_no,
      providerRefundNo: payload?.trade_no ? String(payload.trade_no) : null,
      refundState: success ? "SUCCESS" : "FAILED",
      amount: Number(input.refund.amount),
      currency: input.refund.currency,
      completedAt: success ? new Date() : null,
      raw: payload ?? response
    };
  }

  private async request(method: string, bizContent: Record<string, unknown>) {
    const params: Record<string, string> = {
      app_id: this.config.alipay.appId,
      method,
      format: "JSON",
      charset: this.config.alipay.charset,
      sign_type: this.config.alipay.signType,
      timestamp: formatAlipayTimestamp(new Date()),
      version: "1.0",
      notify_url: this.config.alipay.notifyUrl,
      biz_content: JSON.stringify(bizContent)
    };
    params.sign = signParams(params, this.config.alipay.privateKey!);
    const res = await fetch(this.config.alipay.gatewayUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams(params)
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new PaymentAdapterUnavailableError(`Alipay returned non-JSON response: ${text.slice(0, 120)}`);
    }
  }

  private verifyForm(body: Record<string, unknown>) {
    const sign = String(body.sign ?? "");
    if (!sign) return false;
    const payload = canonicalize(body, ["sign", "sign_type"]);
    return createVerify("RSA-SHA256")
      .update(payload, "utf8")
      .verify(this.config.alipay.alipayPublicKey!, sign, "base64");
  }

  private assertConfigured() {
    if (!this.config.alipayConfigured()) {
      throw new PaymentAdapterUnavailableError("Alipay QR payment is not configured");
    }
  }
}

function signParams(params: Record<string, unknown>, privateKey: string) {
  return createSign("RSA-SHA256")
    .update(canonicalize(params), "utf8")
    .sign(privateKey, "base64");
}

function canonicalize(params: Record<string, unknown>, excluded: string[] = []) {
  const skip = new Set(excluded);
  return Object.keys(params)
    .filter((key) => !skip.has(key) && params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join("&");
}

function centsToYuan(cents: number) {
  return (Math.round(cents) / 100).toFixed(2);
}

function yuanToCents(value: string) {
  return Math.round(Number(value) * 100);
}

function formatAlipayTimestamp(value: Date) {
  const pad = (input: number) => input.toString().padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}
