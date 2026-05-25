alter table model_prices
  add column if not exists max_context_tokens int,
  add column if not exists default_max_output_tokens int;

update model_prices mp
   set max_context_tokens = coalesce(mp.max_context_tokens, m.max_context_tokens),
       default_max_output_tokens = coalesce(mp.default_max_output_tokens, m.default_max_output_tokens)
  from models m
 where m.id = mp.model_id
   and (mp.max_context_tokens is null or mp.default_max_output_tokens is null);

comment on column model_prices.max_context_tokens is
  'Platform-facing context window override. Null means use provider-synced models.max_context_tokens.';
comment on column model_prices.default_max_output_tokens is
  'Platform-facing default output token override. Null means use provider-synced models.default_max_output_tokens.';
