import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";

export interface AlipayRuntimeConfig {
  enabled: boolean;
  env: string;
  appId: string;
  pid: string;
  gatewayUrl: string;
  signType: string;
  charset: string;
  keyMode: string;
  privateKey: string | null;
  alipayPublicKey: string | null;
  notifyUrl: string;
  qrExpireMinutes: number;
}

export interface WechatPayRuntimeConfig {
  enabled: boolean;
  apiBase: string;
  appId: string;
  mchId: string;
  apiV3Key: string;
  merchantSerialNo: string;
  merchantPrivateKey: string | null;
  platformCertificate: string | null;
  platformCertificateSerialNo: string;
  platformPublicKeyId: string;
  platformPublicKey: string | null;
  notifyUrl: string;
  refundNotifyUrl: string;
  nativeExpireMinutes: number;
}

@Injectable()
export class PaymentConfigService {
  readonly alipay: AlipayRuntimeConfig;
  readonly wechat: WechatPayRuntimeConfig;

  constructor() {
    this.alipay = this.loadAlipay();
    this.wechat = this.loadWechatPay();
    this.assertProductionConfiguration();
  }

  get mockEnabled() {
    return readBoolean("PAYMENT_MOCK_ENABLED", process.env.NODE_ENV !== "production");
  }

  get orderExpireMinutes() {
    return readNumber("PAYMENT_ORDER_EXPIRE_MINUTES", 30);
  }

  get checkoutWebBaseUrl() {
    return readString("CHECKOUT_WEB_BASE_URL", "http://localhost:5174");
  }

  get paymentSuccessUrl() {
    return readString("PAYMENT_SUCCESS_URL", `${this.checkoutWebBaseUrl}/payment/success`);
  }

  get paymentFailureUrl() {
    return readString("PAYMENT_FAILURE_URL", `${this.checkoutWebBaseUrl}/payment/failure`);
  }

  get isProduction() {
    return process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
  }

  assertMockAllowed() {
    if (!this.mockEnabled || this.isProduction) {
      throw new ServiceUnavailableException("Mock payment is disabled");
    }
  }

  private loadAlipay(): AlipayRuntimeConfig {
    return {
      enabled: readBoolean("ALIPAY_ENABLED", false),
      env: readString("ALIPAY_ENV", "sandbox"),
      appId: readString("ALIPAY_APP_ID", ""),
      pid: readString("ALIPAY_PID", ""),
      gatewayUrl: readString("ALIPAY_GATEWAY_URL", "https://openapi.alipay.com/gateway.do"),
      signType: readString("ALIPAY_SIGN_TYPE", "RSA2"),
      charset: readString("ALIPAY_CHARSET", "utf-8"),
      keyMode: readString("ALIPAY_KEY_MODE", "cert"),
      privateKey: readSecret("ALIPAY_APP_PRIVATE_KEY_PATH", "ALIPAY_APP_PRIVATE_KEY_BASE64"),
      alipayPublicKey:
        readSecret("ALIPAY_ALIPAY_CERT_PATH", "ALIPAY_ALIPAY_CERT_BASE64") ??
        normalizePem(readString("ALIPAY_ALIPAY_PUBLIC_KEY", ""), "PUBLIC KEY"),
      notifyUrl: readString("ALIPAY_NOTIFY_URL", "http://localhost:4000/api/payment/webhooks/alipay"),
      qrExpireMinutes: readNumber("ALIPAY_QR_EXPIRE_MINUTES", 30)
    };
  }

