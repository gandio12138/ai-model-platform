create table tenants (
  id uuid primary key default gen_random_uuid(),
  tenant_code text unique not null,
  name text not null,
  tenant_type text not null default 'standard',
  status text not null default 'active',
  billing_mode text not null default 'prepaid',
  current_plan_code text,
  credit_limit bigint not null default 0,
  prepaid_balance bigint not null default 0,
  monthly_budget bigint,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role_code text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id, role_code)
);

create table tenant_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_code text not null,
  name text not null,
  project_type text not null,
  platform text,
  bundle_id text,
  package_name text,
  web_domain text,
  status text not null default 'active',
  payment_policy jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, project_code)
);

create table tenant_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  source_project_id uuid references tenant_projects(id),
  customer_code text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id)
);

insert into permissions (code, name) values
  ('tenant.read', 'Read tenants'),
  ('tenant.write', 'Write tenants'),
  ('tenant.project.read', 'Read tenant projects'),
  ('tenant.project.write', 'Write tenant projects'),
  ('tenant.customer.read', 'Read tenant customers'),
  ('tenant.customer.write', 'Write tenant customers'),
  ('tenant.billing.read', 'Read tenant billing'),
  ('tenant.billing.write', 'Write tenant billing'),
  ('platform.tenant.read_all', 'Read all tenants'),
  ('platform.tenant.write_all', 'Write all tenants'),
  ('provider.sync_models', 'Sync provider models')
on conflict (code) do nothing;

insert into roles (code, name) values
  ('platform_master', 'Platform Master'),
  ('platform_admin', 'Platform Admin'),
  ('tenant_admin', 'Tenant Admin')
on conflict (code) do update set name = excluded.name;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r
 cross join permissions p
 where r.code in ('super_admin', 'platform_master')
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r
  join permissions p on p.code in (
    'tenant.read',
    'tenant.project.read',
    'tenant.project.write',
    'tenant.customer.read',
    'tenant.customer.write',
    'tenant.billing.read',
    'user.read',
    'wallet.read',
    'payment.read',
    'request_log.read',
    'config.read'
  )
 where r.code = 'tenant_admin'
on conflict do nothing;

insert into tenants (tenant_code, name, tenant_type, status, billing_mode, current_plan_code, settings)
values
  ('platform_default_tenant', '平台自营租户', 'platform_default', 'active', 'prepaid', 'starter', '{"owned_by_platform":true}'::jsonb),
  ('external_demo_tenant', '外部示例租户', 'standard', 'active', 'prepaid', 'starter', '{}'::jsonb)
on conflict (tenant_code) do nothing;

insert into tenant_projects (tenant_id, project_code, name, project_type, platform, bundle_id, package_name, web_domain, payment_policy)
select t.id, item.project_code, item.name, item.project_type, item.platform, item.bundle_id, item.package_name, item.web_domain, item.payment_policy::jsonb
  from tenants t
  join (
    values
      ('platform_default_tenant', 'ios-app', '自营 iOS App', 'ios_app', 'ios', 'com.ai.platform.ios', null, null, '{"payment_methods":["apple_iap"]}'),
      ('platform_default_tenant', 'android-app', '自营 Android App', 'android_app', 'android', null, 'com.ai.platform.android', null, '{"payment_methods":["alipay_app","wechat_app"]}'),
      ('platform_default_tenant', 'web-checkout', '自营 Web 收银台', 'web_checkout', 'web', null, null, 'pay.localhost', '{"payment_methods":["alipay_web","wechat_web","card_checkout","enterprise_transfer"]}'),
      ('platform_default_tenant', 'developer-api', '自营开发者 API', 'developer_api', 'api', null, null, null, '{"payment_methods":[]}'),
      ('external_demo_tenant', 'external-web', '外部租户 Web 收银台', 'web_checkout', 'web', null, null, 'external-pay.localhost', '{"payment_methods":["alipay_web","wechat_web"]}')
  ) as item(tenant_code, project_code, name, project_type, platform, bundle_id, package_name, web_domain, payment_policy)
    on item.tenant_code = t.tenant_code
on conflict (tenant_id, project_code) do nothing;

insert into tenant_customers (tenant_id, user_id, source_project_id, customer_code, status)
select t.id, u.id, p.id, u.invite_code, 'active'
  from users u
  join tenants t on t.tenant_code = 'platform_default_tenant'
  left join tenant_projects p on p.tenant_id = t.id and p.project_code = case
    when u.email = 'vip-customer@example.com' then 'android-app'
    else 'developer-api'
  end
 where u.email in ('demo-user@example.com', 'vip-customer@example.com')
on conflict (tenant_id, user_id) do nothing;

insert into tenant_customers (tenant_id, user_id, source_project_id, customer_code, status)
select t.id, u.id, p.id, u.invite_code, 'active'
  from users u
  join tenants t on t.tenant_code = 'external_demo_tenant'
  left join tenant_projects p on p.tenant_id = t.id and p.project_code = 'external-web'
 where u.email = 'external-customer@example.com'
