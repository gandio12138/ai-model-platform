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
import { enabledModelProviderTypes } from "../ai/providers/provider-visibility.js";
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

type ModelCategoryKey = "text_chat" | "embedding" | "image" | "video" | "rerank" | "legacy_inference_profile";
type ToolsStatusKey = "supported" | "unsupported" | "unverified";

const modelCategoryLabels: Record<ModelCategoryKey, string> = {
  text_chat: "文本对话模型",
  embedding: "Embedding 模型",
  image: "图像模型",
  video: "视频模型",
  rerank: "Rerank 模型",
  legacy_inference_profile: "Legacy / Inference Profile 模型"
};

const toolsStatusLabels: Record<ToolsStatusKey, string> = {
  supported: "支持",
  unsupported: "不支持",
  unverified: "待验证"
};

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
    await this.ensureReferralCode(user.id, context.tenant.id);
    await this.createReferralRelationIfPresent(body, user.id, customerContext.tenant_customer.id, context);
    await this.recordRiskEvent(context, user.id, "auth.register", "low", {
      subject_type: "user",
      subject_id: user.id,
      metadata: { email }
    });
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
    await this.ensureReferralCode(user.id, context.tenant.id);
    await this.recordRiskEvent(context, user.id, "auth.login", "low", {
      subject_type: "user",
      subject_id: user.id,
      metadata: { email }
    });
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
    const [products, paymentMethods, appReleases] = await Promise.all([
      this.products(query),
      this.paymentMethods(query),
      this.appReleases(query)
    ]);
    return {
      tenant: products.tenant,
      project: products.project,
      platform: products.platform,
      products: products.products,
      payment_methods: paymentMethods.payment_methods,
      app_releases: appReleases.data
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

  async appReleases(query: Record<string, unknown>) {
    const tenant = await this.resolveTenant(query);
    const { rows } = await this.db.query(
      `select distinct on (platform)
              id,
              tenant_id,
              project_id,
              platform,
              distribution_channel,
              version,
              build_number,
              release_status,
              min_supported_version,
              force_update,
              download_url,
              changelog,
              file_size_bytes,
              checksum_sha256,
              published_at,
              metadata,
              updated_at
         from app_releases
        where tenant_id = $1
          and release_status = 'published'
          and coalesce(download_url, '') <> ''
        order by platform, published_at desc nulls last, created_at desc`,
      [tenant.id]
    );
    return {
      tenant,
      data: rows
    };
  }

  async models(query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    const providerTypes = enabledModelProviderTypes();
    const { rows } = await this.db.query(
      `with model_rows as (
         select m.id,
                m.public_model_code,
                m.display_name,
                m.model_family,
                m.modality,
                coalesce(tma.max_context_tokens, mp.max_context_tokens, m.max_context_tokens) as max_context_tokens,
                coalesce(mp.default_max_output_tokens, m.default_max_output_tokens) as default_max_output_tokens,
                m.supports_stream,
                m.supports_tools,
                m.supports_json_mode,
                m.metadata as model_metadata,
                coalesce(m.metadata->>'canonical_model_key', m.public_model_code) as canonical_model_key,
                context_tenant.tenant_type as tenant_type,
                context_tenant.tenant_code as tenant_code,
                tma.id as authorization_id,
                tma.rpm_limit,
                tma.tpm_limit,
                tma.daily_budget,
                tma.monthly_budget,
                tma.enabled_features,
                coalesce(tmp.price_version, mp.price_version) as price_version,
                coalesce(tmp.currency, mp.currency) as currency,
                coalesce(tmp.pricing_mode, 'catalog_price') as pricing_mode,
                coalesce(tmp.input_price_per_1k, mp.input_price_per_1k) as input_price_per_1k,
                coalesce(tmp.output_price_per_1k, mp.output_price_per_1k) as output_price_per_1k,
                coalesce(tmp.input_price_per_1m, mp.input_price_per_1m, tmp.input_price_per_1k * 1000, mp.input_price_per_1k * 1000) as input_price_per_1m,
                coalesce(tmp.output_price_per_1m, mp.output_price_per_1m, tmp.output_price_per_1k * 1000, mp.output_price_per_1k * 1000) as output_price_per_1m
           from models m
           join tenants context_tenant on context_tenant.id = $1
           left join tenant_model_authorizations tma
             on tma.model_id = m.id
            and tma.tenant_id = $1
            and tma.status = 'active'
           left join lateral (
             select price_version,
                    currency,
                    pricing_mode,
                    input_price_per_1k,
                    output_price_per_1k,
                    input_price_per_1m,
                    output_price_per_1m
               from tenant_model_prices
              where tenant_id = context_tenant.id
                and model_id = m.id
                and status = 'active'
                and effective_from <= now()
                and (effective_to is null or effective_to > now())
              order by effective_from desc, created_at desc
              limit 1
           ) tmp on true
           left join lateral (
             select price_version,
                    currency,
                    input_price_per_1k,
                    output_price_per_1k,
                    input_price_per_1m,
                    output_price_per_1m,
                    max_context_tokens,
                    default_max_output_tokens
               from model_prices
              where model_id = m.id
                and status = 'active'
                and effective_from <= now()
                and (effective_to is null or effective_to > now())
              order by effective_from desc, created_at desc
              limit 1
           ) mp on true
          where m.status = 'active'
            and m.max_context_tokens is not null
            and coalesce(tmp.price_version, mp.price_version) is not null
            and exists (
              select 1
                from model_routes mr
                join providers p on p.id = mr.provider_id
               where mr.model_id = m.id
                 and mr.enabled = true
                 and coalesce(mr.metadata->>'runtime_validation_status', '') <> 'unavailable'
                 and p.status = 'active'
                 and p.provider_type = any($2::text[])
            )
       ),
       ranked as (
         select *,
                row_number() over (
                  partition by canonical_model_key
                  order by
                    case when model_metadata->>'public_preferred' = 'true' then 0 else 1 end,
                    coalesce(input_price_per_1m, input_price_per_1k * 1000) asc,
                    coalesce(output_price_per_1m, output_price_per_1k * 1000) asc,
                    display_name asc
                ) as model_rank
           from model_rows
       )
       select *
         from ranked
        where model_rank = 1
        order by model_family nulls last, display_name asc`,
      [context.tenant.id, providerTypes]
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
    const customerContext = await this.ensureCustomerContext(user.id, context);
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
          and (tenant_customer_id is null or tenant_customer_id = $3)
          and deleted_at is null
        order by created_at desc`,
      [context.tenant.id, user.id, customerContext.tenant_customer.id]
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
        context.project?.id ?? null,
        customerContext.tenant_customer.id,
        user.id,
        name,
        plaintext.slice(0, 12),
        plaintext.slice(-6),
        keyHash,
        null,
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
      this.db.query<{ total: number }>(
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
    await this.recordRiskEvent(context, user.id, "account.delete_request", "medium", {
      subject_type: "user",
      subject_id: user.id,
      metadata: { request_id: rows[0].id, requested_from: body.requested_from ?? context.platform }
    });
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
    await this.recordRiskEvent(context, user.id, "content.report", "low", {
      subject_type: String(body.target_type ?? "chat_message"),
      subject_id: String(body.target_id ?? body.message_id ?? rows[0].id),
      metadata: { report_id: rows[0].id, reason }
    });
    return { report: rows[0] };
  }

  async referralSummary(user: PublicRequestUser, query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    await this.ensureCustomerContext(user.id, context);
    const code = await this.ensureReferralCode(user.id, context.tenant.id);
    const [relations, commissions, withdrawals] = await Promise.all([
      this.db.query(
        `select count(*)::int as total
           from referral_relations
          where tenant_id = $1
            and referrer_user_id = $2
            and status = 'active'`,
        [context.tenant.id, user.id]
      ),
      this.db.query<{ status: string; amount: string }>(
        `select status,
                coalesce(sum(commission_amount), 0)::bigint as amount
           from commission_records
          where tenant_id = $1
            and beneficiary_user_id = $2
          group by status`,
        [context.tenant.id, user.id]
      ),
      this.db.query<{ status: string; amount: string }>(
        `select status,
                coalesce(sum(amount), 0)::bigint as amount
           from commission_withdrawals
          where tenant_id = $1
            and user_id = $2
          group by status`,
        [context.tenant.id, user.id]
      )
    ]);
    const commissionByStatus = this.amountByStatus(commissions.rows);
    const withdrawalByStatus = this.amountByStatus(withdrawals.rows);
    const available = Number(commissionByStatus.available ?? 0);
    const pendingWithdrawal = Number(withdrawalByStatus.pending ?? 0);
    return {
      invite_code: code.code,
      invited_customers: Number(relations.rows[0]?.total ?? 0),
      pending_commission: Number(commissionByStatus.pending ?? 0),
      available_commission: Math.max(available - pendingWithdrawal, 0),
      withdrawn_commission: Number(withdrawalByStatus.paid ?? 0) + Number(withdrawalByStatus.completed ?? 0),
      currency: "CNY"
    };
  }

  async referralCommissions(user: PublicRequestUser, query: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(query);
    await this.ensureCustomerContext(user.id, context);
    const { page, pageSize, offset } = parsePagination(query);
    const [items, count] = await Promise.all([
      this.db.query(
        `select cr.id,
                cr.source_user_id,
                su.email as source_email,
                cr.payment_order_id,
                cr.commission_base_amount,
                cr.commission_rate,
                cr.commission_amount,
                cr.currency,
                cr.status,
                cr.frozen_until,
                cr.created_at,
                cr.metadata
           from commission_records cr
           left join users su on su.id = cr.source_user_id
          where cr.tenant_id = $1
            and cr.beneficiary_user_id = $2
          order by cr.created_at desc
          limit $3 offset $4`,
        [context.tenant.id, user.id, pageSize, offset]
      ),
      this.db.query(
        `select count(*)::int as total
           from commission_records
          where tenant_id = $1
            and beneficiary_user_id = $2`,
        [context.tenant.id, user.id]
      )
    ]);
    return {
      data: items.rows.map((row) => ({
        ...row,
        commission_base_amount: Number(row.commission_base_amount),
        commission_rate: Number(row.commission_rate),
        commission_amount: Number(row.commission_amount)
      })),
      total: Number(count.rows[0]?.total ?? 0),
      page,
      pageSize
    };
  }

  async createReferralWithdrawal(user: PublicRequestUser, body: Record<string, unknown>) {
    const context = await this.resolveCheckoutContext(body);
    await this.ensureCustomerContext(user.id, context);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("amount must be positive cents");
    }
    const summary = await this.referralSummary(user, body);
    if (amount > summary.available_commission) {
      throw new BadRequestException("Available commission is insufficient");
    }
    const { rows } = await this.db.query(
      `insert into commission_withdrawals
        (tenant_id, user_id, amount, currency, status, payout_method,
         payout_account_mask, requested_from, metadata)
       values ($1, $2, $3, 'CNY', 'pending', $4, $5, $6, $7::jsonb)
       returning id, amount, currency, status, payout_method, payout_account_mask,
                 requested_from, created_at`,
      [
        context.tenant.id,
        user.id,
        Math.round(amount),
        body.payout_method ? String(body.payout_method) : null,
        this.maskPayoutAccount(body.payout_account),
        String(body.requested_from ?? context.platform),
        JSON.stringify({ note: "Manual approval is required before payout." })
      ]
    );
    await this.recordRiskEvent(context, user.id, "commission.withdrawal_request", "medium", {
      subject_type: "commission_withdrawal",
      subject_id: rows[0].id,
      metadata: { amount: Math.round(amount) }
    });
    return {
      withdrawal: rows[0],
      notice: "提现申请已提交，平台会在后台审核后处理。"
    };
  }

  async policyDocuments(query: Record<string, unknown>) {
    const variant = String(query.variant ?? query.privacy_notice_variant ?? "standard_cn");
    const type = query.type ? String(query.type) : null;
    const params: unknown[] = [variant];
    const typeSql = type ? `and policy_type = $${params.push(type)}` : "";
    const { rows } = await this.db.query(
      `select distinct on (policy_type)
              policy_type,
              variant,
              title,
              content,
              version,
              effective_at,
              metadata
         from policy_documents
        where status = 'published'
          and (variant = $1 or variant = 'standard_cn')
          ${typeSql}
        order by policy_type,
                 case when variant = $1 then 0 else 1 end,
                 effective_at desc,
                 version desc`,
      params
    );
    return {
      data: rows,
      variant
    };
  }

  async mockPay(user: PublicRequestUser, orderNo: string) {
    const mockEnabled = process.env.PAYMENT_MOCK_ENABLED !== "false";
    if (process.env.NODE_ENV === "production" || !mockEnabled) {
      throw new BadRequestException("Mock payment is disabled");
    }
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
      await this.upsertTenantRevenueShare(client, order.id, { source: "public_mock_pay" });

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

  private async upsertTenantRevenueShare(
    client: QueryExecutor,
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
        `select id, tenant_code, name, tenant_type, billing_mode, current_plan_code
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
      `select id, tenant_code, name, tenant_type, billing_mode, current_plan_code
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
            and status = 'active'`,
        [query.project_id, tenantId]
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
      internal_payment_method: row.payment_method,
      payment_method: this.toPublicPaymentMethodCode(row.payment_method),
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
    const paymentMethod = this.toInternalPaymentMethodCode(String(value ?? ""));
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

  private async validateModelWhitelist(_tenantId: string, modelCodes: string[]) {
    const { rows } = await this.db.query<{ public_model_code: string }>(
      `select m.public_model_code
         from models m
        where m.status = 'active'
          and m.max_context_tokens is not null
          and m.public_model_code = any($1::text[])
          and exists (
            select 1
              from model_prices mp
             where mp.model_id = m.id
               and mp.status = 'active'
               and mp.effective_from <= now()
               and (mp.effective_to is null or mp.effective_to > now())
          )`,
      [modelCodes]
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
    const modelCategory = this.resolveModelCategory(row);
    const toolsStatus = this.resolveToolsStatus(row, modelCategory);
    return {
      id: row.id,
      model_code: row.public_model_code,
      display_name: row.display_name,
      family: row.model_family,
      model_company: this.resolveModelCompany(row.public_model_code, row.display_name, row.model_family),
      model_category: modelCategory,
      model_category_label: modelCategoryLabels[modelCategory],
      modality: row.modality ?? [],
      max_context_tokens: row.max_context_tokens === null ? null : Number(row.max_context_tokens),
      default_max_output_tokens:
        row.default_max_output_tokens === null ? null : Number(row.default_max_output_tokens),
      capabilities: {
        stream: Boolean(row.supports_stream),
        tools: toolsStatus === "supported",
        json_mode: Boolean(row.supports_json_mode)
      },
      tools_status: toolsStatus,
      tools_status_label: toolsStatusLabels[toolsStatus],
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
            output_per_1k: row.output_price_per_1k === null ? null : Number(row.output_price_per_1k),
            input_per_1m: row.input_price_per_1m === null ? null : Number(row.input_price_per_1m),
            output_per_1m: row.output_price_per_1m === null ? null : Number(row.output_price_per_1m)
          }
        : null,
      availability: {
        authorized: this.isPlatformDefaultTenant(row) || Boolean(row.authorization_id),
        priced: Boolean(row.price_version),
        chat_enabled: (this.isPlatformDefaultTenant(row) || Boolean(row.authorization_id)) && Boolean(row.price_version)
      },
      metadata: row.model_metadata ?? {}
    };
  }

  private isPlatformDefaultTenant(row: any) {
    return row.tenant_type === "platform_default" || row.tenant_code === "platform_default_tenant";
  }

  private resolveModelCategory(row: any): ModelCategoryKey {
    const metadata = row.model_metadata ?? {};
    const code = String(row.public_model_code ?? "").toLowerCase();
    const name = String(row.display_name ?? "").toLowerCase();
    const family = String(row.model_family ?? "").toLowerCase();
    const searchable = `${code} ${name} ${family}`;
    const inputModalities = this.normalizeStringArray(metadata.input_modalities ?? metadata.inputModalities ?? row.modality);
    const outputModalities = this.normalizeStringArray(metadata.output_modalities ?? metadata.outputModalities ?? row.modality);
    const inferenceTypes = this.normalizeStringArray(
      metadata.inference_types_supported ?? metadata.inferenceTypesSupported
    );
    const lifecycleStatus = String(metadata.model_lifecycle?.status ?? metadata.modelLifecycle?.status ?? "").toLowerCase();
    const invocationType = String(metadata.invocation_type ?? metadata.invocationType ?? "").toLowerCase();

    if (
      lifecycleStatus === "legacy" ||
      invocationType === "inference_profile" ||
      (inferenceTypes.includes("INFERENCE_PROFILE") && !inferenceTypes.includes("ON_DEMAND"))
    ) {
      return "legacy_inference_profile";
    }

    if (this.hasModality(outputModalities, "EMBEDDING") || /\b(embed|embedding)\b/.test(searchable)) {
      return "embedding";
    }
    if (/\b(rerank|reranker|rank)\b/.test(searchable)) {
      return "rerank";
    }
    if (this.hasModality(outputModalities, "VIDEO") || /\b(veo|video-generation|video generation|reel)\b/.test(searchable)) {
      return "video";
    }
    if (
      this.hasModality(outputModalities, "IMAGE") ||
      /\b(imagen|image-generation|image generation|canvas|stable|diffusion|upscale|titan-image|nova-canvas|virtual-try-on)\b/.test(searchable)
    ) {
      return "image";
    }

    return "text_chat";
  }

  private resolveToolsStatus(row: any, category: ModelCategoryKey): ToolsStatusKey {
    const metadata = row.model_metadata ?? {};
    const storedStatus = String(metadata.tools_status ?? "").toLowerCase();
    if (storedStatus === "supported" || storedStatus === "unsupported" || storedStatus === "unverified") {
      return storedStatus;
    }
    if (Boolean(row.supports_tools) || metadata.tools_verified === true || metadata.tool_use_verified === true) {
      return "supported";
    }
    if (category === "embedding" || category === "image" || category === "video" || category === "rerank") {
      return "unsupported";
    }
    return "unverified";
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      if (typeof value === "string" && value.length > 0) {
        return [value.toUpperCase()];
      }
      return [];
    }
    return value.map((item) => String(item).toUpperCase()).filter(Boolean);
  }

  private hasModality(modalities: string[], expected: string) {
    return modalities.some((item) => item === expected || item.includes(expected));
  }

  private resolveModelCompany(modelCode?: string | null, displayName?: string | null, family?: string | null) {
    const raw = `${family ?? ""} ${modelCode ?? ""} ${displayName ?? ""}`.toLowerCase();
    if (raw.includes("deepseek")) return "DeepSeek";
    if (raw.includes("openai") || raw.includes("gpt-")) return "OpenAI";
    if (raw.includes("anthropic") || raw.includes("claude")) return "Claude";
    if (raw.includes("gemini") || raw.includes("google")) return "Gemini";
    if (raw.includes("qwen") || raw.includes("alibaba") || raw.includes("阿里")) return "阿里巴巴";
    if (raw.includes("midjourney")) return "Midjourney";
    if (raw.includes("grok") || raw.includes("xai")) return "xAI";
    return family ?? "其他";
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
      model_whitelist: [],
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
    if (channel.channel_type === "ios_iap" || channel.payment_method === "apple_iap") {
      return {
        type: "ios_iap_placeholder",
        status: "pending",
        title: channel.display_name,
        order_no: order.order_no,
        payment_method: "apple_iap",
        client_payload: {
          checkout_channel: "ios_iap",
          payment_method: "apple_iap",
          order_no: order.order_no,
          amount: Number(order.amount),
          currency: order.currency
        },
        notice: "iOS 购买必须通过 StoreKit 完成，并提交服务端验签后才会入账。"
      };
    }
    if (channel.channel_type === "android_unified_checkout") {
      const method = String(channel.payment_method);
      const publicMethod = this.toPublicPaymentMethodCode(method);
      return {
        type: "android_unified_checkout",
        status: "pending",
        title: channel.display_name,
        order_no: order.order_no,
        payment_method: publicMethod,
        client_payload: {
          checkout_channel: "android_unified_checkout",
          payment_method: publicMethod,
          order_no: order.order_no,
          amount: Number(order.amount),
          currency: order.currency,
          alipay:
            method === "alipay_app"
              ? {
                  order_string:
                    channel.config?.sandbox_order_string ??
                    `sandbox_alipay_order_string_for_${order.order_no}`
                }
              : null,
          wechat:
            method === "wechat_app"
              ? {
                  app_id: channel.config?.app_id ?? "sandbox_wechat_app_id",
                  partner_id: channel.config?.partner_id ?? "sandbox_partner_id",
                  prepay_id: `sandbox_prepay_${order.order_no}`,
                  package_value: "Sign=WXPay",
                  nonce_str: order.order_no.slice(-12),
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  sign: "sandbox-signature"
                }
              : null,
          card:
            method === "card_hosted_checkout"
              ? {
                  url: channel.config?.hosted_checkout_url ?? null
                }
              : null
        },
        notice: "支付完成后仅代表客户端流程结束，到账以服务端查单和钱包入账为准。"
      };
    }
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

  private async ensureReferralCode(userId: string, tenantId: string) {
    const existing = await this.db.query(
      `select id, code
         from referral_codes
        where tenant_id = $1
          and user_id = $2
          and status = 'active'
        limit 1`,
      [tenantId, userId]
    );
    if (existing.rows[0]) return existing.rows[0];

    const code = `OT${randomToken(8)}`;
    const { rows } = await this.db.query(
      `insert into referral_codes (tenant_id, user_id, code, status, metadata)
       values ($1, $2, $3, 'active', '{"source":"customer_api"}'::jsonb)
       on conflict (tenant_id, user_id) do update
          set updated_at = now()
       returning id, code`,
      [tenantId, userId, code]
    );
    return rows[0];
  }

  private async createReferralRelationIfPresent(
    body: Record<string, unknown>,
    referredUserId: string,
    referredTenantCustomerId: string,
    context: CheckoutContext
  ) {
    const inviteCode = String(body.invite_code ?? body.referral_code ?? "").trim();
    if (!inviteCode) return;
    const { rows } = await this.db.query(
      `select id, user_id
         from referral_codes
        where code = $1
          and tenant_id = $2
          and status = 'active'
        limit 1`,
      [inviteCode, context.tenant.id]
    );
    const code = rows[0];
    if (!code || code.user_id === referredUserId) return;
    await this.db.query(
      `insert into referral_relations
        (tenant_id, referrer_user_id, referred_user_id, referred_tenant_customer_id,
         referral_code_id, source, status, metadata)
       values ($1, $2, $3, $4, $5, 'register', 'active', $6::jsonb)
       on conflict (tenant_id, referred_user_id) do nothing`,
      [
        context.tenant.id,
        code.user_id,
        referredUserId,
        referredTenantCustomerId,
        code.id,
        JSON.stringify({
          platform: context.platform,
          project_id: context.project?.id ?? null
        })
      ]
    );
  }

  private amountByStatus(rows: Array<{ status: string; amount: string | number }>) {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = Number(row.amount ?? 0);
      return acc;
    }, {});
  }

  private async recordRiskEvent(
    context: CheckoutContext,
    userId: string,
    eventType: string,
    riskLevel: "low" | "medium" | "high" | "critical",
    input: {
      subject_type?: string | null;
      subject_id?: string | null;
      device_id?: string | null;
      distribution_channel?: string | null;
      metadata?: Record<string, unknown>;
    } = {}
  ) {
    await this.db.query(
      `insert into risk_events
        (tenant_id, project_id, user_id, event_type, risk_level, subject_type,
         subject_id, device_id, distribution_channel, metadata)
       values ($1, $2, $3, $4, $5, $6,
               $7, $8, $9, $10::jsonb)`,
      [
        context.tenant.id,
        context.project?.id ?? null,
        userId,
        eventType,
        riskLevel,
        input.subject_type ?? null,
        input.subject_id ?? null,
        input.device_id ?? null,
        input.distribution_channel ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );
  }

  private maskPayoutAccount(value: unknown) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    if (raw.length <= 6) return `***${raw.slice(-2)}`;
    return `${raw.slice(0, 2)}***${raw.slice(-4)}`;
  }

  private normalizeEmail(value: unknown) {
    const email = String(value ?? "").trim().toLowerCase();
    return email.includes("@") ? email : "";
  }

  private toPublicPaymentMethodCode(value: unknown) {
    const method = String(value ?? "");
    if (method === "alipay_app") return "alipay_app_pay";
    if (method === "wechat_app") return "wechat_app_pay";
    if (method === "alipay_web") return "alipay_qr";
    return method;
  }

  private toInternalPaymentMethodCode(value: unknown) {
    const method = String(value ?? "");
    if (method === "alipay_app_pay") return "alipay_app";
    if (method === "wechat_app_pay") return "wechat_app";
    if (method === "alipay_qr") return "alipay_qr";
    return method;
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
