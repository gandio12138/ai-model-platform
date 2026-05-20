import { createDecipheriv, createSign, createVerify, randomBytes } from "node:crypto";
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
export class WechatNativeAdapter implements PaymentAdapter {
  readonly code = "wechat_native";

  constructor(@Inject(PaymentConfigService) private readonly config: PaymentConfigService) {}

  canHandle(input: { channelCode?: string | null; paymentMethod?: string | null }) {
    return ["wechat_native", "wechat_web", "web_wechat_native", "wechat_refund"].includes(
      String(input.paymentMethod ?? input.channelCode ?? "")
    );
  }

  async prepare(input: PreparePaymentInput): Promise<PreparedPayment> {
    this.assertConfigured();
    const expiresAt = new Date(Date.now() + this.config.wechat.nativeExpireMinutes * 60_000);
    const payload = {
      appid: this.config.wechat.appId,
      mchid: this.config.wechat.mchId,
      description: input.product?.display_name ?? input.product?.name ?? input.product?.product_name ?? "OneToken 充值",
      out_trade_no: input.order.order_no,
      time_expire: expiresAt.toISOString(),
      notify_url: this.config.wechat.notifyUrl,
      amount: {
        total: Number(input.order.amount),
        currency: input.order.currency
      }
    };
    const result = await this.request("POST", "/v3/pay/transactions/native", payload);
    const codeUrl = String(result.code_url ?? "");
    if (!codeUrl) {
      throw new PaymentAdapterUnavailableError("WeChat Pay did not return code_url");
    }
    return {
      type: "qr_code",
      provider: "wechat",
      order_no: input.order.order_no,
      qr_content: codeUrl,
      expires_at: expiresAt.toISOString(),
      raw: result
    };
  }

  async verifyAndParseNotification(input: WebhookInput): Promise<NormalizedPaymentEvent | NormalizedRefundState> {
    this.assertConfigured();
    const rawBody = input.rawBody ?? JSON.stringify(input.body);
    if (!this.verifySignature(input.headers, rawBody)) {
      throw new PaymentVerificationError("WeChat Pay signature verification failed");
    }
    const resource = input.body.resource as Record<string, unknown> | undefined;
    if (!resource) {
      throw new PaymentVerificationError("WeChat Pay resource is missing");
    }
    const decrypted = decryptWechatResource(resource, this.config.wechat.apiV3Key);
    if (input.channelCode.includes("refund")) {
      return this.normalizeRefund(decrypted);
    }
    return this.normalizePayment(decrypted);
  }

