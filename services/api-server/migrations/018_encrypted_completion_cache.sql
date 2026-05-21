create table if not exists ai_completion_cache (
  id uuid primary key default gen_random_uuid(),
  request_log_id uuid not null references request_logs(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  idempotency_key text not null,
  content_ciphertext text not null,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, idempotency_key)
);

create index if not exists idx_ai_completion_cache_request_log
  on ai_completion_cache(request_log_id);

update request_logs
   set metadata = metadata - 'response_content'
 where metadata ? 'response_content';
