export interface PreparedPayment {
  type: "qr_code" | "redirect" | "app_payload";
  provider: "alipay" | "wechat" | "apple" | string;
  order_no: string;
  qr_content?: string;
  url?: string;
  expires_at?: string;
  client_payload?: Record<string, unknown>;
  raw?: unknown;
}

export interface PreparePaymentInput {
  order: PaymentOrderSnapshot;
  channel: PaymentChannelSnapshot | null;
  product: PaymentProductSnapshot | null;
}

export interface WebhookInput {
  channelCode: string;
  headers: Record<string, unknown>;
  body: Record<string, unknown>;
  rawBody?: string;
}

export interface QueryPaymentInput {
  order: PaymentOrderSnapshot;
}

export interface RefundPaymentInput {
  order: PaymentOrderSnapshot;
  refund: PaymentRefundSnapshot;
}

export interface QueryRefundInput {
  order: PaymentOrderSnapshot;
  refund: PaymentRefundSnapshot;
}

export interface NormalizedPaymentEvent {
  provider: "alipay" | "wechat" | "apple" | string;
  eventId: string;
  orderNo: string;
  providerTradeNo?: string | null;
  tradeState: "SUCCESS" | "CLOSED" | "REFUND" | "NOTPAY" | "FAILED" | "UNKNOWN";
  amount: number;
  currency: string;
  paidAt?: Date | null;
  raw: unknown;
}

export interface NormalizedRefundState {
  provider: "alipay" | "wechat" | "apple" | string;
  eventId: string;
  orderNo: string;
  refundNo: string;
  providerRefundNo?: string | null;
  refundState: "SUCCESS" | "PROCESSING" | "FAILED" | "CANCELLED" | "UNKNOWN";
  amount: number;
  currency: string;
  completedAt?: Date | null;
  raw: unknown;
}

export interface PaymentOrderSnapshot {
  id: string;
  order_no: string;
  tenant_id: string;
  project_id: string | null;
  tenant_customer_id: string | null;
  user_id: string;
  product_id: string | null;
  platform: string;
  checkout_channel: string;
  payment_method: string;
  amount: number | string;
  currency: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  product_name?: string | null;
}

export interface PaymentProductSnapshot {
  id: string;
  product_code: string;
  product_name?: string | null;
  name?: string | null;
  display_name?: string | null;
  face_value_amount?: number | string;
  bonus_amount?: number | string;
  sale_amount?: number | string;
}

export interface PaymentChannelSnapshot {
  channel_code: string;
  channel_type: string;
  payment_method: string;
  display_name: string;
  config?: Record<string, unknown> | null;
}

export interface PaymentRefundSnapshot {
  id: string;
  refund_no: string;
  amount: number | string;
  currency: string;
  reason?: string | null;
}

export interface PaymentAdapter {
  readonly code: string;
  canHandle(input: { channelCode?: string | null; paymentMethod?: string | null }): boolean;
  prepare(input: PreparePaymentInput): Promise<PreparedPayment>;
  verifyAndParseNotification(input: WebhookInput): Promise<NormalizedPaymentEvent | NormalizedRefundState>;
  query(input: QueryPaymentInput): Promise<NormalizedPaymentEvent>;
  refund(input: RefundPaymentInput): Promise<NormalizedRefundState>;
  queryRefund?(input: QueryRefundInput): Promise<NormalizedRefundState>;
}

export class PaymentAdapterUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentAdapterUnavailableError";
  }
}

export class PaymentVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentVerificationError";
  }
}
