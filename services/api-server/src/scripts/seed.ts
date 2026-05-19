import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import { Pool } from "pg";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const permissions = [
  "provider.read",
  "provider.write",
  "provider.credential.write",
  "provider.sync_models",
  "model.read",
  "model.write",
  "route.read",
  "route.write",
  "price.read",
  "price.write",
  "wallet.read",
  "wallet.adjust",
  "payment.read",
  "payment.refund",
  "payment.reconcile",
  "commission.read",
  "commission.approve",
  "user.read",
  "user.suspend",
  "api_key.read",
  "api_key.write",
  "api_key.revoke",
  "request_log.read",
  "request_log.read_sensitive",
  "config.read",
  "config.write",
  "config.publish",
  "audit.read",
  "tenant.read",
  "tenant.write",
  "tenant.project.read",
  "tenant.project.write",
  "tenant.customer.read",
  "tenant.customer.write",
  "tenant.billing.read",
  "tenant.billing.write",
  "tenant.model.read",
  "tenant.model.write",
  "platform.tenant.read_all",
  "platform.tenant.write_all",
  "customer_assignment.read",
  "customer_assignment.write"
];

async function ensureRole(pool: Pool, code: string, name: string, permissionCodes: string[]) {
  const role = await pool.query(
    `insert into roles (code, name)
     values ($1, $2)
     on conflict (code) do update set name = excluded.name
     returning id`,
    [code, name]
  );
  await pool.query(
    `delete from role_permissions rp
      using permissions p
      where rp.permission_id = p.id
        and rp.role_id = $1
        and not (p.code = any($2::text[]))`,
    [role.rows[0].id, permissionCodes]
  );
  await pool.query(
    `insert into role_permissions (role_id, permission_id)
     select $1, id from permissions where code = any($2::text[])
     on conflict do nothing`,
    [role.rows[0].id, permissionCodes]
  );
  return role.rows[0].id as string;
}

