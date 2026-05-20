import dotenv from "dotenv";
import path from "node:path";
import { Pool } from "pg";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgres://chengchengxu@localhost:5432/ai_model_platform"
  });
  const periodStart = arg("period-start");
  const periodEnd = arg("period-end");
  const tenantId = arg("tenant-id");
  const result = await pool.query(
    `insert into tenant_usage_aggregates
      (tenant_id, project_id, model_id, period_start, period_end,
       total_requests, total_tokens, provider_cost_amount, tenant_wholesale_amount,
       end_user_revenue_amount, status, metadata)
     select rl.tenant_id,
            rl.project_id,
            m.id,
            coalesce($1::timestamptz, date_trunc('month', now())),
            coalesce($2::timestamptz, date_trunc('month', now()) + interval '1 month'),
            count(*)::bigint,
            coalesce(sum(rl.total_tokens), 0)::bigint,
            coalesce(sum(rl.actual_cost_amount), 0)::bigint,
            ceil(coalesce(sum(rl.actual_cost_amount), 0) * 1.3)::bigint,
            coalesce(sum(br.amount), 0)::bigint,
            'open',
            '{"source":"script"}'::jsonb
       from request_logs rl
       left join models m on m.public_model_code = rl.public_model_code
       left join billing_records br on br.request_log_id = rl.id
      where rl.tenant_id is not null
        and rl.created_at >= coalesce($1::timestamptz, date_trunc('month', now()))
        and rl.created_at < coalesce($2::timestamptz, date_trunc('month', now()) + interval '1 month')
        and ($3::uuid is null or rl.tenant_id = $3::uuid)
      group by rl.tenant_id, rl.project_id, m.id
     on conflict (tenant_id, project_id, model_id, period_start, period_end) do update
        set total_requests = excluded.total_requests,
            total_tokens = excluded.total_tokens,
            provider_cost_amount = excluded.provider_cost_amount,
            tenant_wholesale_amount = excluded.tenant_wholesale_amount,
            end_user_revenue_amount = excluded.end_user_revenue_amount,
            metadata = tenant_usage_aggregates.metadata || excluded.metadata,
            updated_at = now()`,
    [periodStart, periodEnd, tenantId]
  );
  console.log(`usage aggregates rebuilt: ${result.rowCount ?? 0}`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