  async query(input: QueryPaymentInput): Promise<NormalizedPaymentEvent> {
    this.assertConfigured();
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(input.order.order_no)}?mchid=${encodeURIComponent(this.config.wechat.mchId)}`;
    const payload = await this.request("GET", path);
    return this.normalizePayment(payload);
  }

  async refund(input: RefundPaymentInput): Promise<NormalizedRefundState> {
    this.assertConfigured();
    const payload = {
      out_trade_no: input.order.order_no,
      out_refund_no: input.refund.refund_no,
      reason: input.refund.reason ?? "Admin refund",
      notify_url: this.config.wechat.refundNotifyUrl,
      amount: {
        refund: Number(input.refund.amount),
        total: Number(input.order.amount),
        currency: input.refund.currency
      }
    };
    const result = await this.request("POST", "/v3/refund/domestic/refunds", payload);
    return this.normalizeRefund(result);
  }

  private normalizePayment(payload: Record<string, unknown>): NormalizedPaymentEvent {
    if (String(payload.appid ?? "") !== this.config.wechat.appId) {
      throw new PaymentVerificationError("WeChat Pay appid mismatch");
    }
    if (String(payload.mchid ?? "") !== this.config.wechat.mchId) {
      throw new PaymentVerificationError("WeChat Pay mchid mismatch");
    }
    const amount = payload.amount as Record<string, unknown> | undefined;
    const state = String(payload.trade_state ?? "");
    return {
      provider: "wechat",
      eventId: String(payload.transaction_id ?? `${payload.out_trade_no}:${state}`),
      orderNo: String(payload.out_trade_no ?? ""),
      providerTradeNo: payload.transaction_id ? String(payload.transaction_id) : null,
      tradeState: state === "SUCCESS" ? "SUCCESS" : state === "CLOSED" ? "CLOSED" : "UNKNOWN",
      amount: Number(amount?.total ?? 0),
      currency: String(amount?.currency ?? "CNY"),
      paidAt: payload.success_time ? new Date(String(payload.success_time)) : null,
      raw: payload
    };
  }

  private normalizeRefund(payload: Record<string, unknown>): NormalizedRefundState {
    const amount = payload.amount as Record<string, unknown> | undefined;
    const status = String(payload.status ?? payload.refund_status ?? "");
    const state =
      status === "SUCCESS"
        ? "SUCCESS"
        : status === "PROCESSING"
          ? "PROCESSING"
          : status === "ABNORMAL" || status === "CLOSED"
            ? "FAILED"
            : "UNKNOWN";
    return {
      provider: "wechat",
      eventId: String(payload.refund_id ?? payload.out_refund_no ?? Date.now()),
      orderNo: String(payload.out_trade_no ?? ""),
      refundNo: String(payload.out_refund_no ?? ""),
      providerRefundNo: payload.refund_id ? String(payload.refund_id) : null,
      refundState: state,
      amount: Number(amount?.refund ?? amount?.payer_refund ?? 0),
      currency: String(amount?.currency ?? "CNY"),
      completedAt: payload.success_time ? new Date(String(payload.success_time)) : null,
      raw: payload
    };
  }

  private async request(method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
    const bodyText = body ? JSON.stringify(body) : "";
    const authorization = this.authorization(method, path, bodyText);
    const res = await fetch(`${this.config.wechat.apiBase}${path}`, {
      method,
      headers: {
        authorization,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "OneTokenPayment/1.0"
      },
      body: bodyText || undefined
    });
    const text = await res.text();
    const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (!res.ok) {
      throw new PaymentAdapterUnavailableError(`WeChat Pay API failed: ${res.status} ${String(payload.message ?? text).slice(0, 160)}`);
    }
    return payload;
  }

  private authorization(method: string, path: string, body: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");
    const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = createSign("RSA-SHA256")
      .update(message, "utf8")
      .sign(this.config.wechat.merchantPrivateKey!, "base64");
    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.config.wechat.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${this.config.wechat.merchantSerialNo}"`;
  }

  private verifySignature(headers: Record<string, unknown>, rawBody: string) {
    const normalized = normalizeHeaders(headers);
    const timestamp = normalized["wechatpay-timestamp"];
    const nonce = normalized["wechatpay-nonce"];
    const signature = normalized["wechatpay-signature"];
    if (!timestamp || !nonce || !signature) return false;
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    const publicKey = this.config.wechat.platformCertificate ?? this.config.wechat.platformPublicKey;
    return createVerify("RSA-SHA256")
      .update(message, "utf8")
      .verify(publicKey!, signature, "base64");
  }

  private assertConfigured() {
    if (!this.config.wechatConfigured()) {
      throw new PaymentAdapterUnavailableError("WeChat Native payment is not configured");
    }
  }
}

function normalizeHeaders(headers: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? String(value[0]) : String(value ?? "")])
  );
}

function decryptWechatResource(resource: Record<string, unknown>, apiV3Key: string) {
  const ciphertext = Buffer.from(String(resource.ciphertext ?? ""), "base64");
  const nonce = Buffer.from(String(resource.nonce ?? ""), "utf8");
  const associatedData = Buffer.from(String(resource.associated_data ?? ""), "utf8");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), nonce);
  decipher.setAAD(associatedData);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as Record<string, unknown>;
}
