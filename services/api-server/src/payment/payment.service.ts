import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { PublicRequestUser } from "../public/public-auth.guard.js";
import { PublicService } from "../public/public.service.js";
import { assertPaymentStatusTransition } from "./payment-state.js";

@Injectable()
export class PaymentService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PublicService) private readonly publicService: PublicService
  ) {}

  async submitIosIapTransaction(user: PublicRequestUser, body: Record<string, unknown>) {
    const transactionId = requiredString(body.transaction_id ?? body.transactionId, "transaction_id");
    const productId = requiredString(body.product_id ?? body.productId, "product_id");
    const environment = String(body.environment ?? "Sandbox");
    const signedTransactionInfo = requiredString(
      body.signed_transaction_info ?? body.signedTransactionInfo,
      "signed_transaction_info"
    );

    const context = await this.publicService.resolveCheckoutContext({
      ...body,
      platform: "ios",
      tenant_id: body.tenant_id ?? user.tenantId,
      project_id: body.project_id ?? user.projectId
    });
    const customerContext = await this.publicService.ensureCustomerContext(user.id, context);
    const product = await this.findIosProduct(context.tenant.id, context.project?.id ?? null, productId);
    const canVerifyApple = Boolean(
      process.env.APPLE_IAP_ISSUER_ID &&
        process.env.APPLE_IAP_KEY_ID &&
        process.env.APPLE_IAP_PRIVATE_KEY
    );
    const sandboxVerified = process.env.NODE_ENV !== "production" && environment.toLowerCase() !== "production";
    if (!canVerifyApple && process.env.NODE_ENV === "production") {
      throw new HttpException("Apple IAP verification is not configured", 503);
    }

    return this.db.transaction(async (client) => {
      const existing = await client.query(
        `select iap.*, po.order_no, po.status as order_status
           from ios_iap_transactions iap
           left join payment_orders po on po.id = iap.payment_order_id
          where iap.transaction_id = $1
          for update of iap`,
        [transactionId]
      );
      if (existing.rows[0]) {
        return {
          transaction: this.toIapTransactionResponse(existing.rows[0]),
          order_id: existing.rows[0].payment_order_id,
          order_no: existing.rows[0].order_no,
          order_status: existing.rows[0].order_status,
          idempotent: true
        };
      }

      const order = await this.createPaymentOrderForProduct(client, {
        tenantId: context.tenant.id,
        projectId: context.project?.id ?? null,
        tenantCustomerId: customerContext.tenant_customer.id,
        userId: user.id,
        product,
        platform: "ios",
        checkoutChannel: "apple_iap",
        paymentMethod: "apple_iap",
        clientContext: {
          app_account_token: body.app_account_token ?? body.appAccountToken ?? null,
          environment
        },
        metadata: {
          iap_product_id: productId,
          app_store_transaction_id: transactionId
        }
      });

      const status = canVerifyApple || sandboxVerified ? "verified" : "received";
      const iap = await client.query(
        `insert into ios_iap_transactions
          (tenant_id, project_id, tenant_customer_id, user_id, payment_order_id,
           transaction_id, original_transaction_id, product_id, app_account_token,
           environment, signed_transaction_info, purchase_date, status, metadata)
         values ($1, $2, $3, $4, $5,
                 $6, $7, $8, $9,
                 $10, $11, now(), $12, $13::jsonb)
         returning *`,
        [
          context.tenant.id,
          context.project?.id ?? null,
          customerContext.tenant_customer.id,
          user.id,
          order.id,
          transactionId,
          body.original_transaction_id ?? body.originalTransactionId ?? null,
          productId,
          body.app_account_token ?? body.appAccountToken ?? null,
          environment,
          signedTransactionInfo,
          status,
          JSON.stringify({
            verification_source: canVerifyApple ? "app_store_server_api" : "dev_sandbox",
            sandbox_verified: sandboxVerified
          })
        ]
      );

      await this.recordPaymentTransaction(client, {
        orderId: order.id,
        tenantId: context.tenant.id,
        projectId: context.project?.id ?? null,
        transactionType: "ios_iap",
        channelCode: "ios_apple_iap",
        channelTradeNo: transactionId,
        status,
        amount: Number(product.sale_amount),
        currency: product.currency,
        verified: canVerifyApple || sandboxVerified,
        idempotencyKey: `iap:${transactionId}`,
        rawPayload: { product_id: productId, environment }
      });

      if (canVerifyApple || sandboxVerified) {
        await this.transitionOrder(client, order.id, order.status, "PAID", "ios_iap_verified", {
          transaction_id: transactionId
        });
        await this.fulfillRechargeOrder(client, order.id, "ios_iap_fulfillment", {
          transaction_id: transactionId
        });
      }

      const updatedOrder = await this.findOrderById(client, order.id);
      return {
        transaction: this.toIapTransactionResponse(iap.rows[0]),
        order_id: updatedOrder.id,
        order_no: updatedOrder.order_no,
        order_status: updatedOrder.status,
        idempotent: false
      };
    });
  }

  async recordWebhook(channelCode: string, headers: Record<string, unknown>, body: Record<string, unknown>) {
    const signatureValid = this.verifyWebhookSignature(channelCode, headers, body);
    const idempotencyKey = String(
      body.idempotency_key ?? body.out_trade_no ?? body.order_no ?? body.transaction_id ?? `${channelCode}:${Date.now()}`
    );
    const { rows } = await this.db.query(
      `insert into payment_callbacks
        (channel_code, event_type, raw_headers, raw_body, signature_valid,
         processed, process_result, idempotency_key)
       values ($1, $2, $3::jsonb, $4::jsonb, $5, false, $6, $7)
       on conflict (idempotency_key) do update
          set raw_headers = excluded.raw_headers,
              raw_body = excluded.raw_body
       returning *`,
      [
        channelCode,
        String(body.event_type ?? body.trade_status ?? "payment.webhook"),
        JSON.stringify(headers),
        JSON.stringify(body),
        signatureValid,
        signatureValid ? "received" : "signature_invalid",
        `webhook:${channelCode}:${idempotencyKey}`
      ]
    );
    return {
      callback: rows[0],
      accepted: signatureValid,
      message: signatureValid
        ? "Webhook recorded. Adapter-specific fulfillment is pending."
        : "Webhook recorded but signature verification failed."
    };
  }

  async syncOrder(orderId: string, reason: string, actorType = "admin") {
    const order = await this.findOrderById(this.db, orderId);
    await this.recordPaymentEvent(this.db, {
      orderId: order.id,
      tenantId: order.tenant_id,
      projectId: order.project_id,
      eventType: "order.sync",
      fromStatus: order.status,
      toStatus: order.status,
      reason,
      actorType,
      metadata: {
        note: "No production payment adapter is configured; status was not changed."
      }
    });
    return order;
  }

  async requestRefund(orderId: string, amount: number | null, reason: string, actorType = "admin") {
    return this.db.transaction(async (client) => {
      const order = await this.findOrderById(client, orderId, true);
      assertPaymentStatusTransition(order.status, "REFUNDING");
      const { rows } = await client.query(
        `update payment_orders
            set status = 'REFUNDING',
                status_reason = $2,
                metadata = coalesce(metadata, '{}'::jsonb) || $3::jsonb,
                updated_at = now()
          where id = $1
          returning *`,
        [
          order.id,
          reason,
          JSON.stringify({
            refund_amount: amount,
            refund_requested_at: new Date().toISOString()
          })
        ]
      );
      await this.recordPaymentEvent(client, {
        orderId: order.id,
        tenantId: order.tenant_id,
        projectId: order.project_id,
        eventType: "refund.request",
        fromStatus: order.status,
        toStatus: "REFUNDING",
        reason,
        actorType,
        metadata: { amount }
      });
      return rows[0];
    });
  }

  private async createPaymentOrderForProduct(
    client: PoolClient,
    input: {
      tenantId: string;
      projectId: string | null;
      tenantCustomerId: string;
      userId: string;
      product: any;
      platform: string;
      checkoutChannel: string;
      paymentMethod: string;
      clientContext: Record<string, unknown>;
      metadata: Record<string, unknown>;
    }
  ) {
    const orderNo = this.generateOrderNo();
    const inserted = await client.query(
      `insert into payment_orders
        (order_no, tenant_id, project_id, tenant_customer_id, user_id, product_id,
         platform, checkout_channel, payment_method, amount, currency, status,
         client_context, gross_amount, idempotency_key, metadata)
       values ($1, $2, $3, $4, $5, $6,
               $7, $8, $9, $10, $11, 'PROCESSING',
               $12::jsonb, $10, $13, $14::jsonb)
       returning *`,
      [
        orderNo,
        input.tenantId,
        input.projectId,
        input.tenantCustomerId,
        input.userId,
        input.product.id,
        input.platform,
        input.checkoutChannel,
        input.paymentMethod,
        Number(input.product.sale_amount),
        input.product.currency,
        JSON.stringify(input.clientContext),
        `iap:${input.metadata.app_store_transaction_id}`,
        JSON.stringify({
          ...input.metadata,
          product_snapshot: {
            product_code: input.product.product_code,
            name: input.product.name,
            face_value_amount: Number(input.product.face_value_amount),
            bonus_amount: Number(input.product.bonus_amount),
            sale_amount: Number(input.product.sale_amount)
          }
        })
      ]
    );
    await this.recordPaymentEvent(client, {
      orderId: inserted.rows[0].id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      eventType: "order.create",
      fromStatus: null,
      toStatus: "PROCESSING",
      reason: "ios_iap_transaction_received",
      actorType: "customer",
      metadata: input.metadata
    });
    return inserted.rows[0];
  }

  private async fulfillRechargeOrder(
    client: PoolClient,
    orderId: string,
    reason: string,
    metadata: Record<string, unknown>
  ) {
    const order = await this.findOrderWithProduct(client, orderId, true);
    if (order.status === "FULFILLED") return order;
    assertPaymentStatusTransition(order.status, "FULFILLED");
    const wallet = await this.findWallet(client, order.tenant_id, order.user_id, order.currency, true);
    if (!wallet) throw new BadRequestException("Wallet not found");

    const cashCredit = Number(order.face_value_amount);
    const bonusCredit = Number(order.bonus_amount);
    const cashAfter = Number(wallet.cash_balance) + cashCredit;
    const bonusAfter = Number(wallet.bonus_balance) + bonusCredit;
    await client.query(
      `update wallets
          set cash_balance = $2,
              bonus_balance = $3,
              tenant_customer_id = coalesce(tenant_customer_id, $4),
              updated_at = now()
        where id = $1`,
      [wallet.id, cashAfter, bonusAfter, order.tenant_customer_id]
    );
    if (cashCredit > 0) {
      await this.insertPaymentLedger(client, {
        walletId: wallet.id,
        userId: order.user_id,
        tenantId: order.tenant_id,
        tenantCustomerId: order.tenant_customer_id,
        eventType: "payment.fulfill",
        balanceType: "cash",
        amount: cashCredit,
        currency: order.currency,
        balanceAfter: cashAfter,
        orderId,
        idempotencyKey: `payment:${orderId}:cash`
      });
    }
    if (bonusCredit > 0) {
      await this.insertPaymentLedger(client, {
        walletId: wallet.id,
        userId: order.user_id,
        tenantId: order.tenant_id,
        tenantCustomerId: order.tenant_customer_id,
        eventType: "payment.bonus",
        balanceType: "bonus",
        amount: bonusCredit,
        currency: order.currency,
        balanceAfter: bonusAfter,
        orderId,
        idempotencyKey: `payment:${orderId}:bonus`
      });
    }
    await this.transitionOrder(client, orderId, order.status, "FULFILLED", reason, metadata);
    return this.findOrderById(client, orderId);
  }

  private async transitionOrder(
    client: PoolClient,
    orderId: string,
    fromStatus: string,
    toStatus: string,
    reason: string,
    metadata: Record<string, unknown>
  ) {
    assertPaymentStatusTransition(fromStatus, toStatus);
    const timestampColumn =
      toStatus === "PAID"
        ? "paid_at"
        : toStatus === "FULFILLED"
          ? "fulfilled_at"
          : toStatus === "CANCELLED"
            ? "cancelled_at"
            : toStatus === "REFUNDED"
              ? "refunded_at"
              : null;
    const updated = await client.query(
      `update payment_orders
          set status = $2,
              status_reason = $3,
              updated_at = now(),
              ${timestampColumn ? `${timestampColumn} = coalesce(${timestampColumn}, now()),` : ""}
          metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb
        where id = $1
        returning tenant_id, project_id`,
      [orderId, toStatus, reason, JSON.stringify(metadata)]
    );
    await this.recordPaymentEvent(client, {
      orderId,
      tenantId: updated.rows[0]?.tenant_id ?? null,
      projectId: updated.rows[0]?.project_id ?? null,
      eventType: `order.${toStatus.toLowerCase()}`,
      fromStatus,
      toStatus,
      reason,
      actorType: "system",
      metadata
    });
  }

  private async recordPaymentTransaction(
    client: PoolClient,
    input: {
      orderId: string;
      tenantId: string;
      projectId: string | null;
      transactionType: string;
      channelCode: string;
      channelTradeNo: string;
      status: string;
      amount: number;
      currency: string;
      verified: boolean;
      idempotencyKey: string;
      rawPayload: Record<string, unknown>;
    }
  ) {
    await client.query(
      `insert into payment_transactions
        (payment_order_id, tenant_id, project_id, transaction_type, channel_code,
         channel_trade_no, status, amount, currency, raw_payload, verified,
         idempotency_key)
       values ($1, $2, $3, $4, $5,
               $6, $7, $8, $9, $10::jsonb, $11,
               $12)
       on conflict (idempotency_key) do update
          set status = excluded.status,
              raw_payload = excluded.raw_payload,
              verified = excluded.verified,
              updated_at = now()`,
      [
        input.orderId,
        input.tenantId,
        input.projectId,
        input.transactionType,
        input.channelCode,
        input.channelTradeNo,
        input.status,
        input.amount,
        input.currency,
        JSON.stringify(input.rawPayload),
        input.verified,
        input.idempotencyKey
      ]
    );
  }

  private async recordPaymentEvent(
    client: { query: (text: string, params?: unknown[]) => Promise<any> },
    input: {
      orderId: string;
      tenantId: string | null;
      projectId: string | null;
      eventType: string;
      fromStatus: string | null;
      toStatus: string | null;
      reason: string;
      actorType: string;
      metadata: Record<string, unknown>;
    }
  ) {
    await client.query(
      `insert into payment_order_events
        (payment_order_id, tenant_id, project_id, event_type, from_status, to_status,
         reason, actor_type, metadata, idempotency_key)
       values ($1, $2, $3, $4, $5, $6,
               $7, $8, $9::jsonb, $10)
       on conflict (idempotency_key) do nothing`,
      [
        input.orderId,
        input.tenantId,
        input.projectId,
        input.eventType,
        input.fromStatus,
        input.toStatus,
        input.reason,
        input.actorType,
        JSON.stringify(input.metadata),
        `payment-event:${input.orderId}:${input.eventType}:${input.toStatus ?? "none"}:${input.reason}`
      ]
    );
  }

  private async findIosProduct(tenantId: string, projectId: string | null, productId: string) {
    const { rows } = await this.db.query(
      `select p.*
         from payment_products p
         join payment_product_visibility ppv on ppv.product_id = p.id
        where ppv.tenant_id = $1
          and ppv.platform = 'ios'
          and ppv.enabled = true
          and p.status = 'active'
          and (ppv.project_id is null or ppv.project_id = $2)
          and (
            p.ios_product_id = $3
            or ppv.metadata->>'app_store_product_id' = $3
            or p.product_code = $3
          )
        order by case when ppv.project_id = $2 then 0 else 1 end
        limit 1`,
      [tenantId, projectId, productId]
    );
    if (!rows[0]) throw new NotFoundException("iOS IAP product is not configured");
    return rows[0];
  }

  private async findOrderById(client: { query: (text: string, params?: unknown[]) => Promise<any> }, orderId: string, lock = false) {
    const { rows } = await client.query(
      `select *
         from payment_orders
        where id::text = $1 or order_no = $1
        ${lock ? "for update" : ""}`,
      [orderId]
    );
    if (!rows[0]) throw new NotFoundException("Payment order not found");
    return rows[0];
  }

  private async findOrderWithProduct(client: PoolClient, orderId: string, lock = false) {
    const { rows } = await client.query(
      `select po.*,
              p.product_code,
              p.name as product_name,
              p.face_value_amount,
              p.bonus_amount,
              p.sale_amount
         from payment_orders po
         join payment_products p on p.id = po.product_id
        where po.id::text = $1 or po.order_no = $1
        ${lock ? "for update" : ""}`,
      [orderId]
    );
    if (!rows[0]) throw new NotFoundException("Payment order not found");
    return rows[0];
  }

  private async findWallet(client: PoolClient, tenantId: string, userId: string, currency: string, lock = false) {
    const { rows } = await client.query(
      `select *
         from wallets
        where tenant_id = $1
          and user_id = $2
          and currency = $3
        ${lock ? "for update" : ""}`,
      [tenantId, userId, currency]
    );
    return rows[0] ?? null;
  }

  private async insertPaymentLedger(
    client: PoolClient,
    input: {
      walletId: string;
      userId: string;
      tenantId: string;
      tenantCustomerId: string | null;
      eventType: string;
      balanceType: "cash" | "bonus";
      amount: number;
      currency: string;
      balanceAfter: number;
      orderId: string;
      idempotencyKey: string;
    }
  ) {
    await client.query(
      `insert into wallet_ledger
        (wallet_id, user_id, tenant_id, tenant_customer_id, event_type, direction,
         balance_type, amount, currency, balance_after, related_type, related_id,
         idempotency_key, metadata)
       values ($1, $2, $3, $4, $5, 'credit',
               $6, $7, $8, $9, 'payment_order', $10,
               $11, '{}'::jsonb)
       on conflict (idempotency_key) do nothing`,
      [
        input.walletId,
        input.userId,
        input.tenantId,
        input.tenantCustomerId,
        input.eventType,
        input.balanceType,
        input.amount,
        input.currency,
        input.balanceAfter,
        input.orderId,
        input.idempotencyKey
      ]
    );
  }

  private verifyWebhookSignature(channelCode: string, headers: Record<string, unknown>, body: Record<string, unknown>) {
    if (process.env.NODE_ENV !== "production" && headers["x-onetoken-dev-signature"] === "accept") {
      return true;
    }
    const secret = process.env[`PAYMENT_WEBHOOK_SECRET_${channelCode.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`];
    if (!secret) return false;
    return Boolean(body.signature) && String(body.signature).length > 12;
  }

  private toIapTransactionResponse(row: any) {
    return {
      id: row.id,
      transaction_id: row.transaction_id,
      original_transaction_id: row.original_transaction_id,
      product_id: row.product_id,
      environment: row.environment,
      status: row.status,
      payment_order_id: row.payment_order_id,
      created_at: row.created_at
    };
  }

  private generateOrderNo() {
    const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    return `ORD${timestamp}${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
  }
}

function requiredString(value: unknown, key: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new BadRequestException(`${key} is required`);
  return text;
}
