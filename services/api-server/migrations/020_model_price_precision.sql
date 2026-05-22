alter table model_prices
  add column if not exists input_price_per_1m bigint,
  add column if not exists output_price_per_1m bigint,
  add column if not exists cache_read_price_per_1m bigint,
  add column if not exists cache_write_price_per_1m bigint,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table tenant_model_prices
  add column if not exists input_price_per_1m bigint,
  add column if not exists output_price_per_1m bigint,
  add column if not exists cache_read_price_per_1m bigint,
  add column if not exists cache_write_price_per_1m bigint;

update model_prices
   set input_price_per_1m = coalesce(input_price_per_1m, input_price_per_1k * 1000),
       output_price_per_1m = coalesce(output_price_per_1m, output_price_per_1k * 1000),
       cache_read_price_per_1m = coalesce(cache_read_price_per_1m, cache_read_price_per_1k * 1000),
       cache_write_price_per_1m = coalesce(cache_write_price_per_1m, cache_write_price_per_1k * 1000);

update tenant_model_prices
   set input_price_per_1m = coalesce(input_price_per_1m, input_price_per_1k * 1000),
       output_price_per_1m = coalesce(output_price_per_1m, output_price_per_1k * 1000)
 where input_price_per_1k is not null
    or output_price_per_1k is not null;

comment on column model_prices.input_price_per_1m is 'CNY cents per 1M input tokens. Preferred for low-cost providers such as AWS Bedrock.';
comment on column model_prices.output_price_per_1m is 'CNY cents per 1M output tokens. Preferred for low-cost providers such as AWS Bedrock.';
comment on column tenant_model_prices.input_price_per_1m is 'Tenant override: CNY cents per 1M input tokens.';
comment on column tenant_model_prices.output_price_per_1m is 'Tenant override: CNY cents per 1M output tokens.';
