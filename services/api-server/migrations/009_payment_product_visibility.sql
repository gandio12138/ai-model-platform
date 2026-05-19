create table if not exists payment_product_visibility (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references payment_products(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references tenant_projects(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web', 'api')),
  enabled boolean not null default true,
  sort_order int not null default 100,
  display_name text,
  display_description text,
  badge text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, project_id, platform)
);

update payment_products
   set product_type = 'recharge_credit',
       updated_at = now()
 where product_type = 'wallet_recharge';

insert into payment_product_visibility
  (product_id, tenant_id, project_id, platform, enabled, sort_order, display_name, display_description, badge, metadata)
select pp.id,
       pp.tenant_id,
       pp.project_id,
       coalesce(tp.platform, 'web'),
       pp.status = 'active',
       case
         when pp.metadata ->> 'sort_order' ~ '^[0-9]+$' then (pp.metadata ->> 'sort_order')::int
         else 100
       end,
       coalesce(pp.metadata ->> 'title', pp.name),
       pp.metadata ->> 'description',
       pp.metadata ->> 'badge',
       coalesce(pp.metadata, '{}'::jsonb)
  from payment_products pp
  left join tenant_projects tp on tp.id = pp.project_id
 where not exists (
   select 1
     from payment_product_visibility ppv
    where ppv.product_id = pp.id
      and ppv.project_id is not distinct from pp.project_id
      and ppv.platform = coalesce(tp.platform, 'web')
 );

create index if not exists idx_payment_product_visibility_tenant_platform
  on payment_product_visibility(tenant_id, platform, enabled, sort_order);

create index if not exists idx_payment_product_visibility_product
  on payment_product_visibility(product_id);

create index if not exists idx_payment_products_tenant_status
  on payment_products(tenant_id, status);
