delete from role_permissions rp
 using roles r, permissions p
 where rp.role_id = r.id
   and rp.permission_id = p.id
   and r.code = 'tenant'
   and p.code not in (
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
   );
