-- Backfill the public site/app copy contract without overwriting tenant custom copy.
-- Existing deployments may already have a published site_config from earlier seeds;
-- this migration only replaces the previous oToken default wording or fills
-- missing fields required by Web/App clients.

update configs
   set published_value = jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 jsonb_set(
                   published_value,
                   '{branding,short_name}',
                   to_jsonb(coalesce(published_value #>> '{branding,short_name}', 'oToken')),
                   true
                 ),
                 '{branding,hero_badge}',
                 to_jsonb(coalesce(published_value #>> '{branding,hero_badge}', 'AI API Gateway')),
                 true
               ),
               '{branding,primary_cta}',
               to_jsonb(coalesce(published_value #>> '{branding,primary_cta}', '立即接入')),
               true
             ),
             '{branding,secondary_cta}',
             to_jsonb(coalesce(published_value #>> '{branding,secondary_cta}', '查看文档')),
             true
           ),
           '{branding,hero_title}',
           to_jsonb(
             case
               when coalesce(published_value #>> '{branding,hero_title}', '') in ('', '一站式企业级大模型服务平台')
                 then '一个 API Key，调用多家顶尖模型'
               else published_value #>> '{branding,hero_title}'
             end
           ),
           true
         ),
         '{branding,hero_subtitle}',
         to_jsonb(
           case
             when coalesce(published_value #>> '{branding,hero_subtitle}', '') in (
               '',
               '通过一个高速、稳定、统一的接口，轻松调用所有主流大模型。不限时间、按量计费、明细透明，在线充值后即可使用所有模型。'
             )
               then '统一接入 OpenAI、Claude、Gemini、DeepSeek、Qwen 等模型。按量计费、余额共享、账单透明，Web 与 App 共用同一个账户体系。'
             else published_value #>> '{branding,hero_subtitle}'
           end
         ),
         true
       ),
       draft_value = case
         when status = 'draft' then draft_value
         else jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     draft_value,
                     '{branding,short_name}',
                     to_jsonb(coalesce(draft_value #>> '{branding,short_name}', 'oToken')),
                     true
                   ),
                   '{branding,hero_badge}',
                   to_jsonb(coalesce(draft_value #>> '{branding,hero_badge}', 'AI API Gateway')),
                   true
                 ),
                 '{branding,primary_cta}',
                 to_jsonb(coalesce(draft_value #>> '{branding,primary_cta}', '立即接入')),
                 true
               ),
               '{branding,secondary_cta}',
               to_jsonb(coalesce(draft_value #>> '{branding,secondary_cta}', '查看文档')),
               true
             ),
             '{branding,hero_title}',
             to_jsonb(
               case
                 when coalesce(draft_value #>> '{branding,hero_title}', '') in ('', '一站式企业级大模型服务平台')
                   then '一个 API Key，调用多家顶尖模型'
                 else draft_value #>> '{branding,hero_title}'
               end
             ),
             true
           ),
           '{branding,hero_subtitle}',
           to_jsonb(
             case
               when coalesce(draft_value #>> '{branding,hero_subtitle}', '') in (
                 '',
                 '通过一个高速、稳定、统一的接口，轻松调用所有主流大模型。不限时间、按量计费、明细透明，在线充值后即可使用所有模型。'
               )
                 then '统一接入 OpenAI、Claude、Gemini、DeepSeek、Qwen 等模型。按量计费、余额共享、账单透明，Web 与 App 共用同一个账户体系。'
               else draft_value #>> '{branding,hero_subtitle}'
             end
           ),
           true
         )
       end,
       updated_at = now()
 where config_key = 'site_config';

update configs
   set published_value = jsonb_set(
         published_value,
         '{modules}',
         '{
           "landing_model_coverage": true,
           "landing_integrations": true,
           "landing_app_download": true,
           "dashboard_announcements": true,
           "dashboard_faq": true,
           "referral": true,
           "developer_api": true,
           "app_download": true,
           "content_report": true,
           "account_deletion": true
         }'::jsonb || coalesce(published_value->'modules', '{}'::jsonb),
         true
       ),
       draft_value = case
         when status = 'draft' then draft_value
         else jsonb_set(
           draft_value,
           '{modules}',
           '{
             "landing_model_coverage": true,
             "landing_integrations": true,
             "landing_app_download": true,
             "dashboard_announcements": true,
             "dashboard_faq": true,
             "referral": true,
             "developer_api": true,
             "app_download": true,
             "content_report": true,
             "account_deletion": true
           }'::jsonb || coalesce(draft_value->'modules', '{}'::jsonb),
           true
         )
       end,
       updated_at = now()
 where config_key = 'site_config';

update configs
   set published_value = jsonb_set(
         jsonb_set(
           published_value,
           '{support}',
           '{"email":"support@xufongnian.xyz","work_time":"工作日 09:00-18:00","help_center_url":"https://xufongnian.xyz/docs"}'::jsonb
             || coalesce(published_value->'support', '{}'::jsonb),
           true
         ),
         '{copy}',
         '{
           "api_base_url_label": "API Base URL",
           "public_api_base_url": "https://xufongnian.xyz/v1",
           "wallet_balance_label": "可用余额",
           "cash_balance_label": "现金余额",
           "gift_balance_label": "赠送额度",
           "frozen_balance_label": "冻结金额",
           "estimated_cost_title": "发送前预估费用",
           "payment_notice": "支付成功和权益到账以服务端确认、查单和钱包入账为准。",
           "ai_disclaimer": "AI 生成内容仅供参考，请遵守当地法律法规并避免输入敏感个人信息。",
           "model_catalog_intro": "查看当前账户可调用模型、价格、上下文长度和能力标签。"
         }'::jsonb || coalesce(published_value->'copy', '{}'::jsonb),
         true
       ),
       draft_value = case
         when status = 'draft' then draft_value
         else jsonb_set(
           jsonb_set(
             draft_value,
             '{support}',
             '{"email":"support@xufongnian.xyz","work_time":"工作日 09:00-18:00","help_center_url":"https://xufongnian.xyz/docs"}'::jsonb
               || coalesce(draft_value->'support', '{}'::jsonb),
             true
           ),
           '{copy}',
           '{
             "api_base_url_label": "API Base URL",
             "public_api_base_url": "https://xufongnian.xyz/v1",
             "wallet_balance_label": "可用余额",
             "cash_balance_label": "现金余额",
             "gift_balance_label": "赠送额度",
             "frozen_balance_label": "冻结金额",
             "estimated_cost_title": "发送前预估费用",
             "payment_notice": "支付成功和权益到账以服务端确认、查单和钱包入账为准。",
             "ai_disclaimer": "AI 生成内容仅供参考，请遵守当地法律法规并避免输入敏感个人信息。",
             "model_catalog_intro": "查看当前账户可调用模型、价格、上下文长度和能力标签。"
           }'::jsonb || coalesce(draft_value->'copy', '{}'::jsonb),
           true
         )
       end,
       updated_at = now()
 where config_key = 'site_config';

update configs
   set published_value = jsonb_set(
         published_value,
         '{navigation}',
         (
           select jsonb_agg(
             case
               when item->>'key' = 'models' and item->>'label' = '模型广场'
                 then jsonb_set(item, '{label}', '"模型目录"'::jsonb, true)
               else item
             end
           )
             from jsonb_array_elements(coalesce(published_value->'navigation', '[]'::jsonb)) item
         ),
         true
       ),
       draft_value = case
         when status = 'draft' then draft_value
         else jsonb_set(
           draft_value,
           '{navigation}',
           (
             select jsonb_agg(
               case
                 when item->>'key' = 'models' and item->>'label' = '模型广场'
                   then jsonb_set(item, '{label}', '"模型目录"'::jsonb, true)
                 else item
               end
             )
               from jsonb_array_elements(coalesce(draft_value->'navigation', '[]'::jsonb)) item
           ),
           true
         )
       end,
       updated_at = now()
 where config_key = 'site_config'
   and jsonb_typeof(coalesce(published_value->'navigation', '[]'::jsonb)) = 'array';

update configs
   set published_value = jsonb_set(
         published_value,
         '{support,email}',
         '"support@xufongnian.xyz"'::jsonb,
         true
       ),
       draft_value = case
         when status = 'draft' then draft_value
         else jsonb_set(draft_value, '{support,email}', '"support@xufongnian.xyz"'::jsonb, true)
       end,
       updated_at = now()
 where config_key = 'site_config'
   and (
     published_value #>> '{support,email}' is null
     or published_value #>> '{support,email}' = 'support@otoken.local'
   );
