create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  project_id uuid references tenant_projects(id) on delete set null,
  tenant_customer_id uuid references tenant_customers(id) on delete set null,
  token_hash text unique not null,
  device_id text,
  user_agent text,
  ip_address text,
  status text not null default 'active',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_refresh_tokens_user_status
  on refresh_tokens(user_id, status, expires_at desc);

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references tenant_projects(id) on delete set null,
  tenant_customer_id uuid references tenant_customers(id) on delete set null,
  user_id uuid not null references users(id) on delete cascade,
  title text,
  model_code text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_chat_sessions_scope_created
  on chat_sessions(tenant_id, user_id, created_at desc);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references tenant_projects(id) on delete set null,
  tenant_customer_id uuid references tenant_customers(id) on delete set null,
  user_id uuid not null references users(id) on delete cascade,
  request_log_id uuid references request_logs(id) on delete set null,
  role text not null,
  content text not null,
  model_code text,
  prompt_tokens int,
  completion_tokens int,
  total_tokens int,
  cost_amount bigint,
  currency text not null default 'CNY',
  billing_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_session_created
  on chat_messages(session_id, created_at asc);

create table if not exists chat_estimates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references tenant_projects(id) on delete set null,
  tenant_customer_id uuid references tenant_customers(id) on delete set null,
  user_id uuid not null references users(id) on delete cascade,
  model_code text not null,
  prompt_tokens int not null default 0,
  max_output_tokens int not null default 0,
  estimated_cost_amount bigint not null default 0,
  currency text not null default 'CNY',
  current_balance bigint not null default 0,
  enough_balance boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_estimates_user_created
  on chat_estimates(tenant_id, user_id, created_at desc);

create table if not exists provider_request_attempts (
  id uuid primary key default gen_random_uuid(),
  request_log_id uuid references request_logs(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  provider_id uuid references providers(id) on delete set null,
  route_id uuid references model_routes(id) on delete set null,
  provider_model_code text,
  attempt_no int not null default 1,
  status text not null,
  latency_ms int,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_provider_attempts_request
  on provider_request_attempts(request_log_id, attempt_no);

create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null references payment_orders(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  project_id uuid references tenant_projects(id) on delete set null,
  transaction_type text not null,
  channel_code text,
  channel_trade_no text,
  status text not null,
  amount bigint not null default 0,
  currency text not null default 'CNY',
  raw_payload jsonb not null default '{}'::jsonb,
  verified boolean not null default false,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_transactions_order
  on payment_transactions(payment_order_id, created_at desc);

create table if not exists payment_order_events (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null references payment_orders(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  project_id uuid references tenant_projects(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  reason text,
  actor_type text not null default 'system',
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_order_events_order
  on payment_order_events(payment_order_id, created_at desc);

create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  project_id uuid references tenant_projects(id) on delete set null,
  tenant_customer_id uuid references tenant_customers(id) on delete set null,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending',
  reason text,
  balance_policy text,
  requested_from text,
  processed_by uuid references users(id) on delete set null,
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_account_deletion_requests_status
  on account_deletion_requests(status, created_at desc);

create table if not exists content_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  project_id uuid references tenant_projects(id) on delete set null,
  tenant_customer_id uuid references tenant_customers(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  chat_session_id uuid references chat_sessions(id) on delete set null,
  chat_message_id uuid references chat_messages(id) on delete set null,
  target_type text not null default 'chat_message',
  target_id text,
  reason text not null,
  description text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_reports_status_created
  on content_reports(status, created_at desc);

create table if not exists risk_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  project_id uuid references tenant_projects(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  event_type text not null,
  risk_level text not null default 'low',
  subject_type text,
  subject_id text,
  ip_address text,
  device_id text,
  distribution_channel text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_risk_events_scope_created
  on risk_events(tenant_id, event_type, created_at desc);

create table if not exists api_key_rate_limits (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references api_keys(id) on delete cascade,
  window_start timestamptz not null,
  window_seconds int not null,
  request_count int not null default 0,
  token_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(api_key_id, window_start, window_seconds)
);

alter table api_keys add column if not exists updated_at timestamptz not null default now();
alter table api_keys add column if not exists deleted_at timestamptz;

alter table request_logs add column if not exists idempotency_key text;
alter table request_logs add column if not exists stream_status text;
alter table request_logs add column if not exists billing_status text;
create unique index if not exists idx_request_logs_idempotency_key
  on request_logs(idempotency_key)
  where idempotency_key is not null;

alter table payment_orders add column if not exists status_reason text;
alter table payment_orders add column if not exists cancelled_at timestamptz;
alter table payment_orders add column if not exists refunded_at timestamptz;
