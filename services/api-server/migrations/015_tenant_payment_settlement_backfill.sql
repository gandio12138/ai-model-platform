create unique index if not exists uq_tenant_revenue_share_payment_order
  on tenant_revenue_share_records(payment_order_id);

with source as (
  select po.id as payment_order_id,
         po.tenant_id,
         po.amount as gross_amount,
         t.billing_mode,
         coalesce(rule.revenue_share_rate, 0)::numeric as revenue_share_rate,
         coalesce(
           po.channel_fee_actual,
           po.channel_fee_estimate,
           ceil(po.amount * coalesce(pc.fee_rate_bps, 0)::numeric / 10000)::bigint,
           0
         ) as channel_fee
    from payment_orders po
    join tenants t on t.id = po.tenant_id
    left join payment_channels pc
      on pc.tenant_id = po.tenant_id
     and (pc.project_id is null or pc.project_id = po.project_id)
     and pc.platform = po.platform
     and (pc.channel_code = po.checkout_channel or pc.payment_method = po.payment_method)
    left join lateral (
      select revenue_share_rate
        from tenant_billing_rules
       where (tenant_id = po.tenant_id or tenant_id is null)
         and status = 'published'
         and effective_from <= coalesce(po.fulfilled_at, po.paid_at, po.created_at)
         and (effective_to is null or effective_to > coalesce(po.fulfilled_at, po.paid_at, po.created_at))
       order by tenant_id nulls last, effective_from desc
       limit 1
    ) rule on true
   where po.status in ('PAID', 'FULFILLED')
),
calculated as (
  select payment_order_id,
         tenant_id,
         billing_mode,
         gross_amount,
         least(channel_fee, gross_amount) as channel_fee,
         case
           when billing_mode = 'revenue_share'
             then floor(greatest(gross_amount - least(channel_fee, gross_amount), 0) * revenue_share_rate)::bigint
           else 0
         end as tenant_share,
         revenue_share_rate
    from source
)
insert into tenant_revenue_share_records
  (tenant_id, payment_order_id, status, payment_gross_amount, payment_channel_fee,
   provider_cost_amount, platform_share_amount, tenant_share_amount, revenue_share_rate, metadata)
select tenant_id,
       payment_order_id,
       case when billing_mode = 'revenue_share' then 'pending' else 'settled' end,
       gross_amount,
       channel_fee,
       0,
       greatest(gross_amount - channel_fee - tenant_share, 0),
       tenant_share,
       revenue_share_rate,
       jsonb_build_object('source', 'migration_backfill', 'billing_mode', billing_mode)
  from calculated
on conflict (payment_order_id) do update
   set status = excluded.status,
       payment_gross_amount = excluded.payment_gross_amount,
       payment_channel_fee = excluded.payment_channel_fee,
       platform_share_amount = excluded.platform_share_amount,
       tenant_share_amount = excluded.tenant_share_amount,
       revenue_share_rate = excluded.revenue_share_rate,
       metadata = coalesce(tenant_revenue_share_records.metadata, '{}'::jsonb) || excluded.metadata,
       updated_at = now();
