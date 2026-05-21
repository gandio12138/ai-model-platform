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
        "slogan": "企业级大模型服务平台",
        "hero_title": "一站式企业级大模型服务平台",
        "hero_subtitle": "通过一个高速、稳定、统一的接口，轻松调用所有主流大模型。不限时间、按量计费、明细透明，在线充值后即可使用所有模型。",
        "footer_text": "© 2026 OneToken. 版权所有"
      },
      "navigation": [
        {"key":"home","label":"首页","visible":true},
        {"key":"console","label":"控制台","visible":true},
        {"key":"models","label":"模型广场","visible":true},
        {"key":"docs","label":"文档","visible":true}
      ],
      "announcements": [
        {"title":"模型网关已上线","content":"Token API 接入采用 OpenAI 兼容格式，调用时使用 Bearer API Key。","level":"info","visible":true}
      ],
      "faq": [
        {"question":"中转站的计费模式是怎样的？","answer":"按模型实际消耗和后台价格配置扣费。","sort_order":1,"visible":true},
        {"question":"如何将现有 OpenAI 代码迁移？","answer":"替换 Base URL 和 API Key 即可复用原有 Chat Completions 调用。","sort_order":2,"visible":true}
      ],
      "support": {"email":"support@onetoken.local","work_time":"工作日 09:00-18:00"},
      "legal": {}
    }'::jsonb,
    '{
      "branding": {
        "site_name": "OneToken",
        "slogan": "企业级大模型服务平台",
        "hero_title": "一站式企业级大模型服务平台",
        "hero_subtitle": "通过一个高速、稳定、统一的接口，轻松调用所有主流大模型。不限时间、按量计费、明细透明，在线充值后即可使用所有模型。",
        "footer_text": "© 2026 OneToken. 版权所有"
      },
      "navigation": [
        {"key":"home","label":"首页","visible":true},
        {"key":"console","label":"控制台","visible":true},
        {"key":"models","label":"模型广场","visible":true},
        {"key":"docs","label":"文档","visible":true}
      ],
      "announcements": [
        {"title":"模型网关已上线","content":"Token API 接入采用 OpenAI 兼容格式，调用时使用 Bearer API Key。","level":"info","visible":true}
      ],
      "faq": [
        {"question":"中转站的计费模式是怎样的？","answer":"按模型实际消耗和后台价格配置扣费。","sort_order":1,"visible":true},
        {"question":"如何将现有 OpenAI 代码迁移？","answer":"替换 Base URL 和 API Key 即可复用原有 Chat Completions 调用。","sort_order":2,"visible":true}
      ],
      "support": {"email":"support@onetoken.local","work_time":"工作日 09:00-18:00"},
      "legal": {}
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
