update configs
   set published_value = case
         when published_value is null then published_value
         else jsonb_set(
           published_value,
           '{copy,model_catalog_intro}',
           to_jsonb('按模型类型和模型公司浏览后台同步的真实供应商模型，价格、权限和上下文以后台配置为准。'::text),
           true
         )
       end,
       draft_value = case
         when draft_value is null then draft_value
         else jsonb_set(
           draft_value,
           '{copy,model_catalog_intro}',
           to_jsonb('按模型类型和模型公司浏览后台同步的真实供应商模型，价格、权限和上下文以后台配置为准。'::text),
           true
         )
       end,
       updated_at = now()
 where config_key = 'site_config'
   and (
     coalesce(published_value #>> '{copy,model_catalog_intro}', '') in ('', '查看当前账户可调用模型、价格、上下文长度和能力标签。')
     or coalesce(draft_value #>> '{copy,model_catalog_intro}', '') in ('', '查看当前账户可调用模型、价格、上下文长度和能力标签。')
   );
