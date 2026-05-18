create table tenant_plans (
  id uuid primary key default gen_random_uuid(),
  plan_code text unique not null,
  name text not null,
  billing_cycle text not null default 'monthly',
  base_fee_amount bigint not null default 0,
  currency text not null default 'CNY',
  included_credit bigint not null default 0,
  included_token_budget bigint not null default 0,
  max_projects int,
  max_customers int,
  max_members int,
  log_retention_days int,
  support_level text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  plan_id uuid not null references tenant_plans(id),
  subscription_no text unique not null,
  status text not null default 'active',
  billing_mode text not null default 'subscription_usage',
  current_period_start timestamptz not null default date_trunc('month', now()),
  current_period_end timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  next_billing_at timestamptz,
  cancel_at timestamptz,
  seat_count int not null default 1,
  base_fee_amount bigint not null default 0,
  included_credit bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  subscription_id uuid references tenant_subscriptions(id),
  invoice_no text unique not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'draft',
  currency text not null default 'CNY',
  subtotal_amount bigint not null default 0,
  discount_amount bigint not null default 0,
  tax_amount bigint not null default 0,
  total_amount bigint not null default 0,
  paid_amount bigint not null default 0,
  due_at timestamptz,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references tenant_invoices(id) on delete cascade,
  item_type text not null,
  description text not null,
  quantity numeric(18,4) not null default 1,
  unit_amount bigint not null default 0,
  amount bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table tenant_billing_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  rule_code text not null,
  rule_version text not null,
  status text not null default 'draft',
  billing_mode text not null default 'subscription_usage',
  price_type text not null default 'cost_plus',
  base_fee_amount bigint not null default 0,
  included_credit bigint not null default 0,
  included_token_budget bigint not null default 0,
  min_commit_amount bigint not null default 0,
  cost_plus_markup_rate numeric(8,4),
  min_margin_multiplier numeric(8,4),
  revenue_share_rate numeric(8,4),
  revenue_share_base text,
  payment_service_fee_rate numeric(8,4),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rule_code, rule_version)
);

create table tenant_model_authorizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  model_id uuid not null references models(id) on delete cascade,
  status text not null default 'active',
  max_context_tokens int,
  rpm_limit int,
  tpm_limit int,
  daily_budget bigint,
  monthly_budget bigint,
  enabled_features text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, model_id)
);

create table tenant_model_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  model_id uuid not null references models(id) on delete cascade,
  price_version text not null,
  currency text not null default 'CNY',
  pricing_mode text not null default 'contract_price',
  input_price_per_1k bigint,
  output_price_per_1k bigint,
  min_margin_multiplier numeric(8,4),
  cost_plus_markup_rate numeric(8,4),
  status text not null default 'active',
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, model_id, price_version)
);

create table tenant_usage_aggregates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references tenant_projects(id),
  model_id uuid references models(id),
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_requests bigint not null default 0,
  total_tokens bigint not null default 0,
  provider_cost_amount bigint not null default 0,
  tenant_wholesale_amount bigint not null default 0,
  end_user_revenue_amount bigint not null default 0,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, project_id, model_id, period_start, period_end)
);

create table tenant_revenue_share_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  payment_order_id uuid references payment_orders(id),
  status text not null default 'pending',
  payment_gross_amount bigint not null default 0,
  payment_channel_fee bigint not null default 0,
  provider_cost_amount bigint not null default 0,
  platform_share_amount bigint not null default 0,
  tenant_share_amount bigint not null default 0,
  revenue_share_rate numeric(8,4),
  settled_at timestamptz,
  reversed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into permissions (code, name) values
  ('tenant.model.read', 'Read tenant model policies'),
  ('tenant.model.write', 'Write tenant model policies'),
  ('api_key.write', 'Write API keys')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r
  join permissions p on p.code in ('tenant.model.read', 'tenant.model.write', 'api_key.write')
 where r.code in ('super_admin', 'platform_master')
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r
  join permissions p on p.code in ('tenant.model.read', 'api_key.read', 'api_key.write', 'api_key.revoke')
 where r.code = 'tenant_admin'
on conflict do nothing;

insert into tenant_plans
  (plan_code, name, billing_cycle, base_fee_amount, included_credit, included_token_budget, max_projects, max_customers, max_members, log_retention_days, support_level, status)
values
  ('starter', 'Starter', 'monthly', 9900, 10000, 1000000, 3, 1000, 3, 30, 'standard', 'active'),
  ('growth', 'Growth', 'monthly', 49900, 80000, 10000000, 10, 10000, 10, 90, 'priority', 'active'),
  ('business', 'Business', 'monthly', 199900, 300000, 50000000, 50, 100000, 50, 180, 'business', 'active')
on conflict (plan_code) do update
   set name = excluded.name,
       base_fee_amount = excluded.base_fee_amount,
       included_credit = excluded.included_credit,
       updated_at = now();

insert into tenant_subscriptions
  (tenant_id, plan_id, subscription_no, status, billing_mode, base_fee_amount, included_credit, next_billing_at)
select t.id, p.id, 'SUB-' || t.tenant_code, 'active', 'subscription_usage', p.base_fee_amount, p.included_credit, date_trunc('month', now()) + interval '1 month'
  from tenants t
  join tenant_plans p on p.plan_code = coalesce(t.current_plan_code, 'starter')
on conflict (subscription_no) do update
   set plan_id = excluded.plan_id,
       billing_mode = excluded.billing_mode,
       base_fee_amount = excluded.base_fee_amount,
       included_credit = excluded.included_credit,
       updated_at = now();

insert into tenant_billing_rules
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
on conflict (rule_code, rule_version) do nothing;

insert into tenant_model_authorizations
  (tenant_id, model_id, status, max_context_tokens, rpm_limit, tpm_limit, monthly_budget, enabled_features)
select t.id, m.id, 'active', m.max_context_tokens, 600, 120000, 50000000, array['chat','stream','tools']
  from tenants t
 cross join models m
on conflict (tenant_id, model_id) do nothing;

insert into tenant_model_prices
  (tenant_id, model_id, price_version, currency, pricing_mode, input_price_per_1k, output_price_per_1k, min_margin_multiplier, cost_plus_markup_rate, status)
select t.id, m.id, '2026-05-mvp', 'CNY', 'contract_price', 10, 40, 1.2000, 0.3000, 'active'
  from tenants t
 cross join models m
on conflict (tenant_id, model_id, price_version) do nothing;

insert into tenant_usage_aggregates
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
       updated_at = now();

create index idx_tenant_subscriptions_tenant on tenant_subscriptions(tenant_id, status);
create unique index idx_tenant_subscriptions_one_active on tenant_subscriptions(tenant_id) where status in ('active', 'trialing', 'past_due');
create index idx_tenant_invoices_tenant on tenant_invoices(tenant_id, status, created_at desc);
create index idx_tenant_invoice_items_invoice on tenant_invoice_items(invoice_id);
create index idx_tenant_billing_rules_tenant on tenant_billing_rules(tenant_id, status);
create index idx_tenant_model_authorizations_tenant on tenant_model_authorizations(tenant_id, status);
create index idx_tenant_model_prices_tenant on tenant_model_prices(tenant_id, status);
create index idx_tenant_usage_aggregates_tenant on tenant_usage_aggregates(tenant_id, period_start, period_end);
create index idx_tenant_revenue_share_tenant on tenant_revenue_share_records(tenant_id, status, created_at desc);
