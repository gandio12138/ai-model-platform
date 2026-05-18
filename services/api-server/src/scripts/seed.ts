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
  "api_key.revoke",
  "request_log.read",
  "request_log.read_sensitive",
  "config.read",
  "config.write",
  "config.publish",
  "audit.read",
  "customer_assignment.read",
  "customer_assignment.write"
];

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

  const role = await pool.query(
    `insert into roles (code, name)
     values ('super_admin', 'Super Admin')
     on conflict (code) do update set name = excluded.name
     returning id`
  );
  const roleId = role.rows[0].id;
  await pool.query(
    `insert into role_permissions (role_id, permission_id)
     select $1, id from permissions
     on conflict do nothing`,
    [roleId]
  );

  const supportRole = await pool.query(
    `insert into roles (code, name)
     values ('support_agent', 'Support Agent')
     on conflict (code) do update set name = excluded.name
     returning id`
  );
  await pool.query(
    `insert into role_permissions (role_id, permission_id)
     select $1, id
       from permissions
      where code in ('user.read','wallet.read','payment.read','request_log.read')
     on conflict do nothing`,
    [supportRole.rows[0].id]
  );

  const passwordHash = await bcrypt.hash("Admin123456!", 12);
  const admin = await pool.query(
    `insert into users (email, password_hash, status, user_type, invite_code)
     values ('admin@example.com', $1, 'active', 'admin', 'ADMIN')
     on conflict (email) do update set password_hash = excluded.password_hash, status = 'active'
     returning id`,
    [passwordHash]
  );
  await pool.query(
    `insert into user_roles (user_id, role_id) values ($1, $2) on conflict do nothing`,
    [admin.rows[0].id, roleId]
  );

  const supportPasswordHash = await bcrypt.hash("Support123456!", 12);
  const support = await pool.query(
    `insert into users (email, password_hash, status, user_type, invite_code)
     values ('support@example.com', $1, 'active', 'admin', 'SUPPORT')
     on conflict (email) do update set password_hash = excluded.password_hash, status = 'active'
     returning id`,
    [supportPasswordHash]
  );
  await pool.query(
    `insert into user_roles (user_id, role_id) values ($1, $2) on conflict do nothing`,
    [support.rows[0].id, supportRole.rows[0].id]
  );

  const user = await pool.query(
    `insert into users (email, status, user_type, invite_code)
     values ('demo-user@example.com', 'active', 'developer', 'DEMO001')
     on conflict (email) do update set status = 'active'
     returning id`
  );
  const wallet = await pool.query(
    `insert into wallets (user_id, cash_balance, bonus_balance)
     values ($1, 500000, 100000)
     on conflict (user_id, currency) do update set cash_balance = excluded.cash_balance
     returning id`,
    [user.rows[0].id]
  );

  const vipUser = await pool.query(
    `insert into users (email, status, user_type, invite_code)
     values ('vip-customer@example.com', 'active', 'consumer', 'VIP001')
     on conflict (email) do update set status = 'active'
     returning id`
  );
  await pool.query(
    `insert into wallets (user_id, cash_balance, bonus_balance)
     values ($1, 880000, 0)
     on conflict (user_id, currency) do update set cash_balance = excluded.cash_balance`,
    [vipUser.rows[0].id]
  );

  const externalUser = await pool.query(
    `insert into users (email, status, user_type, invite_code)
     values ('external-customer@example.com', 'active', 'developer', 'OUT001')
     on conflict (email) do update set status = 'active'
     returning id`
  );
  await pool.query(
    `insert into wallets (user_id, cash_balance, bonus_balance)
     values ($1, 990000, 0)
     on conflict (user_id, currency) do update set cash_balance = excluded.cash_balance`,
    [externalUser.rows[0].id]
  );

  for (const customerId of [user.rows[0].id, vipUser.rows[0].id]) {
    await pool.query(
      `insert into admin_customer_accounts (admin_user_id, customer_user_id, status, scope_note)
       values ($1, $2, 'active', 'Support-owned customer')
       on conflict (admin_user_id, customer_user_id) do update set status = 'active'`,
      [support.rows[0].id, customerId]
    );
  }

  const provider = await pool.query(
    `insert into providers (code, name, provider_type, base_url, region, legal_scope, monthly_budget, rpm_limit, tpm_limit, health_status, health_score)
     values ('openai-wholesale-1', 'OpenAI Wholesale Line 1', 'openai_compatible', 'https://api.example.com/v1', 'US', 'authorized_resale', 100000000, 1200, 200000, 'healthy', 0.9821)
     on conflict (code) do update set name = excluded.name
     returning id`
  );
  const model = await pool.query(
    `insert into models (public_model_code, display_name, model_family, max_context_tokens, default_max_output_tokens, supports_stream, supports_tools, supports_json_mode)
     values ('gpt-4o', 'GPT-4o', 'openai', 128000, 4096, true, true, true)
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
     values ('gpt-4o-primary', $1, $2, 'gpt-4o', 100, 100)
     on conflict (route_code) do nothing`,
    [model.rows[0].id, provider.rows[0].id]
  );

  const product = await pool.query(
    `insert into payment_products (product_code, name, product_type, face_value_amount, bonus_amount, sale_amount)
     values ('recharge_100', 'Recharge 100 CNY', 'wallet_recharge', 10000, 500, 10000)
     on conflict (product_code) do update set name = excluded.name
     returning id`
  );
  await pool.query(
    `insert into payment_channels (channel_code, channel_type, display_name, platform, enabled, config)
     values
       ('android_unified_checkout', 'android_unified_checkout', 'Android Unified Checkout', 'android', true, '{"methods":["alipay","wechat"]}'::jsonb),
       ('web_alipay', 'alipay_web', 'Alipay Web', 'web', true, '{}'::jsonb)
     on conflict (channel_code) do nothing`
  );
  await pool.query(
    `insert into payment_orders (order_no, user_id, product_id, platform, checkout_channel, payment_method, amount, status, paid_at, fulfilled_at)
     values ($1, $2, $3, 'web', 'web_alipay', 'alipay', 10000, 'FULFILLED', now(), now())
     on conflict (order_no) do nothing`,
    [`ORD${crypto.randomUUID().slice(0, 8)}`, user.rows[0].id, product.rows[0].id]
  );
  await pool.query(
    `insert into payment_orders (order_no, user_id, product_id, platform, checkout_channel, payment_method, amount, status, paid_at, fulfilled_at)
     values ($1, $2, $3, 'android', 'android_unified_checkout', 'wechat', 20000, 'FULFILLED', now(), now())
     on conflict (order_no) do nothing`,
    [`ORD${crypto.randomUUID().slice(0, 8)}`, vipUser.rows[0].id, product.rows[0].id]
  );
  await pool.query(
    `insert into payment_orders (order_no, user_id, product_id, platform, checkout_channel, payment_method, amount, status, paid_at, fulfilled_at)
     values ($1, $2, $3, 'web', 'web_alipay', 'alipay', 30000, 'FULFILLED', now(), now())
     on conflict (order_no) do nothing`,
    [`ORD${crypto.randomUUID().slice(0, 8)}`, externalUser.rows[0].id, product.rows[0].id]
  );
  await pool.query(
    `insert into request_logs (request_id, user_id, source, public_model_code, provider_id, status, estimated_prompt_tokens, estimated_completion_tokens, actual_prompt_tokens, actual_completion_tokens, total_tokens, estimated_cost_amount, actual_cost_amount, latency_ms, finish_reason, redacted_prompt, redacted_completion)
     values ($1, $2, 'developer_api', 'gpt-4o', $3, 'success', 1200, 800, 1188, 733, 1921, 36, 33, 842, 'stop', '[redacted]', '[redacted]')
     on conflict (request_id) do nothing`,
    [`req_${crypto.randomUUID()}`, user.rows[0].id, provider.rows[0].id]
  );
  await pool.query(
    `insert into request_logs (request_id, user_id, source, public_model_code, provider_id, status, estimated_prompt_tokens, estimated_completion_tokens, actual_prompt_tokens, actual_completion_tokens, total_tokens, estimated_cost_amount, actual_cost_amount, latency_ms, finish_reason, redacted_prompt, redacted_completion)
     values ($1, $2, 'app_chat', 'gpt-4o', $3, 'success', 820, 600, 800, 590, 1390, 24, 23, 612, 'stop', '[redacted]', '[redacted]')
     on conflict (request_id) do nothing`,
    [`req_${crypto.randomUUID()}`, vipUser.rows[0].id, provider.rows[0].id]
  );
  await pool.query(
    `insert into request_logs (request_id, user_id, source, public_model_code, provider_id, status, estimated_prompt_tokens, estimated_completion_tokens, actual_prompt_tokens, actual_completion_tokens, total_tokens, estimated_cost_amount, actual_cost_amount, latency_ms, finish_reason, redacted_prompt, redacted_completion)
     values ($1, $2, 'developer_api', 'gpt-4o', $3, 'success', 300, 500, 300, 480, 780, 18, 17, 704, 'stop', '[redacted]', '[redacted]')
     on conflict (request_id) do nothing`,
    [`req_${crypto.randomUUID()}`, externalUser.rows[0].id, provider.rows[0].id]
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
