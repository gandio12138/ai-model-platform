create table if not exists app_releases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references tenant_projects(id) on delete set null,
  platform text not null check (platform in ('ios', 'android')),
  distribution_channel text not null default 'official',
  version text not null,
  build_number int,
  release_status text not null default 'draft',
  min_supported_version text,
  force_update boolean not null default false,
  download_url text,
  changelog text,
  file_size_bytes bigint,
  checksum_sha256 text,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_app_releases_tenant_platform_channel_version
  on app_releases(tenant_id, platform, distribution_channel, version);

create index if not exists idx_app_releases_lookup
  on app_releases(tenant_id, platform, distribution_channel, release_status, published_at desc);

insert into app_releases
  (tenant_id, project_id, platform, distribution_channel, version, build_number,
   release_status, min_supported_version, force_update, download_url, changelog,
   published_at, metadata)
select t.id,
       p.id,
       item.platform,
       item.distribution_channel,
       item.version,
       item.build_number,
       'published',
       item.min_supported_version,
       false,
       item.download_url,
       item.changelog,
       now(),
       item.metadata::jsonb
  from tenants t
  join (
    values
      ('ios', 'testflight', '1.0.0', 1, '1.0.0', '', 'TestFlight 内测版本，支持登录、聊天、钱包和账单。', '{"source":"migration","hosted_by":"testflight"}'),
      ('android', 'official_apk', '1.0.0', 1, '1.0.0', '', '官网 APK 内测版本，支持安卓统一收银台占位链路。', '{"source":"migration","hosted_by":"official_apk"}')
  ) as item(platform, distribution_channel, version, build_number, min_supported_version, download_url, changelog, metadata)
    on true
  left join lateral (
    select id
      from tenant_projects
     where tenant_id = t.id
       and platform = item.platform
     order by created_at asc
     limit 1
  ) p on true
 where t.tenant_code = 'platform_default_tenant'
on conflict (tenant_id, platform, distribution_channel, version) do update
   set project_id = excluded.project_id,
       build_number = excluded.build_number,
       release_status = excluded.release_status,
       min_supported_version = excluded.min_supported_version,
       force_update = excluded.force_update,
       changelog = excluded.changelog,
       metadata = app_releases.metadata || excluded.metadata,
       updated_at = now();
