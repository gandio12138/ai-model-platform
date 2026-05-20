alter table payment_orders add column if not exists provider_trade_no text;
alter table payment_orders add column if not exists provider_order_status text;
alter table payment_orders add column if not exists qr_content text;
alter table payment_orders add column if not exists qr_expires_at timestamptz;
alter table payment_orders add column if not exists expired_at timestamptz;
alter table payment_orders add column if not exists paid_amount bigint not null default 0;
alter table payment_orders add column if not exists refunded_amount bigint not null default 0;
alter table payment_orders add column if not exists payment_action jsonb not null default '{}'::jsonb;

alter table payment_callbacks add column if not exists provider_event_id text;
alter table payment_callbacks add column if not exists raw_body_text text;
alter table payment_callbacks add column if not exists verified_at timestamptz;
alter table payment_callbacks add column if not exists processed_at timestamptz;
alter table payment_callbacks add column if not exists process_error text;
alter table payment_callbacks add column if not exists normalized_event jsonb not null default '{}'::jsonb;

create unique index if not exists uq_payment_callbacks_provider_event
  on payment_callbacks(channel_code, provider_event_id)
  where provider_event_id is not null;

create table if not exists payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null references payment_orders(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  project_id uuid references tenant_projects(id) on delete set null,
  tenant_customer_id uuid references tenant_customers(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  refund_no text not null unique,
  provider_refund_no text,
  channel_code text not null,
  amount bigint not null,
  currency text not null default 'CNY',
  status text not null default 'REQUESTED',
  reason text,
  raw_request jsonb not null default '{}'::jsonb,
  raw_response jsonb not null default '{}'::jsonb,
  succeeded_at timestamptz,
  failed_at timestamptz,
  idempotency_key text unique,
  requested_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_refunds_order_created
  on payment_refunds(payment_order_id, created_at desc);

create index if not exists idx_payment_refunds_scope_status
  on payment_refunds(tenant_id, status, created_at desc);

update payment_channels
   set payment_method = 'alipay_qr',
       channel_type = 'alipay_qr',
       display_name = 'Web 支付宝二维码支付',
       config = coalesce(config, '{}'::jsonb) || '{"adapter":"alipay_qr"}'::jsonb
 where platform = 'web'
   and payment_method = 'alipay_web';
