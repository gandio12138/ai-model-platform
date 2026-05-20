import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { PublicRequestUser } from "../public/public-auth.guard.js";
import { PublicService } from "../public/public.service.js";
import { PaymentAdapterRegistry } from "./adapters/payment-adapter.registry.js";
import {
  NormalizedPaymentEvent,
  NormalizedRefundState,
  PaymentAdapterUnavailableError,
  PaymentVerificationError,
  PreparedPayment
} from "./adapters/payment-adapter.js";
import { PaymentConfigService } from "./payment-config.service.js";
import { assertPaymentStatusTransition } from "./payment-state.js";

@Injectable()
export class PaymentService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PublicService) private readonly publicService: PublicService,
    @Inject(PaymentAdapterRegistry) private readonly adapters: PaymentAdapterRegistry,
    @Inject(PaymentConfigService) private readonly paymentConfig: PaymentConfigService
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

  async prepareCustomerOrder(user: PublicRequestUser, orderNo: string) {
    const order = await this.findCustomerOrderWithProductAndChannel(user.id, orderNo);
    if (!order) throw new NotFoundException("Payment order not found");
    const adapter = this.adapters.resolve({
      channelCode: order.channel_code ?? order.checkout_channel,
      paymentMethod: order.payment_method
    });
    if (!adapter) return this.toPaymentOrderResponse(order);

    let prepared: PreparedPayment;
    try {
      prepared = await adapter.prepare({
        order: order as any,
        channel: order.channel_code ? order as any : null,
        product: order as any
      });
    } catch (error) {
      if (error instanceof PaymentAdapterUnavailableError && this.paymentConfig.mockEnabled && !this.paymentConfig.isProduction) {
        prepared = this.mockPreparedPayment(order);
      } else {
        throw error;
      }
    }

    const { rows } = await this.db.query(
      `update payment_orders
          set status = case when status in ('CREATED', 'PENDING', 'PROCESSING') then 'PAYING' else status end,
              qr_content = $2,
              qr_expires_at = $3,
              payment_action = $4::jsonb,
              metadata = coalesce(metadata, '{}'::jsonb) || $5::jsonb,
              updated_at = now()
        where id = $1
        returning *`,
      [
        order.id,
        prepared.qr_content ?? null,
        prepared.expires_at ?? null,
        JSON.stringify(prepared),
        JSON.stringify({ payment_prepare_provider: prepared.provider })
      ]
    );
    await this.recordPaymentEvent(this.db, {
      orderId: order.id,
      tenantId: order.tenant_id,
      projectId: order.project_id,
      eventType: "order.prepare",
      fromStatus: order.status,
      toStatus: rows[0].status,
      reason: `${prepared.provider}_prepare`,
      actorType: "customer",
      metadata: { provider: prepared.provider, type: prepared.type }
    });
    return this.toPaymentOrderResponse({
      ...order,
      ...rows[0],
      payment_action: prepared
    });
  }

  async syncCustomerOrder(user: PublicRequestUser, orderNo: string) {
    const order = await this.findCustomerOrderWithProductAndChannel(user.id, orderNo);
    if (!order) throw new NotFoundException("Payment order not found");
    return this.syncOrderWithAdapter(order, "customer_sync", "customer");
  }

  async recordWebhook(
    channelCode: string,
    headers: Record<string, unknown>,
    body: Record<string, unknown>,
    rawBody?: string
  ) {
    const adapter = this.adapters.resolve({ channelCode, paymentMethod: channelCode });
    const provider = channelCode.includes("wechat") ? "wechat" : channelCode.includes("alipay") ? "alipay" : channelCode;
    if (!adapter) {
      await this.recordFailedCallback(channelCode, headers, body, rawBody, "adapter_not_configured");
      return { ok: false, provider, message: "Payment adapter is not configured" };
    }
    try {
      const event = await adapter.verifyAndParseNotification({ channelCode, headers, body, rawBody });
      if ("refundNo" in event) {
        await this.handleVerifiedRefundEvent(channelCode, headers, body, rawBody, event);
      } else {
        await this.handleVerifiedPaymentEvent(channelCode, headers, body, rawBody, event);
      }
      return { ok: true, provider, message: "processed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      await this.recordFailedCallback(channelCode, headers, body, rawBody, message);
      return {
        ok: false,
        provider,
        message: error instanceof PaymentVerificationError ? message : "Webhook processing failed"
      };
    }
  }

  async syncOrder(orderId: string, reason: string, actorType = "admin") {
    const order = await this.findOrderWithProductAndChannel(this.db, orderId);
    return this.syncOrderWithAdapter(order, reason, actorType);
  }

  async requestRefund(orderId: string, amount: number | null, reason: string, actorType = "admin") {
    return this.db.transaction(async (client) => {
      const order = await this.findOrderWithProductAndChannel(client, orderId, true);
      assertPaymentStatusTransition(order.status, "REFUNDING");
      const refundAmount = amount ?? Number(order.amount);
      if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
        throw new BadRequestException("refund amount must be positive");
      }
      if (refundAmount > Number(order.amount) - Number(order.refunded_amount ?? 0)) {
        throw new BadRequestException("refund amount exceeds refundable amount");
      }
      const refundNo = `RF${order.order_no}${Date.now().toString().slice(-6)}`;
      const refund = await client.query(
        `insert into payment_refunds
          (payment_order_id, tenant_id, project_id, tenant_customer_id, user_id,
           refund_no, channel_code, amount, currency, status, reason,
           requested_by, idempotency_key, raw_request)
         values ($1, $2, $3, $4, $5,
                 $6, $7, $8, $9, 'REQUESTED', $10,
                 null, $11, $12::jsonb)
         on conflict (idempotency_key) do update
            set updated_at = now()
         returning *`,
        [
          order.id,
          order.tenant_id,
          order.project_id,
          order.tenant_customer_id,
          order.user_id,
          refundNo,
          order.payment_method,
          refundAmount,
          order.currency,
          reason,
          `refund:${order.id}:${refundAmount}`,
          JSON.stringify({ reason, actor_type: actorType })
        ]
      );
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
            refund_amount: refundAmount,
            refund_id: refund.rows[0].id,
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
        metadata: { amount: refundAmount, refund_id: refund.rows[0].id }
      });
      const adapter = this.adapters.resolve({
        channelCode: order.channel_code ?? order.checkout_channel,
        paymentMethod: order.payment_method
      });
      if (!adapter) {
        return { ...rows[0], refund: refund.rows[0] };
      }
      const state = await adapter.refund({ order, refund: refund.rows[0] });
      await client.query(
        `update payment_refunds
            set status = $2,
                provider_refund_no = $3,
                raw_response = $4::jsonb,
                updated_at = now()
          where id = $1`,
        [
          refund.rows[0].id,
          state.refundState === "SUCCESS" ? "PROCESSING" : state.refundState,
          state.providerRefundNo ?? null,
          JSON.stringify(state.raw ?? {})
        ]
      );
      if (state.refundState === "SUCCESS") {
        await this.handleVerifiedRefundStateInTransaction(client, state);
      }
      return { ...rows[0], refund: { ...refund.rows[0], status: state.refundState } };
    });
  }

  private async syncOrderWithAdapter(order: any, reason: string, actorType: string) {
    const adapter = this.adapters.resolve({
      channelCode: order.channel_code ?? order.checkout_channel,
      paymentMethod: order.payment_method
    });
    if (!adapter) {
      await this.recordPaymentEvent(this.db, {
        orderId: order.id,
        tenantId: order.tenant_id,
        projectId: order.project_id,
        eventType: "order.sync",
        fromStatus: order.status,
        toStatus: order.status,
        reason,
        actorType,
        metadata: { note: "No production payment adapter is configured; status was not changed." }
      });
      return this.toPaymentOrderResponse(order);
    }
    const event = await adapter.query({ order });
    if (event.tradeState === "SUCCESS") {
      await this.handleVerifiedPaymentEvent(order.payment_method, {}, {}, undefined, event);
      const updated = await this.findOrderWithProductAndChannel(this.db, order.id);
      return this.toPaymentOrderResponse(updated);
    }
    await this.recordPaymentEvent(this.db, {
      orderId: order.id,
      tenantId: order.tenant_id,
      projectId: order.project_id,
      eventType: "order.sync",
      fromStatus: order.status,
      toStatus: order.status,
      reason,
      actorType,
      metadata: { provider_state: event.tradeState, raw: event.raw }
    });
    return this.toPaymentOrderResponse(order);
  }

  private async handleVerifiedPaymentEvent(
    channelCode: string,
    headers: Record<string, unknown>,
    body: Record<string, unknown>,
    rawBody: string | undefined,
    event: NormalizedPaymentEvent
  ) {
    await this.db.transaction(async (client) => {
      const order = await this.findOrderWithProductAndChannel(client, event.orderNo, true);
      await this.insertPaymentCallback(client, {
        channelCode,
        orderId: order.id,
        tenantId: order.tenant_id,
        eventType: "payment.notify",
        providerEventId: event.eventId,
        headers,
        body,
        rawBody,
        signatureValid: true,
        processed: false,
        processResult: "verified",
        normalizedEvent: event
      });
      if (Number(order.amount) !== event.amount) {
        throw new PaymentVerificationError("Payment amount mismatch");
      }
      await client.query(
        `update payment_orders
            set provider_trade_no = coalesce(provider_trade_no, $2),
                provider_order_status = $3,
                paid_amount = case when $3 = 'SUCCESS' then $4 else paid_amount end,
                updated_at = now()
          where id = $1`,
        [order.id, event.providerTradeNo ?? null, event.tradeState, event.amount]
      );
      if (event.tradeState !== "SUCCESS") {
        await this.markCallbackProcessed(client, channelCode, event.eventId, "ignored_non_success");
        return;
      }
      await this.recordPaymentTransaction(client, {
        orderId: order.id,
        tenantId: order.tenant_id,
        projectId: order.project_id,
        transactionType: "payment",
        channelCode,
        channelTradeNo: event.providerTradeNo ?? event.eventId,
        status: event.tradeState,
        amount: event.amount,
        currency: event.currency,
        verified: true,
        idempotencyKey: `pay:${channelCode}:${event.eventId}`,
        rawPayload: event.raw as Record<string, unknown>
      });
      if (order.status !== "PAID" && order.status !== "FULFILLED") {
        await this.transitionOrder(client, order.id, order.status, "PAID", `${event.provider}_verified`, {
          provider_trade_no: event.providerTradeNo ?? null,
          event_id: event.eventId
        });
      }
      await this.fulfillRechargeOrder(client, order.id, `${event.provider}_fulfillment`, {
        event_id: event.eventId,
        provider_trade_no: event.providerTradeNo ?? null
      });
      await this.markCallbackProcessed(client, channelCode, event.eventId, "fulfilled");
    });
  }

  private async handleVerifiedRefundEvent(
    channelCode: string,
    headers: Record<string, unknown>,
    body: Record<string, unknown>,
    rawBody: string | undefined,
    event: NormalizedRefundState
  ) {
    await this.db.transaction(async (client) => {
      await this.insertPaymentCallback(client, {
        channelCode,
        orderId: null,
        tenantId: null,
        eventType: "refund.notify",
        providerEventId: event.eventId,
        headers,
        body,
        rawBody,
        signatureValid: true,
        processed: false,
        processResult: "verified",
        normalizedEvent: event
      });
      if (event.refundState === "SUCCESS") {
        await this.handleVerifiedRefundStateInTransaction(client, event);
      }
      await this.markCallbackProcessed(client, channelCode, event.eventId, event.refundState.toLowerCase());
    });
  }

  private async handleVerifiedRefundStateInTransaction(client: PoolClient, event: NormalizedRefundState) {
    const refundRows = await client.query(
      `select * from payment_refunds where refund_no = $1 for update`,
      [event.refundNo]
    );
    const refund = refundRows.rows[0];
    if (!refund) throw new NotFoundException("Payment refund not found");
    if (refund.status === "SUCCEEDED") return;
    const order = await this.findOrderWithProduct(client, refund.payment_order_id, true);
    if (Number(refund.amount) !== event.amount) {
      throw new PaymentVerificationError("Refund amount mismatch");
    }
    await this.reverseWalletForRefund(client, order, refund);
    await client.query(
      `update payment_refunds
          set status = 'SUCCEEDED',
              provider_refund_no = coalesce(provider_refund_no, $2),
              raw_response = $3::jsonb,
              succeeded_at = coalesce(succeeded_at, now()),
              updated_at = now()
        where id = $1`,
      [refund.id, event.providerRefundNo ?? null, JSON.stringify(event.raw ?? {})]
    );
    await client.query(
      `update payment_orders
          set status = 'REFUNDED',
              refunded_amount = coalesce(refunded_amount, 0) + $2,
              refunded_at = coalesce(refunded_at, now()),
              updated_at = now()
        where id = $1`,
      [order.id, Number(refund.amount)]
    );
    await this.recordPaymentEvent(client, {
      orderId: order.id,
      tenantId: order.tenant_id,
      projectId: order.project_id,
      eventType: "refund.succeeded",
      fromStatus: order.status,
      toStatus: "REFUNDED",
      reason: "refund_confirmed",
      actorType: "system",
      metadata: { refund_id: refund.id, refund_no: refund.refund_no }
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
    await this.upsertTenantRevenueShare(client, orderId, metadata);
    await this.transitionOrder(client, orderId, order.status, "FULFILLED", reason, metadata);
    return this.findOrderById(client, orderId);
  }

  private async upsertTenantRevenueShare(
    client: PoolClient,
    orderId: string,
    metadata: Record<string, unknown>
  ) {
    await client.query(
      `with source as (
         select po.id as payment_order_id,
                po.tenant_id,
                po.amount as gross_amount,
                t.billing_mode,
                coalesce(rule.revenue_share_rate, 0)::numeric as revenue_share_rate,
                coalesce(
                  po.channel_fee_actual,
                  po.channel_fee_estimate,
                  ceil(po.amount * coalesce(pc.fee_rate_bps, 0)::numeric / 10000)::bigint,
                  0
                ) as channel_fee
           from payment_orders po
           join tenants t on t.id = po.tenant_id
           left join payment_channels pc
             on pc.tenant_id = po.tenant_id
            and (pc.project_id is null or pc.project_id = po.project_id)
            and pc.platform = po.platform
            and (pc.channel_code = po.checkout_channel or pc.payment_method = po.payment_method)
           left join lateral (
             select revenue_share_rate
               from tenant_billing_rules
              where (tenant_id = po.tenant_id or tenant_id is null)
                and status = 'published'
                and effective_from <= now()
                and (effective_to is null or effective_to > now())
              order by tenant_id nulls last, effective_from desc
              limit 1
           ) rule on true
          where po.id = $1
       ),
       calculated as (
         select payment_order_id,
                tenant_id,
                billing_mode,
                gross_amount,
                least(channel_fee, gross_amount) as channel_fee,
                case
                  when billing_mode = 'revenue_share'
                    then floor(greatest(gross_amount - least(channel_fee, gross_amount), 0) * revenue_share_rate)::bigint
                  else 0
                end as tenant_share,
                revenue_share_rate
           from source
       )
       insert into tenant_revenue_share_records
         (tenant_id, payment_order_id, status, payment_gross_amount, payment_channel_fee,
          provider_cost_amount, platform_share_amount, tenant_share_amount, revenue_share_rate, metadata)
       select tenant_id,
              payment_order_id,
              case when billing_mode = 'revenue_share' then 'pending' else 'settled' end,
              gross_amount,
              channel_fee,
              0,
              greatest(gross_amount - channel_fee - tenant_share, 0),
              tenant_share,
              revenue_share_rate,
              jsonb_build_object(
                'source', 'payment_fulfillment',
                'billing_mode', billing_mode,
                'fulfillment_metadata', $2::jsonb
              )
         from calculated
       on conflict (payment_order_id) do update
          set status = excluded.status,
              payment_gross_amount = excluded.payment_gross_amount,
              payment_channel_fee = excluded.payment_channel_fee,
              platform_share_amount = excluded.platform_share_amount,
              tenant_share_amount = excluded.tenant_share_amount,
              revenue_share_rate = excluded.revenue_share_rate,
              metadata = coalesce(tenant_revenue_share_records.metadata, '{}'::jsonb) || excluded.metadata,
              updated_at = now()`,
      [orderId, JSON.stringify(metadata ?? {})]
    );
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

  private async findOrderWithProductAndChannel(
    client: { query: (text: string, params?: unknown[]) => Promise<any> },
    orderId: string,
    lock = false
  ) {
    const { rows } = await client.query(
      `select po.*,
              p.product_code,
              p.name as product_name,
              p.face_value_amount,
              p.bonus_amount,
              p.sale_amount,
              pc.channel_code,
              pc.channel_type,
              pc.display_name as channel_display_name,
              pc.config as channel_config
         from payment_orders po
         left join payment_products p on p.id = po.product_id
         left join payment_channels pc
           on pc.tenant_id = po.tenant_id
          and pc.platform = po.platform
          and (pc.project_id is null or pc.project_id = po.project_id)
          and (pc.payment_method = po.payment_method or pc.channel_code = po.checkout_channel)
        where po.id::text = $1 or po.order_no = $1
        order by case when pc.project_id = po.project_id then 0 else 1 end
        limit 1
        ${lock ? "for update of po" : ""}`,
      [orderId]
    );
    if (!rows[0]) throw new NotFoundException("Payment order not found");
    return rows[0];
  }

  private async findCustomerOrderWithProductAndChannel(userId: string, orderId: string) {
    const { rows } = await this.db.query(
      `select po.*,
              p.product_code,
              p.name as product_name,
              p.face_value_amount,
              p.bonus_amount,
              p.sale_amount,
              pc.channel_code,
              pc.channel_type,
              pc.display_name as channel_display_name,
              pc.config as channel_config
         from payment_orders po
         left join payment_products p on p.id = po.product_id
         left join payment_channels pc
           on pc.tenant_id = po.tenant_id
          and pc.platform = po.platform
          and (pc.project_id is null or pc.project_id = po.project_id)
          and (pc.payment_method = po.payment_method or pc.channel_code = po.checkout_channel)
        where (po.id::text = $1 or po.order_no = $1)
          and po.user_id = $2
        order by case when pc.project_id = po.project_id then 0 else 1 end
        limit 1`,
      [orderId, userId]
    );
    return rows[0] ?? null;
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

  private async insertPaymentDebitLedger(
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
      refundId: string;
      idempotencyKey: string;
    }
  ) {
    await client.query(
      `insert into wallet_ledger
        (wallet_id, user_id, tenant_id, tenant_customer_id, event_type, direction,
         balance_type, amount, currency, balance_after, related_type, related_id,
         idempotency_key, metadata)
       values ($1, $2, $3, $4, $5, 'debit',
               $6, $7, $8, $9, 'payment_refund', $10,
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
        input.refundId,
        input.idempotencyKey
      ]
    );
  }

  private async reverseWalletForRefund(client: PoolClient, order: any, refund: any) {
    const wallet = await this.findWallet(client, order.tenant_id, order.user_id, order.currency, true);
    if (!wallet) throw new BadRequestException("Wallet not found");
    const ratio = Math.min(Number(refund.amount) / Number(order.amount), 1);
    const cashDebit = Math.round(Number(order.face_value_amount ?? order.amount) * ratio);
    const bonusDebit = Math.round(Number(order.bonus_amount ?? 0) * ratio);
    const cashAfter = Number(wallet.cash_balance) - cashDebit;
    const bonusAfter = Number(wallet.bonus_balance) - bonusDebit;
    await client.query(
      `update wallets
          set cash_balance = $2,
              bonus_balance = $3,
              updated_at = now()
        where id = $1`,
      [wallet.id, cashAfter, bonusAfter]
    );
    if (cashDebit > 0) {
      await this.insertPaymentDebitLedger(client, {
        walletId: wallet.id,
        userId: order.user_id,
        tenantId: order.tenant_id,
        tenantCustomerId: order.tenant_customer_id,
        eventType: "payment.refund",
        balanceType: "cash",
        amount: cashDebit,
        currency: order.currency,
        balanceAfter: cashAfter,
        refundId: refund.id,
        idempotencyKey: `refund:${refund.id}:cash`
      });
    }
    if (bonusDebit > 0) {
      await this.insertPaymentDebitLedger(client, {
        walletId: wallet.id,
        userId: order.user_id,
        tenantId: order.tenant_id,
        tenantCustomerId: order.tenant_customer_id,
        eventType: "payment.refund_bonus",
        balanceType: "bonus",
        amount: bonusDebit,
        currency: order.currency,
        balanceAfter: bonusAfter,
        refundId: refund.id,
        idempotencyKey: `refund:${refund.id}:bonus`
      });
    }
  }

  private async insertPaymentCallback(
    client: PoolClient,
    input: {
      channelCode: string;
      orderId: string | null;
      tenantId: string | null;
      eventType: string;
      providerEventId: string;
      headers: Record<string, unknown>;
      body: Record<string, unknown>;
      rawBody?: string;
      signatureValid: boolean;
      processed: boolean;
      processResult: string;
      normalizedEvent: unknown;
    }
  ) {
    await client.query(
      `insert into payment_callbacks
        (payment_order_id, tenant_id, channel_code, event_type, provider_event_id,
         raw_headers, raw_body, raw_body_text, signature_valid, verified_at,
         processed, process_result, processed_at, normalized_event, idempotency_key)
       values ($1, $2, $3, $4, $5,
               $6::jsonb, $7::jsonb, $8, $9, case when $9 then now() else null end,
               $10, $11, case when $10 then now() else null end, $12::jsonb, $13)
       on conflict (idempotency_key) do update
          set payment_order_id = coalesce(payment_callbacks.payment_order_id, excluded.payment_order_id),
              raw_headers = excluded.raw_headers,
              raw_body = excluded.raw_body,
              raw_body_text = excluded.raw_body_text,
              signature_valid = excluded.signature_valid,
              verified_at = excluded.verified_at,
              normalized_event = excluded.normalized_event`,
      [
        input.orderId,
        input.tenantId,
        input.channelCode,
        input.eventType,
        input.providerEventId,
        JSON.stringify(input.headers),
        JSON.stringify(input.body),
        input.rawBody ?? null,
        input.signatureValid,
        input.processed,
        input.processResult,
        JSON.stringify(input.normalizedEvent ?? {}),
        `webhook:${input.channelCode}:${input.providerEventId}`
      ]
    );
  }

  private async recordFailedCallback(
    channelCode: string,
    headers: Record<string, unknown>,
    body: Record<string, unknown>,
    rawBody: string | undefined,
    processError: string
  ) {
    await this.db.query(
      `insert into payment_callbacks
        (channel_code, event_type, provider_event_id, raw_headers, raw_body, raw_body_text,
         signature_valid, processed, process_result, process_error, idempotency_key)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6,
               false, false, 'failed', $7, $8)
       on conflict (idempotency_key) do update
          set process_error = excluded.process_error,
              raw_headers = excluded.raw_headers,
              raw_body = excluded.raw_body,
              raw_body_text = excluded.raw_body_text`,
      [
        channelCode,
        String(body.event_type ?? body.trade_status ?? "payment.webhook"),
        String(body.notify_id ?? body.transaction_id ?? body.out_trade_no ?? `${channelCode}:${Date.now()}`),
        JSON.stringify(headers),
        JSON.stringify(body),
        rawBody ?? null,
        processError,
        `webhook_failed:${channelCode}:${String(body.notify_id ?? body.transaction_id ?? body.out_trade_no ?? Date.now())}`
      ]
    );
  }

  private async markCallbackProcessed(client: PoolClient, channelCode: string, providerEventId: string, result: string) {
    await client.query(
      `update payment_callbacks
          set processed = true,
              processed_at = now(),
              process_result = $3
        where channel_code = $1
          and provider_event_id = $2`,
      [channelCode, providerEventId, result]
    );
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

  private mockPreparedPayment(order: any): PreparedPayment {
    const expiresAt = new Date(Date.now() + this.paymentConfig.orderExpireMinutes * 60_000).toISOString();
    return {
      type: "qr_code",
      provider: "mock",
      order_no: order.order_no,
      qr_content: `${this.paymentConfig.checkoutWebBaseUrl}/checkout/mock-pay?order_no=${encodeURIComponent(order.order_no)}`,
      expires_at: expiresAt,
      raw: { mock: true }
    };
  }

  private toPaymentOrderResponse(order: any) {
    const action = order.payment_action && Object.keys(order.payment_action).length
      ? order.payment_action
      : order.qr_content
        ? {
            type: "qr_code",
            provider: order.payment_method,
            order_no: order.order_no,
            qr_content: order.qr_content,
            expires_at: order.qr_expires_at
          }
        : null;
    return {
      id: order.id,
      order_no: order.order_no,
      product_id: order.product_id,
      product_code: order.product_code,
      product_name: order.product_name,
      amount: Number(order.amount),
      currency: order.currency,
      payment_method: order.payment_method,
      checkout_channel: order.checkout_channel,
      status: order.status,
      provider_trade_no: order.provider_trade_no ?? null,
      provider_order_status: order.provider_order_status ?? null,
      paid_at: order.paid_at,
      fulfilled_at: order.fulfilled_at,
      cancelled_at: order.cancelled_at,
      refunded_at: order.refunded_at,
      qr_expires_at: order.qr_expires_at,
      payment_action: action,
      metadata: order.metadata ?? {},
      created_at: order.created_at,
      updated_at: order.updated_at
    };
  }
}

function requiredString(value: unknown, key: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new BadRequestException(`${key} is required`);
  return text;
}
