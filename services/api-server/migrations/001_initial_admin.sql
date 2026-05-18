create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text unique,
  password_hash text,
  status text not null default 'active',
  user_type text not null default 'consumer',
  invite_code text unique,
  invited_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid references users(id) on delete cascade,
  role_id uuid references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

create table role_permissions (
  role_id uuid references roles(id) on delete cascade,
  permission_id uuid references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  before_value jsonb,
  after_value jsonb,
  ip text,
  user_agent text,
  approval_no text,
  created_at timestamptz not null default now()
);

create table wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  currency text not null default 'CNY',
  cash_balance bigint not null default 0,
  bonus_balance bigint not null default 0,
  frozen_balance bigint not null default 0,
  credit_limit bigint not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, currency)
);

create table wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets(id),
  user_id uuid not null references users(id),
  event_type text not null,
  direction text not null check (direction in ('credit', 'debit', 'freeze', 'unfreeze')),
  balance_type text not null default 'cash' check (balance_type in ('cash', 'bonus', 'frozen', 'credit')),
  amount bigint not null,
  currency text not null default 'CNY',
  balance_after bigint,
  related_type text,
  related_id text,
  idempotency_key text unique,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  name text not null,
  key_prefix text not null,
  key_suffix text not null,
  key_hash text not null unique,
  status text not null default 'active',
  model_whitelist text[],
  ip_whitelist text[],
  rpm_limit int,
  tpm_limit int,
  daily_budget bigint,
  monthly_budget bigint,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table providers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  provider_type text not null,
  base_url text,
  region text,
  legal_scope text,
  status text not null default 'active',
  cost_currency text not null default 'USD',
  monthly_budget bigint,
  rpm_limit int,
  tpm_limit int,
  timeout_ms int default 60000,
  retry_count int default 2,
  health_status text not null default 'healthy',
  health_score numeric(8,4) default 1,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table provider_credentials (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  name text not null,
  credential_type text not null,
  encrypted_secret text not null,
  secret_last4 text,
  status text not null default 'active',
  rpm_limit int,
  tpm_limit int,
  daily_budget bigint,
  monthly_budget bigint,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table models (
  id uuid primary key default gen_random_uuid(),
  public_model_code text unique not null,
  display_name text not null,
  model_family text,
  modality text[] not null default array['text'],
  max_context_tokens int,
  default_max_output_tokens int,
  supports_stream boolean default true,
  supports_tools boolean default false,
  supports_json_mode boolean default false,
  status text not null default 'active',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table model_prices (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  price_version text not null,
  currency text not null default 'CNY',
  input_price_per_1k bigint not null,
  output_price_per_1k bigint not null,
  cache_read_price_per_1k bigint default 0,
  cache_write_price_per_1k bigint default 0,
  reserve_multiplier numeric(8,4) not null default 1.2,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(model_id, price_version)
);

create table model_routes (
  id uuid primary key default gen_random_uuid(),
  route_code text unique not null,
  model_id uuid not null references models(id) on delete cascade,
  provider_id uuid not null references providers(id) on delete cascade,
  credential_id uuid references provider_credentials(id),
  provider_model_code text not null,
  weight int not null default 100,
  priority int not null default 100,
  strategy text not null default 'weighted_round_robin',
  enabled boolean not null default true,
  allow_fallback boolean not null default true,
  cost_priority int default 0,
  latency_priority int default 0,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table request_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text unique not null,
  user_id uuid references users(id),
  api_key_id uuid references api_keys(id),
  source text not null check (source in ('app_chat', 'developer_api', 'admin_test')),
  public_model_code text not null,
  provider_id uuid references providers(id),
  route_id uuid references model_routes(id),
  provider_request_id text,
  status text not null,
  stream boolean default false,
  estimated_prompt_tokens int,
  estimated_completion_tokens int,
  actual_prompt_tokens int,
  actual_completion_tokens int,
  total_tokens int,
  usage_source text,
  estimated_cost_amount bigint,
  actual_cost_amount bigint,
  currency text not null default 'CNY',
  latency_ms int,
  finish_reason text,
  error_code text,
  error_message text,
  redacted_prompt text,
  redacted_completion text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table billing_records (
  id uuid primary key default gen_random_uuid(),
  request_log_id uuid references request_logs(id),
  user_id uuid not null references users(id),
  wallet_id uuid not null references wallets(id),
  model_id uuid references models(id),
  price_version text,
  amount bigint not null,
  currency text not null default 'CNY',
  billing_status text not null default 'settled',
  wallet_ledger_id uuid references wallet_ledger(id),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table payment_products (
  id uuid primary key default gen_random_uuid(),
  product_code text unique not null,
  name text not null,
  product_type text not null,
  face_value_amount bigint not null,
  bonus_amount bigint not null default 0,
  sale_amount bigint not null,
  currency text not null default 'CNY',
  ios_product_id text,
  status text not null default 'active',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payment_channels (
  id uuid primary key default gen_random_uuid(),
  channel_code text unique not null,
  channel_type text not null,
  display_name text not null,
  platform text not null,
  enabled boolean not null default true,
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payment_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null,
  user_id uuid not null references users(id),
  product_id uuid references payment_products(id),
  platform text not null,
  checkout_channel text not null,
  payment_method text not null,
  amount bigint not null,
  currency text not null default 'CNY',
  status text not null default 'CREATED',
  channel_trade_no text,
  idempotency_key text unique,
  client_context jsonb,
  gross_amount bigint,
  channel_fee_estimate bigint,
  channel_fee_actual bigint,
  app_store_commission_estimate bigint,
  app_store_commission_actual bigint,
  tax_estimate bigint,
  tax_actual bigint,
  net_settlement_amount bigint,
  paid_at timestamptz,
  fulfilled_at timestamptz,
  closed_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payment_callbacks (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid references payment_orders(id),
  channel_code text not null,
  event_type text,
  raw_headers jsonb,
  raw_body jsonb,
  signature_valid boolean,
  processed boolean not null default false,
  process_result text,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table ios_iap_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  payment_order_id uuid references payment_orders(id),
  transaction_id text unique not null,
  original_transaction_id text,
  product_id text not null,
  app_account_token text,
  environment text not null,
  signed_transaction_info text,
  purchase_date timestamptz,
  revocation_date timestamptz,
  status text not null default 'received',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  channel_code text not null,
  order_no text,
  channel_trade_no text,
  local_amount bigint,
  channel_amount bigint,
  difference_type text not null,
  status text not null default 'pending',
  resolved_note text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table distribution_policies (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  distribution_channel text not null,
  package_name text not null,
  region text not null default 'CN',
  app_version_min text,
  app_version_max text,
  show_web_payment_link boolean not null default false,
  web_payment_url text,
  allowed_payment_methods text[],
  payment_page_notice text,
  review_mode boolean not null default false,
  legal_approved boolean not null default false,
  status text not null default 'active',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table commission_records (
  id uuid primary key default gen_random_uuid(),
  beneficiary_user_id uuid not null references users(id),
  source_user_id uuid references users(id),
  payment_order_id uuid references payment_orders(id),
  commission_base_amount bigint not null,
  commission_rate numeric(8,4) not null,
  commission_amount bigint not null,
  currency text not null default 'CNY',
  status text not null default 'pending',
  frozen_until timestamptz,
  wallet_ledger_id uuid references wallet_ledger(id),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table configs (
  id uuid primary key default gen_random_uuid(),
  config_key text unique not null,
  config_type text not null,
  draft_value jsonb not null default '{}'::jsonb,
  published_value jsonb,
  status text not null default 'draft',
  config_version int not null default 0,
  published_by uuid references users(id),
  published_at timestamptz,
  rollback_from_version int,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_audit_logs_target on audit_logs(target_type, target_id, created_at desc);
create index idx_wallet_ledger_user_created on wallet_ledger(user_id, created_at desc);
create index idx_payment_orders_user_created on payment_orders(user_id, created_at desc);
create index idx_payment_orders_status_created on payment_orders(status, created_at desc);
create index idx_request_logs_user_created on request_logs(user_id, created_at desc);
create index idx_request_logs_model_created on request_logs(public_model_code, created_at desc);

