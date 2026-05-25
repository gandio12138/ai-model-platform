with active_price as (
  select distinct on (mp.model_id)
         mp.*
    from model_prices mp
   where mp.status = 'active'
     and mp.effective_from <= now()
     and (mp.effective_to is null or mp.effective_to > now())
   order by mp.model_id, mp.effective_from desc, mp.created_at desc
)
update models m
   set metadata = coalesce(m.metadata, '{}'::jsonb)
      || jsonb_build_object(
           'source_max_context_tokens',
           coalesce(m.metadata->>'source_max_context_tokens', m.max_context_tokens::text),
           'source_default_max_output_tokens',
           coalesce(m.metadata->>'source_default_max_output_tokens', m.default_max_output_tokens::text),
           'source_pricing',
           coalesce(
             m.metadata->'source_pricing',
             jsonb_build_object(
               'currency', ap.currency,
               'source_currency', coalesce(ap.metadata->>'source_currency', 'USD'),
               'source_region', ap.metadata->>'source_region',
               'source_publication_date', ap.metadata->>'source_publication_date',
               'source_provider_name', ap.metadata->>'source_provider_name',
               'source_model_name', ap.metadata->>'source_model_name',
               'input_price_per_1m_cents',
                 coalesce(
                   ceil(nullif(ap.metadata->>'input_usd_per_1k', '')::numeric * 1000 * nullif(ap.metadata->>'usd_to_target_rate', '')::numeric * 100)::bigint,
                   ap.input_price_per_1m,
                   ap.input_price_per_1k * 1000
                 ),
               'output_price_per_1m_cents',
                 coalesce(
                   ceil(nullif(ap.metadata->>'output_usd_per_1k', '')::numeric * 1000 * nullif(ap.metadata->>'usd_to_target_rate', '')::numeric * 100)::bigint,
                   ap.output_price_per_1m,
                   ap.output_price_per_1k * 1000
                 ),
               'cache_read_price_per_1m_cents',
                 coalesce(
                   ceil(nullif(ap.metadata->>'cache_read_usd_per_1k', '')::numeric * 1000 * nullif(ap.metadata->>'usd_to_target_rate', '')::numeric * 100)::bigint,
                   ap.cache_read_price_per_1m,
                   ap.cache_read_price_per_1k * 1000,
                   0
                 ),
               'cache_write_price_per_1m_cents',
                 coalesce(
                   ceil(nullif(ap.metadata->>'cache_write_usd_per_1k', '')::numeric * 1000 * nullif(ap.metadata->>'usd_to_target_rate', '')::numeric * 100)::bigint,
                   ap.cache_write_price_per_1m,
                   ap.cache_write_price_per_1k * 1000,
                   0
                 ),
               'input_usd_per_1k', ap.metadata->>'input_usd_per_1k',
               'output_usd_per_1k', ap.metadata->>'output_usd_per_1k',
               'cache_read_usd_per_1k', ap.metadata->>'cache_read_usd_per_1k',
               'cache_write_usd_per_1k', ap.metadata->>'cache_write_usd_per_1k',
               'usd_to_target_rate', ap.metadata->>'usd_to_target_rate',
               'fx_rate_source', ap.metadata->>'fx_rate_source',
               'fx_rate_fetched_at', ap.metadata->>'fx_rate_fetched_at'
             )
           )
         ),
       updated_at = now()
  from active_price ap
 where ap.model_id = m.id
   and m.metadata->'source_pricing' is null;