on conflict (tenant_id, user_id) do nothing;

insert into tenant_memberships (tenant_id, user_id, role_code, status)
select t.id, u.id, 'tenant_admin', 'active'
  from tenants t
  join users u on u.email = 'support@example.com'
 where t.tenant_code = 'platform_default_tenant'
on conflict (tenant_id, user_id, role_code) do nothing;

insert into user_roles (user_id, role_id)
select u.id, r.id
  from users u
  join roles r on r.code = 'tenant_admin'
 where u.email = 'support@example.com'
on conflict do nothing;

insert into user_roles (user_id, role_id)
select u.id, r.id
  from users u
  join roles r on r.code = 'platform_master'
 where u.email = 'admin@example.com'
on conflict do nothing;

alter table wallets add column tenant_id uuid references tenants(id);
alter table wallets add column tenant_customer_id uuid references tenant_customers(id);
alter table wallet_ledger add column tenant_id uuid references tenants(id);
alter table wallet_ledger add column tenant_customer_id uuid references tenant_customers(id);
alter table api_keys add column tenant_id uuid references tenants(id);
alter table api_keys add column project_id uuid references tenant_projects(id);
alter table api_keys add column tenant_customer_id uuid references tenant_customers(id);
alter table request_logs add column tenant_id uuid references tenants(id);
alter table request_logs add column project_id uuid references tenant_projects(id);
alter table request_logs add column tenant_customer_id uuid references tenant_customers(id);
alter table billing_records add column tenant_id uuid references tenants(id);
alter table billing_records add column tenant_customer_id uuid references tenant_customers(id);
alter table payment_products add column tenant_id uuid references tenants(id);
alter table payment_products add column project_id uuid references tenant_projects(id);
alter table payment_channels add column tenant_id uuid references tenants(id);
alter table payment_channels add column project_id uuid references tenant_projects(id);
alter table payment_channels add column payment_method text;
alter table payment_channels add column settlement_mode text not null default 'platform_collected';
alter table payment_channels add column fee_rate_bps int;
alter table payment_channels add column sort_order int not null default 100;
alter table payment_orders add column tenant_id uuid references tenants(id);
alter table payment_orders add column project_id uuid references tenant_projects(id);
alter table payment_orders add column tenant_customer_id uuid references tenant_customers(id);
alter table payment_callbacks add column tenant_id uuid references tenants(id);
alter table ios_iap_transactions add column tenant_id uuid references tenants(id);
alter table ios_iap_transactions add column project_id uuid references tenant_projects(id);
alter table ios_iap_transactions add column tenant_customer_id uuid references tenant_customers(id);
alter table reconciliation_records add column tenant_id uuid references tenants(id);
alter table distribution_policies add column tenant_id uuid references tenants(id);
alter table distribution_policies add column project_id uuid references tenant_projects(id);
alter table commission_records add column tenant_id uuid references tenants(id);
alter table commission_records add column tenant_customer_id uuid references tenant_customers(id);
alter table provider_credentials add column auth_method text not null default 'api_key';
alter table provider_credentials add column aws_region text;
alter table provider_credentials add column endpoint_url text;
alter table provider_credentials add column metadata jsonb not null default '{}'::jsonb;

update wallets w
   set tenant_id = tc.tenant_id,
       tenant_customer_id = tc.id
  from tenant_customers tc
 where tc.user_id = w.user_id
   and w.tenant_id is null;

update wallet_ledger wl
   set tenant_id = tc.tenant_id,
       tenant_customer_id = tc.id
  from tenant_customers tc
 where tc.user_id = wl.user_id
   and wl.tenant_id is null;

update api_keys ak
   set tenant_id = tc.tenant_id,
       tenant_customer_id = tc.id,
       project_id = tc.source_project_id
  from tenant_customers tc
 where tc.user_id = ak.user_id
   and ak.tenant_id is null;

update request_logs rl
   set tenant_id = tc.tenant_id,
       tenant_customer_id = tc.id,
       project_id = tc.source_project_id
  from tenant_customers tc
 where tc.user_id = rl.user_id
   and rl.tenant_id is null;

update billing_records br
   set tenant_id = tc.tenant_id,
       tenant_customer_id = tc.id
  from tenant_customers tc
 where tc.user_id = br.user_id
   and br.tenant_id is null;

update payment_orders po
   set tenant_id = tc.tenant_id,
       tenant_customer_id = tc.id,
       project_id = tc.source_project_id
  from tenant_customers tc
 where tc.user_id = po.user_id
   and po.tenant_id is null;

update payment_products pp
   set tenant_id = t.id,
       project_id = p.id
  from tenants t
  left join tenant_projects p on p.tenant_id = t.id and p.project_code = 'web-checkout'
 where t.tenant_code = 'platform_default_tenant'
   and pp.tenant_id is null;

