insert into roles (code, name) values
  ('tenant', 'Tenant')
on conflict (code) do update set name = excluded.name;

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
    'tenant.model.read',
    'user.read',
    'payment.read',
    'request_log.read',
    'api_key.read',
    'api_key.write',
    'api_key.revoke'
  )
 where r.code = 'tenant'
on conflict do nothing;

insert into user_roles (user_id, role_id)
select distinct ur.user_id, tenant_role.id
  from user_roles ur
  join roles old_role on old_role.id = ur.role_id
 cross join roles tenant_role
 where old_role.code = 'tenant_admin'
   and tenant_role.code = 'tenant'
on conflict do nothing;

update users u
   set user_type = 'tenant',
       updated_at = now()
 where u.user_type = 'admin'
   and exists (
     select 1
       from user_roles ur
       join roles r on r.id = ur.role_id
      where ur.user_id = u.id
        and r.code = 'tenant'
   )
   and not exists (
     select 1
       from user_roles ur
       join roles r on r.id = ur.role_id
      where ur.user_id = u.id
        and r.code in ('super_admin', 'platform_master', 'platform_admin')
   );

delete from user_roles ur
 using roles old_role
 where old_role.id = ur.role_id
   and old_role.code = 'tenant_admin'
   and not exists (
     select 1
       from user_roles admin_ur
       join roles admin_role on admin_role.id = admin_ur.role_id
      where admin_ur.user_id = ur.user_id
        and admin_role.code in ('super_admin', 'platform_master', 'platform_admin')
   );

delete from user_roles ur
 using users u, roles r
 where ur.user_id = u.id
   and ur.role_id = r.id
   and u.user_type = 'tenant'
   and r.code <> 'tenant';

update tenant_memberships
   set role_code = 'tenant',
       updated_at = now()
 where role_code = 'tenant_admin';
