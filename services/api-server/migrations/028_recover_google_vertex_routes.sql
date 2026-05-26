with provider as (
  select id as provider_id
    from providers
   where provider_type in ('google_vertex_ai', 'vertex_ai')
     and status = 'active'
   order by updated_at desc
   limit 1
),
credential as (
  select pc.id as credential_id
    from provider_credentials pc
    join provider p on p.provider_id = pc.provider_id
   where pc.status = 'active'
   order by pc.updated_at desc nulls last, pc.created_at desc
   limit 1
),
source_models as (
  select m.id as model_id,
         m.public_model_code,
         coalesce(m.metadata->>'provider_model_code', m.public_model_code) as provider_model_code,
         coalesce(m.metadata->>'source_model_id', m.public_model_code) as source_model_id,
         m.metadata
    from models m
   where m.status = 'active'
     and m.metadata->>'source' = 'google_vertex_ai'
),
restored_routes as (
  insert into model_routes
    (route_code, model_id, provider_id, credential_id, provider_model_code, weight, priority, strategy, enabled, allow_fallback, metadata)
  select 'google-vertex-' || regexp_replace(lower(sm.provider_model_code), '[^a-z0-9]+', '-', 'g') as route_code,
         sm.model_id,
         p.provider_id,
         c.credential_id,
         sm.provider_model_code,
         100,
         100,
         'weighted_round_robin',
         true,
         true,
         jsonb_build_object(
           'source', 'google_vertex_sync_recovered',
           'source_model_id', sm.source_model_id,
           'provider_name', coalesce(sm.metadata->>'provider_name', 'Google Vertex AI'),
           'invocation_type', coalesce(sm.metadata->>'invocation_type', 'vertex_managed_api'),
           'input_modalities', coalesce(sm.metadata->'input_modalities', '[]'::jsonb),
           'output_modalities', coalesce(sm.metadata->'output_modalities', '[]'::jsonb),
           'recovered_by_migration', '028_recover_google_vertex_routes',
           'recovered_at', now()
         )
    from source_models sm
    cross join provider p
    left join credential c on true
   where not exists (
     select 1
       from model_routes mr
       join providers route_provider on route_provider.id = mr.provider_id
      where mr.model_id = sm.model_id
        and route_provider.provider_type in ('google_vertex_ai', 'vertex_ai')
   )
  on conflict (route_code) do update
     set model_id = excluded.model_id,
         provider_id = excluded.provider_id,
         credential_id = excluded.credential_id,
         provider_model_code = excluded.provider_model_code,
         enabled = true,
         metadata = coalesce(model_routes.metadata, '{}'::jsonb) || excluded.metadata,
         updated_at = now()
  returning id
)
select count(*) as recovered_google_vertex_routes from restored_routes;
