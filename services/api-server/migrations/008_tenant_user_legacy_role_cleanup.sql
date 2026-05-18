delete from user_roles ur
 using users u, roles r
 where ur.user_id = u.id
   and ur.role_id = r.id
   and u.user_type = 'tenant'
   and r.code <> 'tenant';
