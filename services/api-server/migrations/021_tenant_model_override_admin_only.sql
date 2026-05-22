delete from role_permissions rp
 using roles r, permissions p
 where rp.role_id = r.id
   and rp.permission_id = p.id
   and r.code = 'tenant'
   and p.code in ('tenant.model.read', 'tenant.model.write');

comment on table tenant_model_authorizations is
  'Optional platform-admin-only tenant model override table. Tenants default to all active priced catalog models.';

comment on table tenant_model_prices is
  'Optional platform-admin-only tenant price override table. Tenants default to platform global model prices.';
