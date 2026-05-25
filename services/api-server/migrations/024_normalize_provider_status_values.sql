update providers
   set status = case
     when status in ('启用', 'enabled') then 'active'
     when status in ('停用', '禁用', 'disabled', 'inactive') then 'suspended'
     else status
   end,
       updated_at = now()
 where status in ('启用', 'enabled', '停用', '禁用', 'disabled', 'inactive');

update provider_credentials
   set status = case
     when status in ('启用', 'enabled') then 'active'
     when status in ('停用', '禁用', 'disabled', 'inactive') then 'suspended'
     else status
   end,
       updated_at = now()
 where status in ('启用', 'enabled', '停用', '禁用', 'disabled', 'inactive');
