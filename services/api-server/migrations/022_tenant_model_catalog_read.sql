insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r
  join permissions p on p.code = 'model.read'
 where r.code = 'tenant'
on conflict do nothing;

delete from role_permissions rp
 using roles r, permissions p
 where rp.role_id = r.id
   and rp.permission_id = p.id
   and r.code = 'tenant'
   and p.code in ('tenant.model.read', 'tenant.model.write');

comment on table models is
  'Global provider-synced model catalog. Tenant admins may read active priced models; only platform admins may edit.';
