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

  for (const [userId, tenantId, customerId, cash, bonus] of [
    [demoUser.rows[0].id, tenant.rows[0].id, demoCustomerId, 500000, 100000],
    [vipUser.rows[0].id, tenant.rows[0].id, vipCustomerId, 880000, 0],
    [externalUser.rows[0].id, externalTenant.rows[0].id, externalCustomerId, 990000, 0]
  ] as const) {
    await pool.query(
      `insert into wallets (user_id, tenant_id, tenant_customer_id, cash_balance, bonus_balance)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, currency) do update set cash_balance = excluded.cash_balance, bonus_balance = excluded.bonus_balance`,
      [userId, tenantId, customerId, cash, bonus]
    );
  }

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

  const product = await pool.query(
    `insert into payment_products (tenant_id, project_id, product_code, name, product_type, face_value_amount, bonus_amount, sale_amount)
     values ($1, $2, 'recharge_100', '充值 100 元', 'wallet_recharge', 10000, 500, 10000)
     on conflict (product_code) do update set name = excluded.name, tenant_id = excluded.tenant_id, project_id = excluded.project_id
     returning id`,
    [tenant.rows[0].id, webProjectId]
  );

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
      [`ORD${crypto.randomUUID().slice(0, 8)}`, tenantId, projectId, customerId, userId, product.rows[0].id, platform, checkoutChannel, method, amount]
    );
  }

  await paymentOrder(demoUser.rows[0].id, tenant.rows[0].id, webProjectId, demoCustomerId, "web", "web_alipay_pc", "alipay_web", 10000);
  await paymentOrder(vipUser.rows[0].id, tenant.rows[0].id, androidProjectId, vipCustomerId, "android", "android_wechat_app", "wechat_app", 20000);
  await paymentOrder(externalUser.rows[0].id, externalTenant.rows[0].id, externalWebProjectId, externalCustomerId, "web", "web_alipay_pc", "alipay_web", 30000);

  async function requestLog(userId: string, tenantId: string, projectId: string, customerId: string, source: string, tokens: number) {
    await pool.query(
      `insert into request_logs
        (request_id, tenant_id, project_id, tenant_customer_id, user_id, source, public_model_code, provider_id, status, estimated_prompt_tokens, estimated_completion_tokens, actual_prompt_tokens, actual_completion_tokens, total_tokens, estimated_cost_amount, actual_cost_amount, latency_ms, finish_reason, redacted_prompt, redacted_completion)
       values ($1, $2, $3, $4, $5, $6, 'anthropic.claude-3-5-sonnet-20241022-v2:0', $7, 'success', 1200, 800, 1188, 733, $8, 36, 33, 842, 'stop', '[redacted]', '[redacted]')
       on conflict (request_id) do nothing`,
      [`req_${crypto.randomUUID()}`, tenantId, projectId, customerId, userId, source, provider.rows[0].id, tokens]
    );
  }

  await requestLog(demoUser.rows[0].id, tenant.rows[0].id, apiProjectId, demoCustomerId, "developer_api", 1921);
  await requestLog(vipUser.rows[0].id, tenant.rows[0].id, androidProjectId, vipCustomerId, "app_chat", 1390);
  await requestLog(externalUser.rows[0].id, externalTenant.rows[0].id, externalWebProjectId, externalCustomerId, "developer_api", 780);

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
