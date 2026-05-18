create table admin_customer_accounts (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references users(id) on delete cascade,
  customer_user_id uuid not null references users(id) on delete cascade,
  status text not null default 'active',
  scope_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(admin_user_id, customer_user_id)
);

insert into permissions (code, name)
values
  ('customer_assignment.read', 'Read customer assignments'),
  ('customer_assignment.write', 'Write customer assignments')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r
 cross join permissions p
 where r.code = 'super_admin'
   and p.code in ('customer_assignment.read', 'customer_assignment.write')
on conflict do nothing;

create index idx_admin_customer_accounts_admin on admin_customer_accounts(admin_user_id, status);
create index idx_admin_customer_accounts_customer on admin_customer_accounts(customer_user_id, status);