  private loadWechatPay(): WechatPayRuntimeConfig {
    return {
      enabled: readBoolean("WECHAT_PAY_ENABLED", false),
      apiBase: readString("WECHAT_PAY_API_BASE", "https://api.mch.weixin.qq.com"),
      appId: readString("WECHAT_PAY_APP_ID", ""),
      mchId: readString("WECHAT_PAY_MCH_ID", ""),
      apiV3Key: readString("WECHAT_PAY_API_V3_KEY", ""),
      merchantSerialNo: readString("WECHAT_PAY_MERCHANT_SERIAL_NO", ""),
      merchantPrivateKey: readSecret(
        "WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH",
        "WECHAT_PAY_MERCHANT_PRIVATE_KEY_BASE64"
      ),
      platformCertificate: readSecret(
        "WECHAT_PAY_PLATFORM_CERT_PATH",
        "WECHAT_PAY_PLATFORM_CERT_BASE64"
      ),
      platformCertificateSerialNo: readString("WECHAT_PAY_PLATFORM_CERT_SERIAL_NO", ""),
      platformPublicKeyId: readString("WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID", ""),
      platformPublicKey: readSecret("", "WECHAT_PAY_PLATFORM_PUBLIC_KEY_BASE64"),
      notifyUrl: readString("WECHAT_PAY_NOTIFY_URL", "http://localhost:4000/api/payment/webhooks/wechat"),
      refundNotifyUrl: readString(
        "WECHAT_PAY_REFUND_NOTIFY_URL",
        "http://localhost:4000/api/payment/webhooks/wechat/refund"
      ),
      nativeExpireMinutes: readNumber("WECHAT_PAY_NATIVE_EXPIRE_MINUTES", 30)
    };
  }

  private assertProductionConfiguration() {
    if (!this.isProduction) return;
    if (this.mockEnabled) {
      throw new ServiceUnavailableException("Mock payment must be disabled in production");
    }
    this.assertProductionUrl("CHECKOUT_WEB_BASE_URL", this.checkoutWebBaseUrl);
    this.assertProductionUrl("PAYMENT_SUCCESS_URL", this.paymentSuccessUrl);
    this.assertProductionUrl("PAYMENT_FAILURE_URL", this.paymentFailureUrl);
    if (this.alipay.enabled && !this.alipayConfigured()) {
      throw new ServiceUnavailableException("Alipay is enabled but production credentials are incomplete");
    }
    if (this.alipay.enabled) {
      this.assertProductionUrl("ALIPAY_NOTIFY_URL", this.alipay.notifyUrl);
    }
    if (this.wechat.enabled && !this.wechatConfigured()) {
      throw new ServiceUnavailableException("WeChat Pay is enabled but production credentials are incomplete");
    }
    if (this.wechat.enabled) {
      this.assertProductionUrl("WECHAT_PAY_NOTIFY_URL", this.wechat.notifyUrl);
      this.assertProductionUrl("WECHAT_PAY_REFUND_NOTIFY_URL", this.wechat.refundNotifyUrl);
    }
  }

  private assertProductionUrl(name: string, value: string) {
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value)) {
      throw new ServiceUnavailableException(`${name} must not point to a local address in production`);
    }
  }

  alipayConfigured() {
    return Boolean(
      this.alipay.enabled &&
        this.alipay.appId &&
        this.alipay.pid &&
        this.alipay.privateKey &&
        this.alipay.alipayPublicKey
    );
  }

  wechatConfigured() {
    return Boolean(
      this.wechat.enabled &&
        this.wechat.appId &&
        this.wechat.mchId &&
        this.wechat.apiV3Key &&
        this.wechat.merchantSerialNo &&
        this.wechat.merchantPrivateKey &&
        (this.wechat.platformCertificate || this.wechat.platformPublicKey)
    );
  }
}

function readString(key: string, fallback: string) {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
}

function readNumber(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readBoolean(key: string, fallback: boolean) {
  const value = process.env[key];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readSecret(pathKey: string, base64Key: string) {
  const filePath = pathKey ? process.env[pathKey] : "";
  if (filePath && existsSync(filePath)) {
    return readFileSync(filePath, "utf8");
  }
  const encoded = base64Key ? process.env[base64Key] : "";
  if (encoded) {
    return Buffer.from(encoded, "base64").toString("utf8");
  }
  return null;
}

function normalizePem(value: string, label: string) {
  const text = value.trim();
  if (!text) return null;
  if (text.includes("BEGIN")) return text;
  const lines = text.match(/.{1,64}/g)?.join("\n") ?? text;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}
