create table if not exists config_versions (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references configs(id) on delete cascade,
  config_key text not null,
  config_version int not null,
  value jsonb not null default '{}'::jsonb,
  status text not null default 'published',
  published_by uuid references users(id) on delete set null,
  published_at timestamptz not null default now(),
  rollback_from_version int,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (config_id, config_version)
);

create index if not exists idx_config_versions_key_created
  on config_versions(config_key, created_at desc);

insert into configs (config_key, config_type, draft_value, published_value, status, config_version)
values
  (
    'site_config',
    'site',
    '{
      "branding": {
        "site_name": "OneToken",
        "short_name": "OneToken",
        "slogan": "企业级大模型服务平台",
        "hero_badge": "AI API Gateway",
        "hero_title": "一个 API Key，调用多家顶尖模型",
        "hero_subtitle": "统一接入 OpenAI、Claude、Gemini、DeepSeek、Qwen 等模型。按量计费、余额共享、账单透明，Web 与 App 共用同一个账户体系。",
        "primary_cta": "立即接入",
        "secondary_cta": "查看文档",
        "footer_text": "© 2026 OneToken. 版权所有"
      },
      "navigation": [
        {"key":"home","label":"首页","visible":true},
        {"key":"console","label":"控制台","visible":true},
        {"key":"models","label":"模型目录","visible":true},
        {"key":"docs","label":"文档","visible":true}
      ],
      "modules": {"landing_model_coverage":true,"landing_integrations":true,"landing_app_download":true,"dashboard_announcements":true,"dashboard_faq":true,"referral":true,"developer_api":true,"app_download":true,"content_report":true,"account_deletion":true},
      "announcements": [
        {"title":"模型网关已上线","content":"Token API 接入采用 OpenAI 兼容格式，调用时使用 Bearer API Key。","level":"info","visible":true}
      ],
      "faq": [
        {"question":"中转站的计费模式是怎样的？","answer":"按模型实际消耗和后台价格配置扣费。","sort_order":1,"visible":true},
        {"question":"如何将现有 OpenAI 代码迁移？","answer":"替换 Base URL 和 API Key 即可复用原有 Chat Completions 调用。","sort_order":2,"visible":true}
      ],
      "support": {"email":"support@onetoken.one","work_time":"工作日 09:00-18:00","help_center_url":"https://www.onetoken.one/docs"},
      "legal": {},
      "copy": {"api_base_url_label":"API Base URL","public_api_base_url":"https://api.onetoken.one/v1","wallet_balance_label":"可用余额","cash_balance_label":"现金余额","gift_balance_label":"赠送额度","frozen_balance_label":"冻结金额","estimated_cost_title":"发送前预估费用","payment_notice":"支付成功和权益到账以服务端确认、查单和钱包入账为准。","ai_disclaimer":"AI 生成内容仅供参考，请遵守当地法律法规并避免输入敏感个人信息。","model_catalog_intro":"查看当前账户可调用模型、价格、上下文长度和能力标签。"}
    }'::jsonb,
    '{
      "branding": {
        "site_name": "OneToken",
        "short_name": "OneToken",
        "slogan": "企业级大模型服务平台",
        "hero_badge": "AI API Gateway",
        "hero_title": "一个 API Key，调用多家顶尖模型",
        "hero_subtitle": "统一接入 OpenAI、Claude、Gemini、DeepSeek、Qwen 等模型。按量计费、余额共享、账单透明，Web 与 App 共用同一个账户体系。",
        "primary_cta": "立即接入",
        "secondary_cta": "查看文档",
        "footer_text": "© 2026 OneToken. 版权所有"
      },
      "navigation": [
        {"key":"home","label":"首页","visible":true},
        {"key":"console","label":"控制台","visible":true},
        {"key":"models","label":"模型目录","visible":true},
        {"key":"docs","label":"文档","visible":true}
      ],
      "modules": {"landing_model_coverage":true,"landing_integrations":true,"landing_app_download":true,"dashboard_announcements":true,"dashboard_faq":true,"referral":true,"developer_api":true,"app_download":true,"content_report":true,"account_deletion":true},
      "announcements": [
        {"title":"模型网关已上线","content":"Token API 接入采用 OpenAI 兼容格式，调用时使用 Bearer API Key。","level":"info","visible":true}
      ],
      "faq": [
        {"question":"中转站的计费模式是怎样的？","answer":"按模型实际消耗和后台价格配置扣费。","sort_order":1,"visible":true},
        {"question":"如何将现有 OpenAI 代码迁移？","answer":"替换 Base URL 和 API Key 即可复用原有 Chat Completions 调用。","sort_order":2,"visible":true}
      ],
      "support": {"email":"support@onetoken.one","work_time":"工作日 09:00-18:00","help_center_url":"https://www.onetoken.one/docs"},
      "legal": {},
      "copy": {"api_base_url_label":"API Base URL","public_api_base_url":"https://api.onetoken.one/v1","wallet_balance_label":"可用余额","cash_balance_label":"现金余额","gift_balance_label":"赠送额度","frozen_balance_label":"冻结金额","estimated_cost_title":"发送前预估费用","payment_notice":"支付成功和权益到账以服务端确认、查单和钱包入账为准。","ai_disclaimer":"AI 生成内容仅供参考，请遵守当地法律法规并避免输入敏感个人信息。","model_catalog_intro":"查看当前账户可调用模型、价格、上下文长度和能力标签。"}
    }'::jsonb,
    'published',
    1
  ),
  (
    'app_download',
    'app_download',
    '{"enabled":true,"show_on_web_home":true,"show_on_console":true,"show_on_payment_success":true,"title":"移动端随时使用 OneToken","subtitle":"App、Web 与 API 共用同一个客户账号和余额。","ios":{"enabled":true},"android":{"enabled":true}}'::jsonb,
    '{"enabled":true,"show_on_web_home":true,"show_on_console":true,"show_on_payment_success":true,"title":"移动端随时使用 OneToken","subtitle":"App、Web 与 API 共用同一个客户账号和余额。","ios":{"enabled":true},"android":{"enabled":true}}'::jsonb,
    'published',
    1
  ),
  (
    'feature_flags',
    'feature_flags',
    '{"developer_api_enabled":true,"referral_enabled":true,"model_list_enabled":true,"chat_enabled":true}'::jsonb,
    '{"developer_api_enabled":true,"referral_enabled":true,"model_list_enabled":true,"chat_enabled":true}'::jsonb,
    'published',
    1
  )
on conflict (config_key) do nothing;

insert into config_versions (config_id, config_key, config_version, value, status, published_by, published_at, reason)
select id, config_key, config_version, published_value, 'published', published_by, coalesce(published_at, now()), 'bootstrap existing published config'
  from configs
 where status = 'published'
   and published_value is not null
on conflict (config_id, config_version) do nothing;