update payment_channels pc
   set tenant_id = t.id,
       project_id = p.id,
       payment_method = case
         when pc.channel_code = 'android_unified_checkout' then 'alipay_app'
         when pc.channel_code = 'web_alipay' then 'alipay_web'
        else pc.channel_type
       end
  from tenants t
  left join tenant_projects p on p.tenant_id = t.id
 where t.tenant_code = 'platform_default_tenant'
   and p.project_code = case
     when pc.platform = 'android' then 'android-app'
     when pc.platform = 'ios' then 'ios-app'
     else 'web-checkout'
   end
   and pc.tenant_id is null;

update ios_iap_transactions tx
   set tenant_id = tc.tenant_id,
       tenant_customer_id = tc.id,
       project_id = tc.source_project_id
  from tenant_customers tc
 where tc.user_id = tx.user_id
   and tx.tenant_id is null;

update distribution_policies dp
   set tenant_id = t.id,
       project_id = p.id
  from tenants t
  left join tenant_projects p on p.tenant_id = t.id
 where t.tenant_code = 'platform_default_tenant'
   and p.platform = dp.platform
   and dp.tenant_id is null;

update commission_records cr
   set tenant_id = tc.tenant_id,
       tenant_customer_id = tc.id
  from tenant_customers tc
 where tc.user_id = cr.beneficiary_user_id
   and cr.tenant_id is null;

alter table wallets alter column tenant_id set not null;
alter table wallet_ledger alter column tenant_id set not null;
alter table payment_orders alter column tenant_id set not null;
alter table payment_products alter column tenant_id set not null;
alter table payment_channels alter column tenant_id set not null;
alter table request_logs alter column tenant_id set not null;
alter table billing_records alter column tenant_id set not null;

insert into payment_channels
  (tenant_id, project_id, channel_code, channel_type, display_name, platform, payment_method, enabled, settlement_mode, fee_rate_bps, sort_order, config)
select t.id, p.id, item.channel_code, item.channel_type, item.display_name, item.platform, item.payment_method, true, item.settlement_mode, item.fee_rate_bps, item.sort_order, item.config::jsonb
  from tenants t
  join tenant_projects p on p.tenant_id = t.id
  join (
    values
      ('platform_default_tenant', 'ios-app', 'ios_apple_iap', 'apple_iap', 'iOS Apple IAP', 'ios', 'apple_iap', 'app_store_collected', 3000, 10, '{"storekit":true,"server_api_required":true}'),
      ('platform_default_tenant', 'android-app', 'android_alipay_app', 'android_unified_checkout', 'Android 支付宝 App 支付', 'android', 'alipay_app', 'platform_collected', 60, 20, '{"adapter":"alipay_app"}'),
      ('platform_default_tenant', 'android-app', 'android_wechat_app', 'android_unified_checkout', 'Android 微信 App 支付', 'android', 'wechat_app', 'platform_collected', 60, 30, '{"adapter":"wechat_app"}'),
      ('platform_default_tenant', 'web-checkout', 'web_alipay_pc', 'alipay_web', 'Web 支付宝电脑网站支付', 'web', 'alipay_web', 'platform_collected', 60, 40, '{"adapter":"alipay_page"}'),
      ('platform_default_tenant', 'web-checkout', 'web_wechat_native', 'wechat_web', 'Web 微信 Native 支付', 'web', 'wechat_native', 'platform_collected', 60, 50, '{"adapter":"wechat_native"}'),
      ('platform_default_tenant', 'web-checkout', 'web_card_checkout', 'card_checkout', 'Web 银行卡/信用卡托管收银台', 'web', 'card_checkout', 'platform_collected', 200, 60, '{"adapter":"hosted_card_checkout"}'),
      ('platform_default_tenant', 'web-checkout', 'web_enterprise_transfer', 'enterprise_transfer', 'Web 企业对公转账', 'web', 'enterprise_transfer', 'tenant_or_platform_collected', 0, 70, '{"manual_reconciliation":true}')
  ) as item(tenant_code, project_code, channel_code, channel_type, display_name, platform, payment_method, settlement_mode, fee_rate_bps, sort_order, config)
    on item.tenant_code = t.tenant_code and item.project_code = p.project_code
on conflict (channel_code) do update
   set channel_type = excluded.channel_type,
       display_name = excluded.display_name,
       platform = excluded.platform,
       payment_method = excluded.payment_method,
       settlement_mode = excluded.settlement_mode,
       fee_rate_bps = excluded.fee_rate_bps,
       sort_order = excluded.sort_order,
       config = excluded.config,
       updated_at = now();

create index idx_tenant_memberships_user on tenant_memberships(user_id, status);
create index idx_tenant_projects_tenant on tenant_projects(tenant_id, project_type, status);
create index idx_tenant_customers_tenant_user on tenant_customers(tenant_id, user_id, status);
create index idx_wallets_tenant_user on wallets(tenant_id, user_id);
create index idx_wallet_ledger_tenant_created on wallet_ledger(tenant_id, created_at desc);
create index idx_payment_orders_tenant_created on payment_orders(tenant_id, created_at desc);
create index idx_payment_channels_tenant_project on payment_channels(tenant_id, project_id, platform, enabled);
create index idx_request_logs_tenant_created on request_logs(tenant_id, created_at desc);
