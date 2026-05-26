create temp table cleanup_aws_providers on commit drop as
  select id from providers where provider_type = 'aws_bedrock';

create temp table cleanup_aws_routes on commit drop as
  select mr.id, mr.model_id
    from model_routes mr
   where mr.provider_id in (select id from cleanup_aws_providers)
      or coalesce(mr.metadata->>'source', '') = 'aws_bedrock_sync';

create temp table cleanup_aws_route_models on commit drop as
  select distinct model_id as id from cleanup_aws_routes;

create temp table cleanup_models_to_delete on commit drop as
  select m.id
    from models m
   where (
       m.id in (select id from cleanup_aws_route_models)
       or coalesce(m.metadata->>'source', '') = 'aws_bedrock'
     )
     and not exists (
       select 1
         from model_routes mr
         join providers p on p.id = mr.provider_id
        where mr.model_id = m.id
          and p.provider_type <> 'aws_bedrock'
     );

update request_logs
   set provider_id = null,
       route_id = null,
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'detached_provider_reason', 'aws_bedrock_cleanup',
         'detached_at', now()
       )
 where provider_id in (select id from cleanup_aws_providers)
    or route_id in (select id from cleanup_aws_routes);

update billing_records
   set model_id = null,
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'detached_model_reason', 'aws_bedrock_cleanup',
         'detached_at', now()
       )
 where model_id in (select id from cleanup_models_to_delete);

update tenant_usage_aggregates
   set model_id = null,
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'detached_model_reason', 'aws_bedrock_cleanup',
         'detached_at', now()
       ),
       updated_at = now()
 where model_id in (select id from cleanup_models_to_delete);

delete from model_prices mp
 where mp.model_id in (select id from cleanup_aws_route_models)
   and (
     mp.price_version ilike 'aws-bedrock%'
     or coalesce(mp.metadata->>'source', '') = 'aws_bedrock_price_list'
   );

delete from model_routes
 where id in (select id from cleanup_aws_routes);

delete from models
 where id in (select id from cleanup_models_to_delete);

delete from provider_credentials
 where provider_id in (select id from cleanup_aws_providers);

delete from providers
 where id in (select id from cleanup_aws_providers);
