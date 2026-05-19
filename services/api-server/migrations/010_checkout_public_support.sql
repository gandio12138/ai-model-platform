alter table wallets drop constraint if exists wallets_user_id_currency_key;

create unique index if not exists idx_wallets_tenant_user_currency_unique
  on wallets(tenant_id, user_id, currency);

create table if not exists invoice_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  tenant_customer_id uuid references tenant_customers(id) on delete set null,
  profile_type text not null default 'personal',
  title text not null,
  tax_no text,
  email text,
  phone text,
  address text,
  bank_name text,
  bank_account text,
  is_default boolean not null default false,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id, title)
);

create index if not exists idx_invoice_profiles_tenant_user
  on invoice_profiles(tenant_id, user_id, status);

create index if not exists idx_payment_orders_user_tenant_created
  on payment_orders(user_id, tenant_id, created_at desc);