async function main() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgres://chengchengxu@localhost:5432/ai_model_platform"
  });

  for (const code of permissions) {
    await pool.query(
      `insert into permissions (code, name) values ($1, $1) on conflict (code) do nothing`,
      [code]
    );
  }

  const superAdminRoleId = await ensureRole(pool, "super_admin", "Super Admin", permissions);
  const platformMasterRoleId = await ensureRole(pool, "platform_master", "Platform Master", permissions);
  const tenantRoleId = await ensureRole(pool, "tenant", "Tenant", [
    "tenant.read",
    "tenant.project.read",
    "tenant.project.write",
    "tenant.customer.read",
    "tenant.customer.write",
    "tenant.billing.read",
    "tenant.model.read",
    "api_key.read",
    "api_key.write",
    "api_key.revoke",
    "user.read",
    "payment.read",
    "request_log.read"
  ]);

  const passwordHash = await bcrypt.hash("Admin123456!", 12);
  const admin = await pool.query(
    `insert into users (email, password_hash, status, user_type, invite_code)
     values ('admin@example.com', $1, 'active', 'admin', 'ADMIN')
     on conflict (email) do update set password_hash = excluded.password_hash, status = 'active', user_type = 'admin'
     returning id`,
    [passwordHash]
  );
  for (const roleId of [superAdminRoleId, platformMasterRoleId]) {
    await pool.query(
      `insert into user_roles (user_id, role_id) values ($1, $2) on conflict do nothing`,
      [admin.rows[0].id, roleId]
    );
  }

  const supportPasswordHash = await bcrypt.hash("Support123456!", 12);
  const support = await pool.query(
    `insert into users (email, password_hash, status, user_type, invite_code)
     values ('support@example.com', $1, 'active', 'tenant', 'SUPPORT')
     on conflict (email) do update set password_hash = excluded.password_hash, status = 'active', user_type = 'tenant'
     returning id`,
    [supportPasswordHash]
  );
  await pool.query(
    `insert into user_roles (user_id, role_id) values ($1, $2) on conflict do nothing`,
    [support.rows[0].id, tenantRoleId]
  );
  await pool.query(
    `delete from user_roles ur
      using roles r
      where r.id = ur.role_id
        and r.code <> 'tenant'
        and ur.user_id = $1`,
    [support.rows[0].id]
  );

  const tenant = await pool.query(
    `insert into tenants (tenant_code, name, tenant_type, status, billing_mode, current_plan_code, settings)
     values ('platform_default_tenant', '平台自营租户', 'platform_default', 'active', 'prepaid', 'starter', '{"owned_by_platform":true}'::jsonb)
     on conflict (tenant_code) do update set name = excluded.name
     returning id`
  );
  const externalTenant = await pool.query(
    `insert into tenants (tenant_code, name, tenant_type, status, billing_mode, current_plan_code)
     values ('external_demo_tenant', '外部示例租户', 'standard', 'active', 'prepaid', 'starter')
     on conflict (tenant_code) do update set name = excluded.name
     returning id`
  );

  async function project(
    tenantId: string,
    projectCode: string,
    name: string,
    projectType: string,
    platform: string,
    values: Record<string, unknown> = {}
  ) {
    const res = await pool.query(
      `insert into tenant_projects
        (tenant_id, project_code, name, project_type, platform, bundle_id, package_name, web_domain, payment_policy)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       on conflict (tenant_id, project_code) do update set name = excluded.name
       returning id`,
      [
        tenantId,
        projectCode,
        name,
        projectType,
        platform,
        values.bundle_id ?? null,
        values.package_name ?? null,
        values.web_domain ?? null,
        JSON.stringify(values.payment_policy ?? {})
      ]
    );
    return res.rows[0].id as string;
  }

  const iosProjectId = await project(tenant.rows[0].id, "ios-app", "自营 iOS App", "ios_app", "ios", {
    bundle_id: "com.ai.platform.ios",
    payment_policy: { payment_methods: ["apple_iap"] }
  });
  const androidProjectId = await project(tenant.rows[0].id, "android-app", "自营 Android App", "android_app", "android", {
    package_name: "com.ai.platform.android",
    payment_policy: { payment_methods: ["alipay_app", "wechat_app"] }
  });
  const webProjectId = await project(tenant.rows[0].id, "web-checkout", "自营 Web 收银台", "web_checkout", "web", {
    web_domain: "pay.localhost",
    payment_policy: { payment_methods: ["alipay_web", "wechat_web", "card_checkout", "enterprise_transfer"] }
  });
  const apiProjectId = await project(tenant.rows[0].id, "developer-api", "自营开发者 API", "developer_api", "api");
  const externalWebProjectId = await project(externalTenant.rows[0].id, "external-web", "外部租户 Web 收银台", "web_checkout", "web", {
    web_domain: "external-pay.localhost",
    payment_policy: { payment_methods: ["alipay_web", "wechat_web"] }
  });

  await pool.query(
    `insert into tenant_memberships (tenant_id, user_id, role_code, status)
     values ($1, $2, 'tenant', 'active')
     on conflict (tenant_id, user_id, role_code) do update set status = 'active'`,
    [tenant.rows[0].id, support.rows[0].id]
  );
  await pool.query(
    `delete from tenant_memberships
      where tenant_id = $1
        and user_id = $2
        and role_code = 'tenant_admin'`,
    [tenant.rows[0].id, support.rows[0].id]
  );

  const demoUser = await pool.query(
    `insert into users (email, status, user_type, invite_code)
     values ('demo-user@example.com', 'active', 'developer', 'DEMO001')
     on conflict (email) do update set status = 'active', user_type = 'developer'
     returning id`
  );
  const vipUser = await pool.query(
    `insert into users (email, status, user_type, invite_code)
     values ('vip-customer@example.com', 'active', 'consumer', 'VIP001')
     on conflict (email) do update set status = 'active', user_type = 'consumer'
     returning id`
  );
  const externalUser = await pool.query(
    `insert into users (email, status, user_type, invite_code)
     values ('external-customer@example.com', 'active', 'developer', 'OUT001')
     on conflict (email) do update set status = 'active', user_type = 'developer'
     returning id`
  );
  const webCustomerPasswordHash = await bcrypt.hash("Web123456!", 12);
  const webCustomer = await pool.query(
    `insert into users (email, phone, password_hash, status, user_type, invite_code)
     values ('web-customer@example.com', '13800000001', $1, 'active', 'consumer', 'WEB001')
     on conflict (email) do update
        set phone = coalesce(users.phone, excluded.phone),
            password_hash = excluded.password_hash,
            status = 'active',
            user_type = 'consumer'
     returning id`,
    [webCustomerPasswordHash]
  );

  async function tenantCustomer(tenantId: string, userId: string, projectId: string, customerCode: string) {
    const res = await pool.query(
      `insert into tenant_customers (tenant_id, user_id, source_project_id, customer_code, status)
       values ($1, $2, $3, $4, 'active')
       on conflict (tenant_id, user_id) do update set source_project_id = excluded.source_project_id, status = 'active'
       returning id`,
      [tenantId, userId, projectId, customerCode]
    );
    return res.rows[0].id as string;
  }

  const demoCustomerId = await tenantCustomer(tenant.rows[0].id, demoUser.rows[0].id, apiProjectId, "DEMO001");
  const vipCustomerId = await tenantCustomer(tenant.rows[0].id, vipUser.rows[0].id, androidProjectId, "VIP001");
  const externalCustomerId = await tenantCustomer(externalTenant.rows[0].id, externalUser.rows[0].id, externalWebProjectId, "OUT001");
  const webCustomerId = await tenantCustomer(tenant.rows[0].id, webCustomer.rows[0].id, webProjectId, "WEB001");

  for (const [userId, tenantId, customerId, cash, bonus] of [
    [demoUser.rows[0].id, tenant.rows[0].id, demoCustomerId, 500000, 100000],
    [vipUser.rows[0].id, tenant.rows[0].id, vipCustomerId, 880000, 0],
    [externalUser.rows[0].id, externalTenant.rows[0].id, externalCustomerId, 990000, 0],
    [webCustomer.rows[0].id, tenant.rows[0].id, webCustomerId, 168800, 25000]
  ] as const) {
    await pool.query(
      `insert into wallets (user_id, tenant_id, tenant_customer_id, cash_balance, bonus_balance)
       values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, user_id, currency) do update
          set tenant_customer_id = excluded.tenant_customer_id,
              cash_balance = excluded.cash_balance,
              bonus_balance = excluded.bonus_balance,
              updated_at = now()`,
      [userId, tenantId, customerId, cash, bonus]
    );
  }

  async function seedLedger(
    userId: string,
    tenantId: string,
    customerId: string,
    eventType: string,
    direction: string,
    balanceType: string,
    amount: number,
    balanceAfter: number,
    minutesAgo: number,
    idempotencyKey: string
  ) {
    await pool.query(
      `insert into wallet_ledger
        (wallet_id, user_id, tenant_id, tenant_customer_id, event_type, direction,
         balance_type, amount, currency, balance_after, related_type, related_id,
         idempotency_key, metadata, created_at)
       select w.id, $1, $2, $3, $4, $5, $6, $7, 'CNY', $8, 'seed', $9, $10, '{"source":"seed"}'::jsonb, now() - ($11::text || ' minutes')::interval
         from wallets w
        where w.tenant_id = $2
          and w.user_id = $1
          and w.currency = 'CNY'
       on conflict (idempotency_key) do update
          set amount = excluded.amount,
              balance_after = excluded.balance_after,
              created_at = excluded.created_at`,
      [
        userId,
        tenantId,
        customerId,
        eventType,
        direction,
        balanceType,
        amount,
        balanceAfter,
        idempotencyKey,
        idempotencyKey,
        minutesAgo
      ]
    );
  }

  await seedLedger(webCustomer.rows[0].id, tenant.rows[0].id, webCustomerId, "payment.fulfill", "credit", "cash", 10000, 100000, 7200, "seed:web:ledger:recharge:100");
  await seedLedger(webCustomer.rows[0].id, tenant.rows[0].id, webCustomerId, "payment.bonus", "credit", "bonus", 800, 100800, 7198, "seed:web:ledger:bonus:100");
  await seedLedger(webCustomer.rows[0].id, tenant.rows[0].id, webCustomerId, "usage.charge", "debit", "cash", 1260, 99540, 3400, "seed:web:ledger:usage:1");
  await seedLedger(webCustomer.rows[0].id, tenant.rows[0].id, webCustomerId, "payment.fulfill", "credit", "cash", 30000, 158800, 860, "seed:web:ledger:recharge:300");
  await seedLedger(webCustomer.rows[0].id, tenant.rows[0].id, webCustomerId, "payment.bonus", "credit", "bonus", 3600, 183400, 858, "seed:web:ledger:bonus:300");
  await seedLedger(webCustomer.rows[0].id, tenant.rows[0].id, webCustomerId, "usage.charge", "debit", "cash", 1460, 168800, 70, "seed:web:ledger:usage:2");

  const provider = await pool.query(
    `insert into providers (code, name, provider_type, base_url, region, legal_scope, monthly_budget, rpm_limit, tpm_limit, health_status, health_score, metadata)
     values ('aws-bedrock-main', 'AWS Bedrock 主线路', 'aws_bedrock', 'https://bedrock.us-east-1.amazonaws.com', 'us-east-1', 'authorized_resale', 100000000, 1200, 200000, 'healthy', 0.9821, '{"model_source":"syncable"}'::jsonb)
     on conflict (code) do update set name = excluded.name, provider_type = excluded.provider_type
     returning id`
  );
  const model = await pool.query(
    `insert into models (public_model_code, display_name, model_family, max_context_tokens, default_max_output_tokens, supports_stream, supports_tools, supports_json_mode, metadata)
     values ('anthropic.claude-3-5-sonnet-20241022-v2:0', 'Claude 3.5 Sonnet on Bedrock', 'Anthropic', 200000, 4096, true, true, false, '{"source":"seed"}'::jsonb)
     on conflict (public_model_code) do update set display_name = excluded.display_name
     returning id`
  );
  await pool.query(
    `insert into model_prices (model_id, price_version, input_price_per_1k, output_price_per_1k, reserve_multiplier)
     values ($1, '2026-05-mvp', 8, 32, 1.2)
     on conflict (model_id, price_version) do nothing`,
    [model.rows[0].id]
  );
  await pool.query(
    `insert into model_routes (route_code, model_id, provider_id, provider_model_code, weight, priority)
     values ('bedrock-claude-3-5-sonnet-primary', $1, $2, 'anthropic.claude-3-5-sonnet-20241022-v2:0', 100, 100)
     on conflict (route_code) do nothing`,
    [model.rows[0].id, provider.rows[0].id]
  );

  const modelCatalog = [
    ["gpt-4.1", "GPT-4.1", "OpenAI", 1047576, 8192, true, true, true, 875, 7000],
    ["gpt-4.1-mini", "GPT-4.1 Mini", "OpenAI", 1047576, 8192, true, true, true, 280, 1120],
    ["gpt-4o", "GPT-4o", "OpenAI", 128000, 4096, true, true, true, 1750, 7000],
    ["gpt-4o-mini", "GPT-4o Mini", "OpenAI", 128000, 4096, true, true, true, 105, 420],
    ["gpt-5", "GPT-5", "OpenAI", 400000, 8192, true, true, true, 875, 7000],
    ["gpt-5-mini", "GPT-5 Mini", "OpenAI", 400000, 8192, true, true, true, 175, 1400],
    ["claude-sonnet-4-5", "Claude Sonnet 4.5", "Anthropic", 200000, 8192, true, true, false, 2100, 10500],
    ["claude-opus-4-5", "Claude Opus 4.5", "Anthropic", 200000, 8192, true, true, false, 10500, 52500],
    ["gemini-3-pro-preview", "Gemini 3 Pro Preview", "Google", 1000000, 8192, true, true, true, 875, 3500],
    ["gemini-3-flash", "Gemini 3 Flash", "Google", 1000000, 8192, true, true, true, 70, 280],
    ["deepseek-v4-pro", "DeepSeek V4 Pro", "DeepSeek", 128000, 8192, true, true, true, 140, 560],
    ["deepseek-v4-flash", "DeepSeek V4 Flash", "DeepSeek", 128000, 8192, true, true, true, 28, 112],
    ["grok-4", "Grok 4", "xAI", 256000, 8192, true, true, true, 1400, 7000],
    ["qwen3-max", "Qwen3 Max", "阿里巴巴", 262144, 8192, true, true, true, 175, 700],
    ["qwen3-coder-plus", "Qwen3 Coder Plus", "阿里巴巴", 262144, 8192, true, true, true, 210, 840],
    ["midjourney-v7", "Midjourney V7", "Midjourney", 8192, 2048, false, false, false, 3500, 3500]
  ] as const;

  for (const item of modelCatalog) {
    const [
      publicModelCode,
      displayName,
      modelFamily,
      maxContextTokens,
      defaultMaxOutputTokens,
      supportsStream,
      supportsTools,
      supportsJsonMode,
      inputPrice,
      outputPrice
    ] = item;
    const insertedModel = await pool.query(
      `insert into models
        (public_model_code, display_name, model_family, max_context_tokens, default_max_output_tokens,
         supports_stream, supports_tools, supports_json_mode, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, '{"source":"seed_catalog"}'::jsonb)
       on conflict (public_model_code) do update
          set display_name = excluded.display_name,
              model_family = excluded.model_family,
              max_context_tokens = excluded.max_context_tokens,
              default_max_output_tokens = excluded.default_max_output_tokens,
              supports_stream = excluded.supports_stream,
              supports_tools = excluded.supports_tools,
              supports_json_mode = excluded.supports_json_mode,
              status = 'active',
              updated_at = now()
       returning id`,
      [
        publicModelCode,
        displayName,
        modelFamily,
        maxContextTokens,
        defaultMaxOutputTokens,
        supportsStream,
        supportsTools,
        supportsJsonMode
      ]
    );
    await pool.query(
      `insert into model_prices
        (model_id, price_version, currency, input_price_per_1k, output_price_per_1k, cache_read_price_per_1k, reserve_multiplier, status)
       values ($1, '2026-05-catalog', 'CNY', $2::bigint, $3::bigint, greatest(floor($2::numeric * 0.1)::bigint, 0), 1.2, 'active')
       on conflict (model_id, price_version) do update
          set input_price_per_1k = excluded.input_price_per_1k,
              output_price_per_1k = excluded.output_price_per_1k,
              cache_read_price_per_1k = excluded.cache_read_price_per_1k,
              status = 'active',
              updated_at = now()`,
      [insertedModel.rows[0].id, inputPrice, outputPrice]
    );
    await pool.query(
      `insert into model_routes
        (route_code, model_id, provider_id, provider_model_code, weight, priority, strategy, enabled, allow_fallback)
       values ($1, $2, $3, $4, 100, 100, 'weighted_round_robin', true, true)
       on conflict (route_code) do update
          set model_id = excluded.model_id,
              provider_id = excluded.provider_id,
              provider_model_code = excluded.provider_model_code,
              enabled = true,
              updated_at = now()`,
      [`seed-${publicModelCode.replace(/[^a-zA-Z0-9]+/g, "-")}`, insertedModel.rows[0].id, provider.rows[0].id, publicModelCode]
    );
  }

  await pool.query(
    `insert into tenant_plans
      (plan_code, name, billing_cycle, base_fee_amount, included_credit, included_token_budget, max_projects, max_customers, max_members, log_retention_days, support_level, status)
     values
      ('starter', 'Starter', 'monthly', 9900, 10000, 1000000, 3, 1000, 3, 30, 'standard', 'active'),
      ('growth', 'Growth', 'monthly', 49900, 80000, 10000000, 10, 10000, 10, 90, 'priority', 'active'),
      ('business', 'Business', 'monthly', 199900, 300000, 50000000, 50, 100000, 50, 180, 'business', 'active')
     on conflict (plan_code) do update
        set name = excluded.name,
            base_fee_amount = excluded.base_fee_amount,
            included_credit = excluded.included_credit,
            updated_at = now()`
  );

  await pool.query(
    `insert into tenant_subscriptions
      (tenant_id, plan_id, subscription_no, status, billing_mode, base_fee_amount, included_credit, next_billing_at)
     select t.id, p.id, 'SUB-' || t.tenant_code, 'active', 'subscription_usage', p.base_fee_amount, p.included_credit, date_trunc('month', now()) + interval '1 month'
       from tenants t
       join tenant_plans p on p.plan_code = coalesce(t.current_plan_code, 'starter')
     on conflict (subscription_no) do update
        set plan_id = excluded.plan_id,
            billing_mode = excluded.billing_mode,
            base_fee_amount = excluded.base_fee_amount,
            included_credit = excluded.included_credit,
            updated_at = now()`
  );

  await pool.query(
    `insert into tenant_billing_rules
      (tenant_id, rule_code, rule_version, status, billing_mode, price_type, base_fee_amount, included_credit, included_token_budget, min_commit_amount, cost_plus_markup_rate, min_margin_multiplier, revenue_share_rate, revenue_share_base, payment_service_fee_rate)
     select t.id,
            t.tenant_code || '-default',
            '2026-05',
            'published',
            'subscription_usage',
            'cost_plus',
            p.base_fee_amount,
            p.included_credit,
            p.included_token_budget,
            case when t.tenant_type = 'platform_default' then 0 else 500000 end,
            0.3000,
            1.2000,
            0.1500,
            'net_after_payment_fee',
            0.0060
       from tenants t
       join tenant_plans p on p.plan_code = coalesce(t.current_plan_code, 'starter')
     on conflict (rule_code, rule_version) do nothing`
  );

  await pool.query(
    `insert into tenant_model_authorizations
      (tenant_id, model_id, status, max_context_tokens, rpm_limit, tpm_limit, monthly_budget, enabled_features)
     select t.id, m.id, 'active', m.max_context_tokens, 600, 120000, 50000000, array['chat','stream','tools']
       from tenants t
      cross join models m
     on conflict (tenant_id, model_id) do nothing`
  );

  await pool.query(
    `insert into tenant_model_prices
      (tenant_id, model_id, price_version, currency, pricing_mode, input_price_per_1k, output_price_per_1k, min_margin_multiplier, cost_plus_markup_rate, status)
     select t.id, m.id, '2026-05-mvp', 'CNY', 'contract_price', 10, 40, 1.2000, 0.3000, 'active'
       from tenants t
      cross join models m
     on conflict (tenant_id, model_id, price_version) do nothing`
  );

  await pool.query(
    `insert into tenant_model_prices
      (tenant_id, model_id, price_version, currency, pricing_mode, input_price_per_1k, output_price_per_1k, min_margin_multiplier, cost_plus_markup_rate, status)
     select t.id,
            mp.model_id,
            '2026-05-catalog',
            'CNY',
            'contract_price',
            mp.input_price_per_1k,
            mp.output_price_per_1k,
            1.2000,
            0.3000,
            'active'
       from tenants t
       join model_prices mp on mp.price_version = '2026-05-catalog' and mp.status = 'active'
      on conflict (tenant_id, model_id, price_version) do update
         set input_price_per_1k = excluded.input_price_per_1k,
             output_price_per_1k = excluded.output_price_per_1k,
             status = 'active',
             updated_at = now()`
  );

  const rechargeProducts = [
    {
      code: "recharge_30",
      name: "30 元体验包",
      faceValue: 3000,
      bonus: 0,
      sale: 3000,
      badge: "体验",
      sort: 10,
      features: ["小额试用", "Web 与 API 共用", "余额 365 天有效"]
    },
    {
      code: "recharge_100",
      name: "100 元标准包",
      faceValue: 10000,
      bonus: 800,
      sale: 10000,
      badge: "推荐",
      sort: 20,
      features: ["多模型通用", "赠送 8 元额度", "适合个人项目"]
    },
    {
      code: "recharge_300",
      name: "300 元进阶包",
      faceValue: 30000,
      bonus: 3600,
      sale: 30000,
      badge: "高性价比",
      sort: 30,
      features: ["赠送 36 元额度", "适合高频调试", "支持发票资料"]
    },
    {
      code: "recharge_1000",
      name: "1000 元团队包",
      faceValue: 100000,
      bonus: 18000,
      sale: 100000,
      badge: "团队",
      sort: 40,
      features: ["赠送 180 元额度", "团队共享余额", "对公转账友好"]
    },
    {
      code: "recharge_3000",
      name: "3000 元企业包",
      faceValue: 300000,
      bonus: 66000,
      sale: 300000,
      badge: "企业",
      sort: 50,
      features: ["赠送 660 元额度", "适合生产环境", "支持人工对账"]
    }
  ] as const;

  const productIds = new Map<string, string>();
  for (const item of rechargeProducts) {
    const insertedProduct = await pool.query(
      `insert into payment_products
         (tenant_id, project_id, product_code, name, product_type, face_value_amount, bonus_amount, sale_amount, metadata)
       values ($1, null, $2, $3, 'recharge_credit', $4, $5, $6, $7::jsonb)
       on conflict (product_code) do update
          set name = excluded.name,
              tenant_id = excluded.tenant_id,
              project_id = excluded.project_id,
              product_type = excluded.product_type,
              face_value_amount = excluded.face_value_amount,
              bonus_amount = excluded.bonus_amount,
              sale_amount = excluded.sale_amount,
              status = 'active',
              metadata = excluded.metadata,
              updated_at = now()
       returning id`,
      [
        tenant.rows[0].id,
        item.code,
        item.name,
        item.faceValue,
        item.bonus,
        item.sale,
        JSON.stringify({
          title: item.name,
          subtitle: "App、Web 和 API 共用余额",
          description: `到账 ${item.faceValue / 100} 元，赠送 ${item.bonus / 100} 元额度`,
          features: item.features,
          badge: item.badge,
          valid_days: 365
        })
      ]
    );
    productIds.set(item.code, insertedProduct.rows[0].id);

    const productVisibilityRows = [
      [
        insertedProduct.rows[0].id,
        tenant.rows[0].id,
        iosProjectId,
        "ios",
        `iOS ${item.name}`,
        "Apple IAP 支付，到账到同一客户钱包",
        item.badge,
        item.sort,
        { app_store_product_id: `ai_platform_${item.code}`, features: item.features }
      ],
      [
        insertedProduct.rows[0].id,
        tenant.rows[0].id,
        androidProjectId,
        "android",
        `Android ${item.name}`,
        "支持支付宝 App 支付和微信 App 支付",
        item.badge,
        item.sort,
        { allow_web_payment_entry: true, features: item.features }
      ],
      [
        insertedProduct.rows[0].id,
        tenant.rows[0].id,
        webProjectId,
        "web",
        item.name,
        "支持支付宝、微信、银行卡托管收银台和企业对公转账",
        item.badge,
        item.sort,
        { allow_enterprise_transfer: true, features: item.features }
      ],
      [
        insertedProduct.rows[0].id,
        tenant.rows[0].id,
        apiProjectId,
        "api",
        `API ${item.name}`,
        "适合开发者 API 调用充值",
        item.badge,
        item.sort,
        { checkout_entry: "developer_console", features: item.features }
      ]
    ] as const;

    for (const row of productVisibilityRows) {
      await pool.query(
        `insert into payment_product_visibility
          (product_id, tenant_id, project_id, platform, display_name, display_description, badge, sort_order, enabled, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, true, $9::jsonb)
         on conflict (product_id, project_id, platform) do update
            set tenant_id = excluded.tenant_id,
                display_name = excluded.display_name,
                display_description = excluded.display_description,
                badge = excluded.badge,
                sort_order = excluded.sort_order,
                enabled = excluded.enabled,
                metadata = excluded.metadata,
                updated_at = now()`,
        [...row.slice(0, 8), JSON.stringify(row[8])]
      );
    }
  }

  const primaryProductId = productIds.get("recharge_100")!;

  const channelRows = [
    [tenant.rows[0].id, iosProjectId, "ios_apple_iap", "apple_iap", "iOS Apple IAP", "ios", "apple_iap", "app_store_collected", 3000, 10, { storekit: true, server_api_required: true }],
    [tenant.rows[0].id, androidProjectId, "android_alipay_app", "android_unified_checkout", "Android 支付宝 App 支付", "android", "alipay_app", "platform_collected", 60, 20, { adapter: "alipay_app" }],
    [tenant.rows[0].id, androidProjectId, "android_wechat_app", "android_unified_checkout", "Android 微信 App 支付", "android", "wechat_app", "platform_collected", 60, 30, { adapter: "wechat_app" }],
    [tenant.rows[0].id, webProjectId, "web_alipay_pc", "alipay_web", "Web 支付宝电脑网站支付", "web", "alipay_web", "platform_collected", 60, 40, { adapter: "alipay_page" }],
    [tenant.rows[0].id, webProjectId, "web_wechat_native", "wechat_web", "Web 微信 Native 支付", "web", "wechat_native", "platform_collected", 60, 50, { adapter: "wechat_native" }],
    [tenant.rows[0].id, webProjectId, "web_card_checkout", "card_checkout", "Web 银行卡/信用卡托管收银台", "web", "card_checkout", "platform_collected", 200, 60, { adapter: "hosted_card_checkout" }],
    [tenant.rows[0].id, webProjectId, "web_enterprise_transfer", "enterprise_transfer", "Web 企业对公转账", "web", "enterprise_transfer", "tenant_or_platform_collected", 0, 70, { manual_reconciliation: true }]
  ] as const;

  for (const row of channelRows) {
    await pool.query(
      `insert into payment_channels
        (tenant_id, project_id, channel_code, channel_type, display_name, platform, payment_method, settlement_mode, fee_rate_bps, sort_order, enabled, config)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11::jsonb)
       on conflict (channel_code) do update
          set display_name = excluded.display_name,
              platform = excluded.platform,
              payment_method = excluded.payment_method,
              settlement_mode = excluded.settlement_mode,
              config = excluded.config`,
      [...row.slice(0, 10), JSON.stringify(row[10])]
    );
  }

  await pool.query(
    `delete from distribution_policies
      where tenant_id = $1
        and distribution_channel in ('official', 'official_apk', 'app_store', 'testflight')
        and package_name = '*'`,
    [tenant.rows[0].id]
  );
  const distributionPolicyRows = [
    [
      tenant.rows[0].id,
      iosProjectId,
      "ios",
      "app_store",
      "*",
      "CN",
      false,
      null,
      ["apple_iap"],
      "iOS App 内购买由 App Store 处理，到账以服务端确认 Apple IAP 交易后为准。",
      false,
      false,
      { privacy_notice_variant: "standard_cn", content_safety_notice: "请遵守平台 AI 生成内容规范。" }
    ],
    [
      tenant.rows[0].id,
      iosProjectId,
      "ios",
      "testflight",
      "*",
      "CN",
      false,
      null,
      ["apple_iap"],
      "TestFlight 环境使用 Apple IAP 沙箱商品，到账以服务端确认后为准。",
      false,
      false,
      { privacy_notice_variant: "standard_cn" }
    ],
    [
      tenant.rows[0].id,
      androidProjectId,
      "android",
      "official_apk",
      "*",
      "CN",
      true,
      "https://pay.example.com",
      ["alipay_app", "wechat_app"],
      "安卓支付统一走平台收银台，应用市场仅作为分发渠道，不进入支付主干。",
      false,
      true,
      { privacy_notice_variant: "standard_cn" }
    ],
    [
      tenant.rows[0].id,
      webProjectId,
      "web",
      "official",
      "*",
      "CN",
      true,
      "https://pay.example.com",
      ["alipay_web", "wechat_native", "card_checkout", "enterprise_transfer"],
      "Web 支付支持支付宝、微信、托管银行卡和企业对公转账。",
      false,
      true,
      { privacy_notice_variant: "standard_cn" }
    ]
  ] as const;
  for (const row of distributionPolicyRows) {
    await pool.query(
      `insert into distribution_policies
        (tenant_id, project_id, platform, distribution_channel, package_name, region,
         show_web_payment_link, web_payment_url, allowed_payment_methods,
         payment_page_notice, review_mode, legal_approved, status, metadata)
       values ($1, $2, $3, $4, $5, $6,
               $7, $8, $9::text[],
               $10, $11, $12, 'active', $13::jsonb)`,
      [
        row[0],
        row[1],
        row[2],
        row[3],
        row[4],
        row[5],
        row[6],
        row[7],
        row[8],
        row[9],
        row[10],
        row[11],
        JSON.stringify(row[12])
      ]
    );
  }

  async function paymentOrder(
    userId: string,
    tenantId: string,
    projectId: string,
    customerId: string,
    platform: string,
    checkoutChannel: string,
    method: string,
    amount: number
  ) {
    await pool.query(
      `insert into payment_orders
        (order_no, tenant_id, project_id, tenant_customer_id, user_id, product_id, platform, checkout_channel, payment_method, amount, status, paid_at, fulfilled_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'FULFILLED', now(), now())
       on conflict (order_no) do nothing`,
      [`ORD${crypto.randomUUID().slice(0, 8)}`, tenantId, projectId, customerId, userId, primaryProductId, platform, checkoutChannel, method, amount]
    );
  }

  await paymentOrder(demoUser.rows[0].id, tenant.rows[0].id, webProjectId, demoCustomerId, "web", "web_alipay_pc", "alipay_web", 10000);
  await paymentOrder(webCustomer.rows[0].id, tenant.rows[0].id, webProjectId, webCustomerId, "web", "web_wechat_native", "wechat_native", 30000);
  await paymentOrder(vipUser.rows[0].id, tenant.rows[0].id, androidProjectId, vipCustomerId, "android", "android_wechat_app", "wechat_app", 20000);
  await paymentOrder(externalUser.rows[0].id, externalTenant.rows[0].id, externalWebProjectId, externalCustomerId, "web", "web_alipay_pc", "alipay_web", 30000);

  async function requestLog(
    requestKey: string,
    userId: string,
    tenantId: string,
    projectId: string,
    customerId: string,
    source: string,
    modelCode: string,
    promptTokens: number,
    completionTokens: number,
    costAmount: number,
    latencyMs: number,
    minutesAgo: number
  ) {
    const totalTokens = promptTokens + completionTokens;
    await pool.query(
      `insert into request_logs
        (request_id, tenant_id, project_id, tenant_customer_id, user_id, source, public_model_code,
         provider_id, status, stream, estimated_prompt_tokens, estimated_completion_tokens,
         actual_prompt_tokens, actual_completion_tokens, total_tokens, estimated_cost_amount,
         actual_cost_amount, latency_ms, finish_reason, redacted_prompt, redacted_completion,
         metadata, created_at, completed_at)
       values ($1, $2, $3, $4, $5, $6, $7,
               $8, 'success', true, $9, $10,
               $9, $10, $11, $12,
               $12, $13, 'stop', '[redacted]', '[redacted]',
               '{"source":"seed"}'::jsonb, now() - ($14::text || ' minutes')::interval, now() - (($14::int - 1)::text || ' minutes')::interval)
       on conflict (request_id) do nothing`,
      [
        `req_seed_${requestKey}`,
        tenantId,
        projectId,
        customerId,
        userId,
        source,
        modelCode,
        provider.rows[0].id,
        promptTokens,
        completionTokens,
        totalTokens,
        costAmount,
        latencyMs,
        minutesAgo
      ]
    );
  }

  await requestLog("demo-api-1", demoUser.rows[0].id, tenant.rows[0].id, apiProjectId, demoCustomerId, "developer_api", "anthropic.claude-3-5-sonnet-20241022-v2:0", 1188, 733, 33, 842, 180);
  await requestLog("vip-app-1", vipUser.rows[0].id, tenant.rows[0].id, androidProjectId, vipCustomerId, "app_chat", "gpt-4o-mini", 900, 490, 18, 612, 240);
  await requestLog("external-api-1", externalUser.rows[0].id, externalTenant.rows[0].id, externalWebProjectId, externalCustomerId, "developer_api", "gpt-4.1-mini", 460, 320, 12, 701, 300);

  const webLogs = [
    ["developer_api", "gpt-4o-mini", 860, 420, 14, 512, 35],
    ["developer_api", "claude-sonnet-4-5", 2400, 880, 86, 1090, 78],
    ["app_chat", "gemini-3-flash", 1260, 640, 16, 438, 126],
    ["developer_api", "qwen3-coder-plus", 1890, 910, 28, 760, 310],
    ["developer_api", "deepseek-v4-flash", 2300, 1200, 10, 492, 730],
    ["app_chat", "gpt-4.1-mini", 740, 360, 11, 388, 1560],
    ["developer_api", "grok-4", 3100, 800, 96, 1288, 2450],
    ["developer_api", "gemini-3-pro-preview", 1800, 960, 51, 940, 3180],
    ["app_chat", "deepseek-v4-pro", 1540, 690, 18, 620, 4460],
    ["developer_api", "gpt-5-mini", 2200, 780, 42, 880, 5900]
  ] as const;
  for (const [index, item] of webLogs.entries()) {
    const [source, modelCode, promptTokens, completionTokens, costAmount, latencyMs, minutesAgo] = item;
    await requestLog(
      `web-${index + 1}`,
      webCustomer.rows[0].id,
      tenant.rows[0].id,
      webProjectId,
      webCustomerId,
      source,
      modelCode,
      promptTokens,
      completionTokens,
      costAmount,
      latencyMs,
      minutesAgo
    );
  }

  await pool.query(
    `insert into tenant_usage_aggregates
      (tenant_id, project_id, model_id, period_start, period_end, total_requests, total_tokens, provider_cost_amount, tenant_wholesale_amount, end_user_revenue_amount, status)
     select rl.tenant_id,
            rl.project_id,
            m.id,
            date_trunc('month', now()),
            date_trunc('month', now()) + interval '1 month',
            count(*)::bigint,
            coalesce(sum(rl.total_tokens), 0)::bigint,
            coalesce(sum(rl.actual_cost_amount), 0)::bigint,
            ceil(coalesce(sum(rl.actual_cost_amount), 0) * 1.3)::bigint,
            coalesce((select sum(po.amount) from payment_orders po where po.tenant_id = rl.tenant_id and po.project_id is not distinct from rl.project_id), 0)::bigint,
            'open'
       from request_logs rl
       left join models m on m.public_model_code = rl.public_model_code
      group by rl.tenant_id, rl.project_id, m.id
     on conflict (tenant_id, project_id, model_id, period_start, period_end) do update
        set total_requests = excluded.total_requests,
            total_tokens = excluded.total_tokens,
            provider_cost_amount = excluded.provider_cost_amount,
            tenant_wholesale_amount = excluded.tenant_wholesale_amount,
            end_user_revenue_amount = excluded.end_user_revenue_amount,
            updated_at = now()`
  );

  await pool.query(
    `insert into tenant_revenue_share_records
      (tenant_id, payment_order_id, status, payment_gross_amount, payment_channel_fee, provider_cost_amount, platform_share_amount, tenant_share_amount, revenue_share_rate, metadata)
     select po.tenant_id,
            po.id,
            'pending',
            po.amount,
            ceil(po.amount * 0.006)::bigint,
            0,
            ceil((po.amount - ceil(po.amount * 0.006)) * 0.85)::bigint,
            floor((po.amount - ceil(po.amount * 0.006)) * 0.15)::bigint,
            0.1500,
            '{"source":"seed"}'::jsonb
       from payment_orders po
      where po.tenant_id is not null
        and not exists (
          select 1
            from tenant_revenue_share_records rs
           where rs.payment_order_id = po.id
        )`
  );

  await pool.query(
    `insert into configs (config_key, config_type, draft_value, published_value, status, config_version)
     values ('web_payment_entry', 'checkout', '{"enabled":true,"url":"https://pay.example.com"}', '{"enabled":true,"url":"https://pay.example.com"}', 'published', 1)
     on conflict (config_key) do nothing`
  );

  console.log("seed complete: admin@example.com / Admin123456!, support@example.com / Support123456!");
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
