create table if not exists referral_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  code text not null unique,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id)
);

create index if not exists idx_referral_codes_user_status
  on referral_codes(user_id, status);

create table if not exists referral_relations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  referrer_user_id uuid not null references users(id) on delete cascade,
  referred_user_id uuid not null references users(id) on delete cascade,
  referred_tenant_customer_id uuid references tenant_customers(id) on delete set null,
  referral_code_id uuid references referral_codes(id) on delete set null,
  source text not null default 'register',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, referred_user_id)
);

create index if not exists idx_referral_relations_referrer
  on referral_relations(referrer_user_id, created_at desc);

create table if not exists commission_withdrawals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  amount bigint not null,
  currency text not null default 'CNY',
  status text not null default 'pending',
  payout_method text,
  payout_account_mask text,
  requested_from text,
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_commission_withdrawals_user_status
  on commission_withdrawals(user_id, status, created_at desc);

alter table commission_records add column if not exists withdrawal_id uuid references commission_withdrawals(id) on delete set null;
alter table commission_records add column if not exists tenant_customer_id uuid references tenant_customers(id) on delete set null;

create table if not exists policy_documents (
  id uuid primary key default gen_random_uuid(),
  policy_type text not null,
  variant text not null default 'standard_cn',
  title text not null,
  content text not null,
  status text not null default 'published',
  version int not null default 1,
  effective_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(policy_type, variant, version)
);

create index if not exists idx_policy_documents_lookup
  on policy_documents(policy_type, variant, status, effective_at desc);

insert into policy_documents (policy_type, variant, title, content, status, version, metadata)
values
  ('terms', 'standard_cn', '用户协议', 'oToken 为企业和开发者提供统一的大模型服务接入、额度钱包、API Key 和账单管理能力。用户应遵守平台规则，不得将服务用于违法、侵权、高风险决策或规避监管的场景。', 'published', 1, '{"source":"migration"}'),
  ('privacy', 'standard_cn', '隐私政策', '平台仅在提供账号登录、模型调用、计费、风控和客户支持所需范围内处理必要信息。访问令牌、API Key、支付凭证和 Provider 密钥不会在客户端明文持久化展示。', 'published', 1, '{"source":"migration"}'),
  ('disclaimer', 'standard_cn', 'AI 生成内容免责声明', 'AI 生成内容可能存在不准确、不完整或不适合特定场景的情况。用户应自行判断输出内容，不得将其直接用于医疗、法律、金融等高风险决策。', 'published', 1, '{"source":"migration"}'),
  ('report', 'standard_cn', '内容举报说明', '如果你认为 AI 生成内容存在违法违规、侵权或安全风险，可以通过内容举报入口提交，平台会记录并由管理员审核处理。', 'published', 1, '{"source":"migration"}'),
  ('help', 'standard_cn', '帮助中心', '如需账号、充值、API Key、账单或模型调用支持，请联系平台客服。工作日支持时间为 09:00-18:00。', 'published', 1, '{"source":"migration"}')
on conflict (policy_type, variant, version) do nothing;

insert into referral_codes (tenant_id, user_id, code, status, metadata)
select tc.tenant_id,
       tc.user_id,
       coalesce(nullif(u.invite_code, ''), upper(substr(replace(u.id::text, '-', ''), 1, 8))),
       'active',
       '{"source":"migration"}'::jsonb
  from tenant_customers tc
  join users u on u.id = tc.user_id
 where u.user_type in ('developer', 'consumer')
on conflict (tenant_id, user_id) do nothing;
