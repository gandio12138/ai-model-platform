import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { parsePagination } from "../common/http.js";
import { DatabaseService } from "../database/database.service.js";
import { CustomerSessionService } from "./customer-session.service.js";
import { PublicRequestUser } from "./public-auth.guard.js";

type Platform = "ios" | "android" | "web" | "api";
type QueryExecutor = { query: (text: string, params?: unknown[]) => Promise<any> };

interface CheckoutContext {
  tenant: any;
  project: any;
  platform: Platform;
}

interface CustomerContext {
  tenant_customer: any;
  wallet: any;
}

interface CustomerUserRow {
  id: string;
  email: string;
  phone: string | null;
  password_hash: string | null;
  user_type: string;
}

const platforms: Platform[] = ["ios", "android", "web", "api"];

@Injectable()
export class PublicService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(CustomerSessionService) private readonly sessions: CustomerSessionService
  ) {}

  async register(body: Record<string, unknown>) {
    const email = this.normalizeEmail(body.email);
    const password = String(body.password ?? "");
    if (!email) {
      throw new BadRequestException("Email is required");
    }
    if (password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }

    const context = await this.resolveCheckoutContext(body);
    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await this.db.query<{
      id: string;
      email: string;
      phone: string | null;
      password_hash: string | null;
      user_type: string;
    }>(
      `select id, email, phone, password_hash, user_type
         from users
        where email = $1
          and status = 'active'`,
      [email]
    );

    let user = existing.rows[0];
    if (user) {
      if (user.user_type === "admin" || user.user_type === "tenant") {
        throw new ConflictException("This email is already used by a management account");
      }
      if (user.password_hash) {
        throw new ConflictException("Email is already registered");
      }
      const updated = await this.db.query<CustomerUserRow>(
        `update users
            set password_hash = $2,
                user_type = 'consumer',
                updated_at = now()
          where id = $1
        returning id, email, phone, null::text as password_hash, user_type`,
        [user.id, passwordHash]
      );
      user = updated.rows[0];
    } else {
      const inserted = await this.db.query<CustomerUserRow>(
        `insert into users (email, password_hash, user_type, status)
         values ($1, $2, 'consumer', 'active')
        returning id, email, phone, null::text as password_hash, user_type`,
        [email, passwordHash]
      );
      user = inserted.rows[0];
    }

    const customerContext = await this.ensureCustomerContext(user.id, context);
    return this.toSessionResponse(user, context, customerContext);
  }

  async login(body: Record<string, unknown>) {
    const email = this.normalizeEmail(body.email);
    const password = String(body.password ?? "");
    if (!email || !password) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const { rows } = await this.db.query<{
      id: string;
      email: string;
      phone: string | null;
      password_hash: string | null;
      user_type: string;
      account_type: "admin" | "tenant" | "customer";
    }>(
      `select id,
              email,
              phone,
              password_hash,
              user_type,
              case
                when user_type = 'admin' then 'admin'
                when user_type = 'tenant' then 'tenant'
                else 'customer'
              end as account_type
         from users
        where email = $1
          and status = 'active'`,
      [email]
    );
    const user = rows[0];
    if (!user?.password_hash || user.account_type !== "customer") {
      throw new UnauthorizedException("Invalid email or password");
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const context = await this.resolveCheckoutContext(body);
    const customerContext = await this.ensureCustomerContext(user.id, context);
    return this.toSessionResponse(user, context, customerContext);
  }

  async me(user: PublicRequestUser, query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    const customerContext = await this.ensureCustomerContext(user.id, context);
    return {
      user: this.toPublicUserResponse(user),
      tenant: context.tenant,
      project: context.project,
      platform: context.platform,
      tenant_customer: customerContext.tenant_customer,
      wallet: this.toWalletResponse(customerContext.wallet)
    };
  }

  async updateProfile(user: PublicRequestUser, body: Record<string, unknown>) {
    const nextEmail =
      body.email === undefined ? user.email : this.normalizeEmail(body.email);
    if (!nextEmail) {
      throw new BadRequestException("Valid email is required");
    }
    const nextPhone =
      body.phone === undefined ? user.phone : this.normalizePhone(body.phone);

    const conflict = await this.db.query(
      `select id
         from users
        where id <> $1
          and status = 'active'
          and (email = $2 or ($3::text is not null and phone = $3))
        limit 1`,
      [user.id, nextEmail, nextPhone]
    );
    if (conflict.rows[0]) {
      throw new ConflictException("Email or phone is already used");
    }

    const { rows } = await this.db.query<CustomerUserRow>(
      `update users
          set email = $2,
              phone = $3,
              updated_at = now()
        where id = $1
      returning id, email, phone, null::text as password_hash, user_type`,
      [user.id, nextEmail, nextPhone]
    );
    return {
      user: this.toPublicUserResponse(rows[0])
    };
  }

  async updatePassword(user: PublicRequestUser, body: Record<string, unknown>) {
    const currentPassword = String(body.current_password ?? "");
    const newPassword = String(body.new_password ?? "");
    if (!currentPassword || newPassword.length < 8) {
      throw new BadRequestException("Current password and a new password of at least 8 characters are required");
    }
    const { rows } = await this.db.query<CustomerUserRow>(
      `select id, email, phone, password_hash, user_type
         from users
        where id = $1
          and status = 'active'`,
      [user.id]
    );
    const dbUser = rows[0];
    if (!dbUser?.password_hash) {
      throw new UnauthorizedException("Invalid current password");
    }
    const ok = await bcrypt.compare(currentPassword, dbUser.password_hash);
    if (!ok) {
      throw new UnauthorizedException("Invalid current password");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.db.query(
      `update users
          set password_hash = $2,
              updated_at = now()
        where id = $1`,
      [user.id, passwordHash]
    );
    return { ok: true };
  }

  async bootstrap(query: Record<string, unknown>) {
    const [products, paymentMethods] = await Promise.all([
      this.products(query),
      this.paymentMethods(query)
    ]);
    return {
      tenant: products.tenant,
      project: products.project,
      platform: products.platform,
      products: products.products,
      payment_methods: paymentMethods.payment_methods
    };
  }

  async products(query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    const rows = await this.db.query(
      `select *
         from (
           select distinct on (p.id)
                  p.id,
                  p.product_code,
                  p.name,
                  p.product_type,
                  p.face_value_amount,
                  p.bonus_amount,
                  p.sale_amount,
                  p.currency,
                  p.ios_product_id,
                  p.metadata as product_metadata,
                  ppv.platform,
                  ppv.project_id,
                  ppv.sort_order,
                  coalesce(ppv.display_name, p.name) as display_name,
                  ppv.display_description,
                  ppv.badge,
                  ppv.metadata as visibility_metadata
             from payment_product_visibility ppv
             join payment_products p on p.id = ppv.product_id
            where ppv.tenant_id = $1
              and ppv.platform = $2
              and ppv.enabled = true
              and p.status = 'active'
              and (ppv.project_id is null or ppv.project_id = $3)
            order by p.id,
                     case when ppv.project_id = $3 then 0 else 1 end,
                     ppv.sort_order asc
         ) visible
        order by sort_order asc, product_code asc`,
      [context.tenant.id, context.platform, context.project?.id ?? null]
    );
    const paymentMethods = await this.listPaymentMethods(context);
    return {
      tenant: context.tenant,
      project: context.project,
      platform: context.platform,
      products: rows.rows.map((row) =>
        this.toProductResponse(
          row,
          paymentMethods.map((method) => method.payment_method)
        )
      )
    };
  }

  async paymentMethods(query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    return {
      tenant: context.tenant,
      project: context.project,
      platform: context.platform,
      payment_methods: await this.listPaymentMethods(context)
    };
  }

  async models(query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    const { rows } = await this.db.query(
      `select m.id,
              m.public_model_code,
              m.display_name,
              m.model_family,
              m.modality,
              m.max_context_tokens,
              m.default_max_output_tokens,
              m.supports_stream,
              m.supports_tools,
              m.supports_json_mode,
              m.metadata as model_metadata,
              tma.rpm_limit,
              tma.tpm_limit,
              tma.daily_budget,
              tma.monthly_budget,
              tma.enabled_features,
              tmp.price_version,
              tmp.currency,
              tmp.pricing_mode,
              tmp.input_price_per_1k,
              tmp.output_price_per_1k
         from tenant_model_authorizations tma
         join models m on m.id = tma.model_id
         left join lateral (
           select price_version,
                  currency,
                  pricing_mode,
                  input_price_per_1k,
                  output_price_per_1k
             from tenant_model_prices
            where tenant_id = tma.tenant_id
              and model_id = tma.model_id
              and status = 'active'
              and effective_from <= now()
              and (effective_to is null or effective_to > now())
            order by effective_from desc, created_at desc
            limit 1
         ) tmp on true
        where tma.tenant_id = $1
          and tma.status = 'active'
          and m.status = 'active'
        order by m.model_family nulls last, m.display_name asc`,
      [context.tenant.id]
    );
    return {
      tenant: context.tenant,
      project: context.project,
      platform: context.platform,
      data: rows.map((row) => this.toModelResponse(row))
    };
  }

  async apiKeys(user: PublicRequestUser, query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    await this.ensureCustomerContext(user.id, context);
    const { rows } = await this.db.query(
      `select id,
              tenant_id,
              project_id,
              tenant_customer_id,
              user_id,
              name,
              key_prefix,
              key_suffix,
              status,
              model_whitelist,
              ip_whitelist,
              rpm_limit,
              tpm_limit,
              daily_budget,
              monthly_budget,
              expires_at,
              last_used_at,
              created_at,
              revoked_at
         from api_keys
        where tenant_id = $1
          and user_id = $2
          and (project_id is null or project_id = $3)
        order by created_at desc`,
      [context.tenant.id, user.id, context.project?.id ?? null]
    );
    return {
      tenant: context.tenant,
      project: context.project,
      platform: context.platform,
      data: rows.map((row) => this.toApiKeyResponse(row))
    };
  }

  async usageLogs(user: PublicRequestUser, query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    const customerContext = await this.ensureCustomerContext(user.id, context);
    const { page, pageSize, offset } = parsePagination(query);
    const projectId = context.project?.id ?? null;
    const baseParams = [
      context.tenant.id,
      user.id,
      customerContext.tenant_customer.id,
      projectId
    ];

    const [items, count, summary, trend] = await Promise.all([
      this.db.query(
        `select id,
                request_id,
                source,
                public_model_code,
                status,
                stream,
                coalesce(actual_prompt_tokens, estimated_prompt_tokens, 0) as prompt_tokens,
                coalesce(actual_completion_tokens, estimated_completion_tokens, 0) as completion_tokens,
                coalesce(total_tokens, 0) as total_tokens,
                coalesce(actual_cost_amount, estimated_cost_amount, 0) as cost_amount,
                currency,
                latency_ms,
                finish_reason,
                error_code,
                created_at
           from request_logs
          where tenant_id = $1
            and user_id = $2
            and tenant_customer_id = $3
            and ($4::uuid is null or project_id is null or project_id = $4::uuid)
          order by created_at desc
          limit $5 offset $6`,
        [...baseParams, pageSize, offset]
      ),
      this.db.query(
        `select count(*)::int as total
           from request_logs
          where tenant_id = $1
            and user_id = $2
            and tenant_customer_id = $3
            and ($4::uuid is null or project_id is null or project_id = $4::uuid)`,
        baseParams
      ),
      this.db.query(
        `select count(*)::int as total_requests,
                coalesce(sum(total_tokens), 0)::bigint as total_tokens,
                coalesce(sum(coalesce(actual_cost_amount, estimated_cost_amount, 0)), 0)::bigint as total_cost,
                coalesce(avg(latency_ms), 0)::numeric as avg_latency_ms,
                (count(*) filter (where created_at >= now() - interval '1 hour'))::numeric / 60 as rpm,
                coalesce(sum(total_tokens) filter (where created_at >= now() - interval '1 hour'), 0)::numeric / 60 as tpm
           from request_logs
          where tenant_id = $1
            and user_id = $2
            and tenant_customer_id = $3
            and ($4::uuid is null or project_id is null or project_id = $4::uuid)`,
        baseParams
      ),
      this.db.query(
        `select to_char(days.day, 'MM-DD') as day,
                count(rl.id)::int as requests,
                coalesce(sum(rl.total_tokens), 0)::bigint as tokens,
                coalesce(sum(coalesce(rl.actual_cost_amount, rl.estimated_cost_amount, 0)), 0)::bigint as cost
           from generate_series(
                  date_trunc('day', now()) - interval '6 days',
                  date_trunc('day', now()),
                  interval '1 day'
                ) as days(day)
           left join request_logs rl
             on rl.created_at >= days.day
            and rl.created_at < days.day + interval '1 day'
            and rl.tenant_id = $1
            and rl.user_id = $2
            and rl.tenant_customer_id = $3
            and ($4::uuid is null or rl.project_id is null or rl.project_id = $4::uuid)
          group by days.day
          order by days.day`,
        baseParams
      )
    ]);
    const summaryRow = summary.rows[0] ?? {};
    return {
      data: items.rows.map((row) => ({
        id: row.id,
        request_id: row.request_id,
        source: row.source,
        model_code: row.public_model_code,
        status: row.status,
        stream: Boolean(row.stream),
        prompt_tokens: Number(row.prompt_tokens),
        completion_tokens: Number(row.completion_tokens),
        total_tokens: Number(row.total_tokens),
        cost_amount: Number(row.cost_amount),
        currency: row.currency,
        latency_ms: row.latency_ms === null ? null : Number(row.latency_ms),
        finish_reason: row.finish_reason,
        error_code: row.error_code,
        created_at: row.created_at
      })),
      total: Number(count.rows[0]?.total ?? 0),
      page,
      pageSize,
      summary: {
        total_requests: Number(summaryRow.total_requests ?? 0),
        total_tokens: Number(summaryRow.total_tokens ?? 0),
        total_cost: Number(summaryRow.total_cost ?? 0),
        avg_latency_ms: Math.round(Number(summaryRow.avg_latency_ms ?? 0)),
        rpm: Number(Number(summaryRow.rpm ?? 0).toFixed(2)),
        tpm: Number(Number(summaryRow.tpm ?? 0).toFixed(0)),
        trend: trend.rows.map((row) => ({
          day: row.day,
          requests: Number(row.requests),
          tokens: Number(row.tokens),
          cost: Number(row.cost)
        }))
      }
    };
  }

  async createApiKey(user: PublicRequestUser, body: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(body);
    const customerContext = await this.ensureCustomerContext(user.id, context);
    const name = String(body.name ?? "").trim();
    if (!name) {
      throw new BadRequestException("API key name is required");
    }
    if (!context.project?.id) {
      throw new BadRequestException("Project context is required");
    }

    const modelWhitelist = this.asOptionalStringArray(body.model_whitelist);
    if (modelWhitelist?.length) {
      await this.validateModelWhitelist(context.tenant.id, modelWhitelist);
    }

    const plaintext = `aitp_${randomBytes(24).toString("base64url")}`;
    const keyHash = createHash("sha256").update(plaintext).digest("hex");
    const { rows } = await this.db.query(
      `insert into api_keys
        (tenant_id, project_id, tenant_customer_id, user_id, name, key_prefix, key_suffix,
         key_hash, status, model_whitelist, ip_whitelist, rpm_limit, tpm_limit,
         daily_budget, monthly_budget, expires_at)
       values
        ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, $11, $12, $13, $14, $15)
      returning id,
                tenant_id,
                project_id,
                tenant_customer_id,
                user_id,
                name,
                key_prefix,
                key_suffix,
                status,
                model_whitelist,
                ip_whitelist,
                rpm_limit,
                tpm_limit,
                daily_budget,
                monthly_budget,
                expires_at,
                last_used_at,
                created_at,
                revoked_at`,
      [
        context.tenant.id,
        context.project.id,
        customerContext.tenant_customer.id,
        user.id,
        name,
        plaintext.slice(0, 12),
        plaintext.slice(-6),
        keyHash,
        modelWhitelist ?? null,
        this.asOptionalStringArray(body.ip_whitelist) ?? null,
        numberOrNull(body.rpm_limit),
        numberOrNull(body.tpm_limit),
        numberOrNull(body.daily_budget),
        numberOrNull(body.monthly_budget),
        body.expires_at ? String(body.expires_at) : null
      ]
    );
    return {
      key: plaintext,
      record: this.toApiKeyResponse(rows[0])
    };
  }

  async revokeApiKey(user: PublicRequestUser, id: string) {
    const { rows } = await this.db.query(
      `update api_keys
          set status = 'revoked',
              revoked_at = now()
        where id = $1
          and user_id = $2
        returning id,
                  tenant_id,
                  project_id,
                  tenant_customer_id,
                  user_id,
                  name,
                  key_prefix,
                  key_suffix,
                  status,
                  model_whitelist,
                  ip_whitelist,
                  rpm_limit,
                  tpm_limit,
                  daily_budget,
                  monthly_budget,
                  expires_at,
                  last_used_at,
                  created_at,
                  revoked_at`,
      [id, user.id]
    );
    if (!rows[0]) {
      throw new NotFoundException("API key not found");
    }
    return this.toApiKeyResponse(rows[0]);
  }

  async updateApiKey(user: PublicRequestUser, id: string, body: Record<string, unknown>) {
    const nextStatus = body.status ? String(body.status) : null;
    const nextName = body.name === undefined ? null : String(body.name ?? "").trim();
    if (nextStatus && !["active", "disabled", "revoked"].includes(nextStatus)) {
      throw new BadRequestException("status must be active, disabled, or revoked");
    }
    if (nextName !== null && !nextName) {
      throw new BadRequestException("API key name cannot be empty");
    }
    const { rows } = await this.db.query(
      `update api_keys
          set status = coalesce($3, status),
              name = coalesce($4, name),
              revoked_at = case when $3 = 'revoked' then coalesce(revoked_at, now()) else revoked_at end,
              updated_at = now()
        where id = $1
          and user_id = $2
          and deleted_at is null
        returning id,
                  tenant_id,
                  project_id,
                  tenant_customer_id,
                  user_id,
                  name,
                  key_prefix,
                  key_suffix,
                  status,
                  model_whitelist,
                  ip_whitelist,
                  rpm_limit,
                  tpm_limit,
                  daily_budget,
                  monthly_budget,
                  expires_at,
                  last_used_at,
                  created_at,
                  revoked_at`,
      [id, user.id, nextStatus, nextName]
    );
    if (!rows[0]) {
      throw new NotFoundException("API key not found");
    }
    return this.toApiKeyResponse(rows[0]);
  }

  async deleteApiKey(user: PublicRequestUser, id: string) {
    const { rows } = await this.db.query(
      `update api_keys
          set status = 'revoked',
              revoked_at = coalesce(revoked_at, now()),
              deleted_at = now(),
              updated_at = now()
        where id = $1
          and user_id = $2
          and deleted_at is null
        returning id`,
      [id, user.id]
    );
    if (!rows[0]) {
      throw new NotFoundException("API key not found");
    }
    return { ok: true };
  }

  async wallet(user: PublicRequestUser, query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    const customerContext = await this.ensureCustomerContext(user.id, context);
    return {
      tenant: context.tenant,
      project: context.project,
      platform: context.platform,
      tenant_customer: customerContext.tenant_customer,
      wallet: this.toWalletResponse(customerContext.wallet)
    };
  }

  async walletLedger(user: PublicRequestUser, query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    const customerContext = await this.ensureCustomerContext(user.id, context);
    const { page, pageSize, offset } = parsePagination(query);
    const params = [context.tenant.id, user.id, customerContext.wallet.id, pageSize, offset];
    const [items, count] = await Promise.all([
      this.db.query(
        `select id,
                event_type,
                direction,
                balance_type,
                amount,
                currency,
                balance_after,
                related_type,
                related_id,
                metadata,
                created_at
           from wallet_ledger
          where tenant_id = $1
            and user_id = $2
            and wallet_id = $3
          order by created_at desc
          limit $4 offset $5`,
        params
      ),
      this.db.query(
        `select count(*)::int as total
           from wallet_ledger
          where tenant_id = $1
            and user_id = $2
            and wallet_id = $3`,
        params.slice(0, 3)
      )
    ]);
    return {
      data: items.rows.map((row) => ({
        ...row,
        amount: Number(row.amount),
        balance_after: row.balance_after === null ? null : Number(row.balance_after)
      })),
      total: Number(count.rows[0]?.total ?? 0),
      page,
      pageSize
    };
  }

  async createPaymentOrder(user: PublicRequestUser, body: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(body);
    const customerContext = await this.ensureCustomerContext(user.id, context);
    const product = await this.resolveVisibleProduct(context, body);
    const paymentChannel = await this.resolvePaymentChannel(context, body.payment_method);
    const idempotencyKey = body.idempotency_key ? String(body.idempotency_key) : null;

    if (idempotencyKey) {
      const existing = await this.db.query(
        `select po.*,
                p.product_code,
                p.name as product_name,
                p.product_type,
                p.face_value_amount,
                p.bonus_amount,
                p.sale_amount
           from payment_orders po
           left join payment_products p on p.id = po.product_id
          where po.idempotency_key = $1
            and po.user_id = $2`,
        [idempotencyKey, user.id]
      );
      if (existing.rows[0]) {
        return this.toPaymentOrderResponse(existing.rows[0]);
      }
    }

    const feeRateBps = Number(paymentChannel.fee_rate_bps ?? 0);
    const saleAmount = Number(product.sale_amount);
    const feeEstimate = Math.floor((saleAmount * feeRateBps) / 10000);
    const orderNo = this.generateOrderNo();
    const metadata = {
      product_snapshot: {
        product_code: product.product_code,
        display_name: product.display_name,
        face_value_amount: Number(product.face_value_amount),
        bonus_amount: Number(product.bonus_amount),
        sale_amount: saleAmount
      },
      payment_channel_code: paymentChannel.channel_code,
      checkout_version: "web-mvp"
    };

    const inserted = await this.db.query(
      `insert into payment_orders
        (order_no, user_id, product_id, platform, checkout_channel, payment_method, amount, currency,
         status, client_context, gross_amount, channel_fee_estimate, tenant_id, project_id,
         tenant_customer_id, idempotency_key, metadata)
       values
        ($1, $2, $3, $4, $5, $6, $7, $8, 'PAYING', $9::jsonb, $10, $11, $12, $13, $14, $15, $16::jsonb)
      returning *`,
      [
        orderNo,
        user.id,
        product.id,
        context.platform,
        paymentChannel.channel_type,
        paymentChannel.payment_method,
        saleAmount,
        product.currency,
        JSON.stringify(this.objectValue(body.client_context)),
        saleAmount,
        feeEstimate,
        context.tenant.id,
        context.project?.id ?? null,
        customerContext.tenant_customer.id,
        idempotencyKey,
        JSON.stringify(metadata)
      ]
    );

    return this.toPaymentOrderResponse({
      ...inserted.rows[0],
      product_code: product.product_code,
      product_name: product.display_name,
      product_type: product.product_type,
      face_value_amount: product.face_value_amount,
      bonus_amount: product.bonus_amount,
      sale_amount: product.sale_amount,
      payment_action: this.toPaymentAction(paymentChannel, inserted.rows[0])
    });
  }

  async paymentOrder(user: PublicRequestUser, orderNo: string) {
    const order = await this.findUserOrder(user.id, orderNo);
    if (!order) {
      throw new NotFoundException("Payment order not found");
    }
    return this.toPaymentOrderResponse(order);
  }

  async syncPaymentOrder(user: PublicRequestUser, orderNo: string) {
    const order = await this.findUserOrder(user.id, orderNo);
    if (!order) {
      throw new NotFoundException("Payment order not found");
    }
    await this.recordPaymentEvent(order.id, order.tenant_id, order.project_id, "order.sync", order.status, order.status, {
      source: "customer_api",
      note: "No production payment adapter configured; order status was not changed."
    });
    return this.toPaymentOrderResponse(order);
  }

  async cancelPaymentOrder(user: PublicRequestUser, orderNo: string) {
    const order = await this.findUserOrder(user.id, orderNo);
    if (!order) {
      throw new NotFoundException("Payment order not found");
    }
    if (!["CREATED", "PAYING", "PENDING", "PROCESSING"].includes(order.status)) {
      throw new BadRequestException("Payment order cannot be cancelled");
    }
    const { rows } = await this.db.query(
      `update payment_orders
          set status = 'CANCELLED',
              status_reason = 'cancelled_by_customer',
              cancelled_at = now(),
              closed_at = coalesce(closed_at, now()),
              updated_at = now()
        where id = $1
        returning *`,
      [order.id]
    );
    await this.recordPaymentEvent(order.id, order.tenant_id, order.project_id, "order.cancel", order.status, "CANCELLED", {
      source: "customer_api"
    });
    return this.toPaymentOrderResponse({
      ...rows[0],
      product_code: order.product_code,
      product_name: order.product_name,
      product_type: order.product_type,
      face_value_amount: order.face_value_amount,
      bonus_amount: order.bonus_amount,
      sale_amount: order.sale_amount
    });
  }

  async billingRecords(user: PublicRequestUser, query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    const customerContext = await this.ensureCustomerContext(user.id, context);
    const { page, pageSize, offset } = parsePagination(query);
    const params = [context.tenant.id, user.id, customerContext.wallet.id, pageSize, offset];
    const [items, count] = await Promise.all([
      this.db.query(
        `select br.id,
                br.amount,
                br.currency,
                br.billing_status,
                br.price_version,
                br.created_at,
                br.metadata,
                rl.request_id,
                rl.public_model_code,
                rl.total_tokens,
                rl.latency_ms
           from billing_records br
           left join request_logs rl on rl.id = br.request_log_id
          where br.tenant_id = $1
            and br.user_id = $2
            and br.wallet_id = $3
          order by br.created_at desc
          limit $4 offset $5`,
        params
      ),
      this.db.query(
        `select count(*)::int as total
           from billing_records
          where tenant_id = $1
            and user_id = $2
            and wallet_id = $3`,
        params.slice(0, 3)
      )
    ]);
    return {
      data: items.rows.map((row) => ({
        ...row,
        amount: Number(row.amount),
        total_tokens: row.total_tokens === null ? null : Number(row.total_tokens),
        latency_ms: row.latency_ms === null ? null : Number(row.latency_ms)
      })),
      total: Number(count.rows[0]?.total ?? 0),
      page,
      pageSize
    };
  }

  async createAccountDeletionRequest(user: PublicRequestUser, body: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(body);
    const customerContext = await this.ensureCustomerContext(user.id, context);
    const reason = String(body.reason ?? "").trim() || null;
    const { rows } = await this.db.query(
      `insert into account_deletion_requests
        (tenant_id, project_id, tenant_customer_id, user_id, reason, balance_policy,
         requested_from, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       returning id, status, created_at`,
      [
        context.tenant.id,
        context.project?.id ?? null,
        customerContext.tenant_customer.id,
        user.id,
        reason,
        "manual_review_required",
        String(body.requested_from ?? context.platform),
        JSON.stringify({ notice: "Balance and data deletion require manual compliance review." })
      ]
    );
    return {
      request: rows[0],
      notice: "注销申请已提交。余额、发票、账单和合规数据会按平台规则人工审核处理。"
    };
  }

  async createContentReport(user: PublicRequestUser, body: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(body);
    const customerContext = await this.ensureCustomerContext(user.id, context);
    const reason = String(body.reason ?? "").trim();
    if (!reason) {
      throw new BadRequestException("reason is required");
    }
    const { rows } = await this.db.query(
      `insert into content_reports
        (tenant_id, project_id, tenant_customer_id, user_id, chat_message_id,
         target_type, target_id, reason, description, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       returning id, status, created_at`,
      [
        context.tenant.id,
        context.project?.id ?? null,
        customerContext.tenant_customer.id,
        user.id,
        body.message_id && isUuid(String(body.message_id)) ? String(body.message_id) : null,
        String(body.target_type ?? "chat_message"),
        String(body.target_id ?? body.message_id ?? ""),
        reason,
        body.description ? String(body.description) : null,
        JSON.stringify({ source: "customer_api" })
      ]
    );
    return { report: rows[0] };
  }

  async mockPay(user: PublicRequestUser, orderNo: string) {
    return this.db.transaction(async (client) => {
      const orderRows = await client.query(
        `select po.*,
                p.product_code,
                p.name as product_name,
                p.product_type,
                p.face_value_amount,
                p.bonus_amount,
                p.sale_amount
           from payment_orders po
           join payment_products p on p.id = po.product_id
          where po.order_no = $1
            and po.user_id = $2
          for update`,
        [orderNo, user.id]
      );
      const order = orderRows.rows[0];
      if (!order) {
        throw new NotFoundException("Payment order not found");
      }
      if (order.status === "FULFILLED") {
        const wallet = await this.findWallet(client, order.tenant_id, user.id, order.currency);
        return {
          order: this.toPaymentOrderResponse(order),
          wallet: wallet ? this.toWalletResponse(wallet) : null
        };
      }
      if (!["CREATED", "PAYING", "PAID"].includes(order.status)) {
        throw new BadRequestException("Payment order cannot be paid");
      }

      const wallet = await this.findWallet(client, order.tenant_id, user.id, order.currency, true);
      if (!wallet) {
        throw new BadRequestException("Wallet not found");
      }

      const cashCredit = Number(order.face_value_amount);
      const bonusCredit = Number(order.bonus_amount);
      const cashAfter = Number(wallet.cash_balance) + cashCredit;
      const bonusAfter = Number(wallet.bonus_balance) + bonusCredit;
      const updatedWalletRows = await client.query(
        `update wallets
            set cash_balance = $1,
                bonus_balance = $2,
                tenant_customer_id = coalesce(tenant_customer_id, $5),
                updated_at = now()
          where id = $3
            and user_id = $4
        returning *`,
        [cashAfter, bonusAfter, wallet.id, user.id, order.tenant_customer_id]
      );
      const updatedWallet = updatedWalletRows.rows[0];

      if (cashCredit > 0) {
        await this.insertLedger(client, {
          walletId: wallet.id,
          userId: user.id,
          tenantId: order.tenant_id,
          tenantCustomerId: order.tenant_customer_id,
          eventType: "payment.fulfill",
          balanceType: "cash",
          amount: cashCredit,
          currency: order.currency,
          balanceAfter: cashAfter,
          relatedId: order.id,
          idempotencyKey: `payment:${order.id}:cash`
        });
      }
      if (bonusCredit > 0) {
        await this.insertLedger(client, {
          walletId: wallet.id,
          userId: user.id,
          tenantId: order.tenant_id,
          tenantCustomerId: order.tenant_customer_id,
          eventType: "payment.bonus",
          balanceType: "bonus",
          amount: bonusCredit,
          currency: order.currency,
          balanceAfter: bonusAfter,
          relatedId: order.id,
          idempotencyKey: `payment:${order.id}:bonus`
        });
      }

      const paidRows = await client.query(
        `update payment_orders
            set status = 'FULFILLED',
                paid_at = coalesce(paid_at, now()),
                fulfilled_at = now(),
                updated_at = now(),
                metadata = coalesce(metadata, '{}'::jsonb) || '{"mock_paid":true}'::jsonb
          where id = $1
        returning *`,
        [order.id]
      );

      return {
        order: this.toPaymentOrderResponse({
          ...paidRows.rows[0],
          product_code: order.product_code,
          product_name: order.product_name,
          product_type: order.product_type,
          face_value_amount: order.face_value_amount,
          bonus_amount: order.bonus_amount,
          sale_amount: order.sale_amount
        }),
        wallet: this.toWalletResponse(updatedWallet)
      };
    });
  }

  async resolveCheckoutContext(query: Record<string, unknown>): Promise<CheckoutContext> {
    const platform = this.resolvePlatform(query.platform);
    const tenant = await this.resolveTenant(query);
    const project = await this.resolveProject(tenant.id, platform, query);
    return { tenant, project, platform };
  }

  private resolvePlatform(value: unknown): Platform {
    const platform = String(value ?? "web");
    if (!platforms.includes(platform as Platform)) {
      throw new BadRequestException("platform must be one of ios, android, web, api");
    }
    return platform as Platform;
  }

  private async resolveTenant(query: Record<string, unknown>) {
    if (query.tenant_id) {
      const { rows } = await this.db.query(
        `select id, tenant_code, name
           from tenants
          where id = $1
            and status = 'active'`,
        [query.tenant_id]
      );
      if (rows[0]) return rows[0];
      throw new NotFoundException("Tenant not found");
    }
    const tenantCode = String(query.tenant_code ?? "platform_default_tenant");
    const { rows } = await this.db.query(
      `select id, tenant_code, name
         from tenants
        where tenant_code = $1
          and status = 'active'`,
      [tenantCode]
    );
    if (!rows[0]) {
      throw new NotFoundException("Tenant not found");
    }
    return rows[0];
  }

  private async resolveProject(tenantId: string, platform: Platform, query: Record<string, unknown>) {
    if (query.project_id) {
      const { rows } = await this.db.query(
        `select id, tenant_id, project_code, name, project_type, platform, payment_policy
           from tenant_projects
          where id = $1
            and tenant_id = $2
            and platform = $3
            and status = 'active'`,
        [query.project_id, tenantId, platform]
      );
      if (rows[0]) return rows[0];
      throw new NotFoundException("Project not found");
    }
    if (query.project_code) {
      const { rows } = await this.db.query(
        `select id, tenant_id, project_code, name, project_type, platform, payment_policy
           from tenant_projects
          where tenant_id = $1
            and project_code = $2
            and platform = $3
            and status = 'active'`,
        [tenantId, query.project_code, platform]
      );
      if (rows[0]) return rows[0];
      throw new NotFoundException("Project not found");
    }
    const { rows } = await this.db.query(
      `select id, tenant_id, project_code, name, project_type, platform, payment_policy
         from tenant_projects
        where tenant_id = $1
          and platform = $2
          and status = 'active'
        order by created_at asc
        limit 1`,
      [tenantId, platform]
    );
    return rows[0] ?? null;
  }

  async ensureCustomerContext(
    userId: string,
    context: CheckoutContext,
    client: QueryExecutor = this.db
  ): Promise<CustomerContext> {
    const customerCode = `CUS-${randomToken(12)}`;
    const customer = await client.query(
      `insert into tenant_customers
        (tenant_id, user_id, source_project_id, customer_code, status, metadata)
       values ($1, $2, $3, $4, 'active', '{}'::jsonb)
       on conflict (tenant_id, user_id) do update
          set status = 'active',
              source_project_id = coalesce(tenant_customers.source_project_id, excluded.source_project_id),
              updated_at = now()
      returning id, tenant_id, user_id, source_project_id, customer_code, status`,
      [context.tenant.id, userId, context.project?.id ?? null, customerCode]
    );
    const wallet = await client.query(
      `insert into wallets (tenant_id, tenant_customer_id, user_id, currency, status)
       values ($1, $2, $3, 'CNY', 'active')
       on conflict (tenant_id, user_id, currency) do update
          set tenant_customer_id = coalesce(wallets.tenant_customer_id, excluded.tenant_customer_id),
              updated_at = now()
      returning *`,
      [context.tenant.id, customer.rows[0].id, userId]
    );
    return {
      tenant_customer: customer.rows[0],
      wallet: wallet.rows[0]
    };
  }

  async listPaymentMethods(context: CheckoutContext): Promise<any[]> {
    const { rows } = await this.db.query(
      `select channel_code,
              channel_type,
              display_name,
              platform,
              payment_method,
              settlement_mode,
              fee_rate_bps,
              sort_order,
              config
         from payment_channels
        where tenant_id = $1
          and platform = $2
          and enabled = true
          and (project_id is null or project_id = $3)
        order by case when project_id = $3 then 0 else 1 end,
                 sort_order asc,
                 display_name asc`,
      [context.tenant.id, context.platform, context.project?.id ?? null]
    );
    return rows.map((row) => ({
      ...row,
      fee_rate_bps: row.fee_rate_bps === null ? null : Number(row.fee_rate_bps)
    }));
  }

  private async resolveVisibleProduct(context: CheckoutContext, body: Record<string, unknown>) {
    const rawProductId = body.product_id ? String(body.product_id) : "";
    const productId = isUuid(rawProductId) ? rawProductId : null;
    const productCode = String(body.product_code ?? (productId ? "" : rawProductId));
    if (!productId && !productCode) {
      throw new BadRequestException("product_id or product_code is required");
    }

    const { rows } = await this.db.query(
      `select *
         from (
           select distinct on (p.id)
                  p.id,
                  p.product_code,
                  p.name,
                  p.product_type,
                  p.face_value_amount,
                  p.bonus_amount,
                  p.sale_amount,
                  p.currency,
                  p.metadata as product_metadata,
                  ppv.platform,
                  ppv.project_id,
                  ppv.sort_order,
                  coalesce(ppv.display_name, p.name) as display_name,
                  ppv.display_description,
                  ppv.badge,
                  ppv.metadata as visibility_metadata
             from payment_product_visibility ppv
             join payment_products p on p.id = ppv.product_id
            where ppv.tenant_id = $1
              and ppv.platform = $2
              and ppv.enabled = true
              and p.status = 'active'
              and (ppv.project_id is null or ppv.project_id = $3)
              and (($4::uuid is not null and p.id = $4::uuid) or ($5 <> '' and p.product_code = $5))
            order by p.id,
                     case when ppv.project_id = $3 then 0 else 1 end,
                     ppv.sort_order asc
         ) visible
        limit 1`,
      [context.tenant.id, context.platform, context.project?.id ?? null, productId, productCode]
    );
    if (!rows[0]) {
      throw new NotFoundException("Payment product is not available for this tenant and platform");
    }
    return rows[0];
  }

  private async resolvePaymentChannel(context: CheckoutContext, value: unknown) {
    const paymentMethod = String(value ?? "");
    if (!paymentMethod) {
      throw new BadRequestException("payment_method is required");
    }
    const { rows } = await this.db.query(
      `select *
         from payment_channels
        where tenant_id = $1
          and platform = $2
          and enabled = true
          and payment_method = $4
          and (project_id is null or project_id = $3)
        order by case when project_id = $3 then 0 else 1 end,
                 sort_order asc
        limit 1`,
      [context.tenant.id, context.platform, context.project?.id ?? null, paymentMethod]
    );
    if (!rows[0]) {
      throw new NotFoundException("Payment method is not available");
    }
    return rows[0];
  }

  private async validateModelWhitelist(tenantId: string, modelCodes: string[]) {
    const { rows } = await this.db.query(
      `select m.public_model_code
         from tenant_model_authorizations tma
         join models m on m.id = tma.model_id
        where tma.tenant_id = $1
          and tma.status = 'active'
          and m.status = 'active'
          and m.public_model_code = any($2::text[])`,
      [tenantId, modelCodes]
    );
    const allowed = new Set(rows.map((row) => row.public_model_code));
    const invalid = modelCodes.filter((code) => !allowed.has(code));
    if (invalid.length) {
      throw new BadRequestException(`Model is not available: ${invalid.join(", ")}`);
    }
  }

  private async findUserOrder(userId: string, orderNo: string) {
    const { rows } = await this.db.query(
      `select po.*,
              p.product_code,
              p.name as product_name,
              p.product_type,
              p.face_value_amount,
              p.bonus_amount,
              p.sale_amount
         from payment_orders po
         left join payment_products p on p.id = po.product_id
        where (po.order_no = $1 or po.id::text = $1)
          and po.user_id = $2`,
      [orderNo, userId]
    );
    return rows[0] ?? null;
  }

  private async recordPaymentEvent(
    orderId: string,
    tenantId: string | null,
    projectId: string | null,
    eventType: string,
    fromStatus: string | null,
    toStatus: string | null,
    metadata: Record<string, unknown>
  ) {
    await this.db.query(
      `insert into payment_order_events
        (payment_order_id, tenant_id, project_id, event_type, from_status, to_status,
         reason, actor_type, metadata, idempotency_key)
       values ($1, $2, $3, $4, $5, $6, $7, 'customer', $8::jsonb, $9)
       on conflict (idempotency_key) do nothing`,
      [
        orderId,
        tenantId,
        projectId,
        eventType,
        fromStatus,
        toStatus,
        String(metadata.note ?? eventType),
        JSON.stringify(metadata),
        `payment-event:${orderId}:${eventType}:${Date.now()}`
      ]
    );
  }

  private async findWallet(
    client: QueryExecutor,
    tenantId: string,
    userId: string,
    currency = "CNY",
    lock = false
  ) {
    const result = await client.query(
      `select *
         from wallets
        where tenant_id = $1
          and user_id = $2
          and currency = $3
        ${lock ? "for update" : ""}`,
      [tenantId, userId, currency]
    );
    return result.rows[0] ?? null;
  }

  private async insertLedger(
    client: QueryExecutor,
    params: {
      walletId: string;
      userId: string;
      tenantId: string;
      tenantCustomerId: string | null;
      eventType: string;
      balanceType: string;
      amount: number;
      currency: string;
      balanceAfter: number;
      relatedId: string;
      idempotencyKey: string;
    }
  ) {
    await client.query(
      `insert into wallet_ledger
        (wallet_id, user_id, tenant_id, tenant_customer_id, event_type, direction,
         balance_type, amount, currency, balance_after, related_type, related_id,
         idempotency_key, metadata)
       values ($1, $2, $3, $4, $5, 'credit', $6, $7, $8, $9, 'payment_order', $10, $11, '{}'::jsonb)
       on conflict (idempotency_key) do nothing`,
      [
        params.walletId,
        params.userId,
        params.tenantId,
        params.tenantCustomerId,
        params.eventType,
        params.balanceType,
        params.amount,
        params.currency,
        params.balanceAfter,
        params.relatedId,
        params.idempotencyKey
      ]
    );
  }

  private async toSessionResponse(user: any, context: CheckoutContext, customerContext: CustomerContext) {
    const tokens = await this.sessions.createTokenPair(user, {
      tenant: context.tenant,
      project: context.project,
      tenant_customer: customerContext.tenant_customer
    });
    return {
      ...tokens,
      token: tokens.access_token,
      user: this.toPublicUserResponse(user),
      tenant: context.tenant,
      project: context.project,
      platform: context.platform,
      tenant_customer: customerContext.tenant_customer,
      wallet: this.toWalletResponse(customerContext.wallet)
    };
  }

  private toPublicUserResponse(user: any) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone ?? null,
      userType: user.user_type ?? user.userType,
      accountType: "customer"
    };
  }

  private toProductResponse(row: any, paymentMethods: string[]) {
    const productMetadata = row.product_metadata ?? {};
    const visibilityMetadata = row.visibility_metadata ?? {};
    return {
      id: row.id,
      product_code: row.product_code,
      name: row.name,
      display_name: row.display_name,
      display_description: row.display_description ?? productMetadata.description ?? null,
      badge: row.badge ?? productMetadata.badge ?? null,
      product_type: row.product_type,
      face_value_amount: Number(row.face_value_amount),
      bonus_amount: Number(row.bonus_amount),
      sale_amount: Number(row.sale_amount),
      currency: row.currency,
      platform: row.platform,
      project_id: row.project_id,
      ios_product_id: visibilityMetadata.app_store_product_id ?? row.ios_product_id ?? null,
      features: visibilityMetadata.features ?? productMetadata.features ?? [],
      valid_days: visibilityMetadata.valid_days ?? productMetadata.valid_days ?? null,
      payment_methods: paymentMethods,
      metadata: {
        ...productMetadata,
        ...visibilityMetadata
      }
    };
  }

  private toModelResponse(row: any) {
    return {
      id: row.id,
      model_code: row.public_model_code,
      display_name: row.display_name,
      family: row.model_family,
      modality: row.modality ?? [],
      max_context_tokens: row.max_context_tokens === null ? null : Number(row.max_context_tokens),
      default_max_output_tokens:
        row.default_max_output_tokens === null ? null : Number(row.default_max_output_tokens),
      capabilities: {
        stream: Boolean(row.supports_stream),
        tools: Boolean(row.supports_tools),
        json_mode: Boolean(row.supports_json_mode)
      },
      limits: {
        rpm: row.rpm_limit === null ? null : Number(row.rpm_limit),
        tpm: row.tpm_limit === null ? null : Number(row.tpm_limit),
        daily_budget: row.daily_budget === null ? null : Number(row.daily_budget),
        monthly_budget: row.monthly_budget === null ? null : Number(row.monthly_budget)
      },
      enabled_features: row.enabled_features ?? [],
      price: row.price_version
        ? {
            version: row.price_version,
            currency: row.currency,
            mode: row.pricing_mode,
            input_per_1k: row.input_price_per_1k === null ? null : Number(row.input_price_per_1k),
            output_per_1k: row.output_price_per_1k === null ? null : Number(row.output_price_per_1k)
          }
        : null,
      metadata: row.model_metadata ?? {}
    };
  }

  private toWalletResponse(wallet: any) {
    return {
      id: wallet.id,
      currency: wallet.currency,
      cash_balance: Number(wallet.cash_balance),
      bonus_balance: Number(wallet.bonus_balance),
      frozen_balance: Number(wallet.frozen_balance),
      credit_limit: Number(wallet.credit_limit),
      available_balance:
        Number(wallet.cash_balance) + Number(wallet.bonus_balance) + Number(wallet.credit_limit),
      status: wallet.status,
      updated_at: wallet.updated_at
    };
  }

  private toApiKeyResponse(row: any) {
    return {
      id: row.id,
      name: row.name,
      masked_key: `${row.key_prefix}...${row.key_suffix}`,
      status: row.status,
      model_whitelist: row.model_whitelist ?? [],
      ip_whitelist: row.ip_whitelist ?? [],
      limits: {
        rpm: row.rpm_limit === null ? null : Number(row.rpm_limit),
        tpm: row.tpm_limit === null ? null : Number(row.tpm_limit),
        daily_budget: row.daily_budget === null ? null : Number(row.daily_budget),
        monthly_budget: row.monthly_budget === null ? null : Number(row.monthly_budget)
      },
      expires_at: row.expires_at,
      last_used_at: row.last_used_at,
      created_at: row.created_at,
      revoked_at: row.revoked_at
    };
  }

  private toPaymentOrderResponse(order: any) {
    const response: Record<string, unknown> = {
      id: order.id,
      order_no: order.order_no,
      status: order.status,
      platform: order.platform,
      payment_method: order.payment_method,
      checkout_channel: order.checkout_channel,
      amount: Number(order.amount),
      currency: order.currency,
      product: {
        id: order.product_id,
        product_code: order.product_code,
        name: order.product_name,
        product_type: order.product_type,
        face_value_amount: Number(order.face_value_amount ?? 0),
        bonus_amount: Number(order.bonus_amount ?? 0),
        sale_amount: Number(order.sale_amount ?? order.amount ?? 0)
      },
      paid_at: order.paid_at,
      fulfilled_at: order.fulfilled_at,
      closed_at: order.closed_at,
      created_at: order.created_at
    };
    if (order.payment_action) {
      response.payment_action = order.payment_action;
    }
    return response;
  }

  private toPaymentAction(channel: any, order: any) {
    if (channel.payment_method === "enterprise_transfer") {
      return {
        type: "company_transfer",
        status: "manual_reconciliation_required",
        title: "企业对公转账",
        instructions: [
          "转账时请在备注中填写订单号",
          "到账后由租户或平台后台完成对账入账"
        ],
        order_no: order.order_no,
        account: channel.config?.bank_account ?? {
          account_name: "AI Token Platform",
          bank_name: "示例银行",
          account_no: "请在管理后台配置真实收款账号"
        }
      };
    }
    return {
      type: channel.payment_method === "wechat_native" ? "mock_qr" : "mock_redirect",
      status: "pending",
      title: channel.display_name,
      order_no: order.order_no,
      url: `/checkout/mock-pay?order_no=${encodeURIComponent(order.order_no)}`
    };
  }

  private normalizeEmail(value: unknown) {
    const email = String(value ?? "").trim().toLowerCase();
    return email.includes("@") ? email : "";
  }

  private normalizePhone(value: unknown) {
    const phone = String(value ?? "").replace(/[^\d+]/g, "");
    return phone || null;
  }

  private objectValue(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  private asOptionalStringArray(value: unknown) {
    if (value === undefined || value === null || value === "") return null;
    if (Array.isArray(value)) {
      const values = value.map((item) => String(item).trim()).filter(Boolean);
      return values.length ? values : null;
    }
    const values = String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length ? values : null;
  }

  private generateOrderNo() {
    const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    return `ORD${timestamp}${randomToken(10)}`;
  }
}

function randomToken(length: number) {
  return randomUUID().replace(/-/g, "").slice(0, length).toUpperCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
