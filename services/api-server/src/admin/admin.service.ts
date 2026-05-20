import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { AuditActor, AuditService } from "../common/audit.service.js";
import { CryptoService } from "../common/crypto.service.js";
import { parsePagination, requireReason } from "../common/http.js";
import { PaymentService } from "../payment/payment.service.js";

interface ResourceConfig {
  table: string;
  idColumn?: string;
  readPermission: string;
  writePermission?: string;
  searchable?: string[];
  writable: string[];
  hidden?: string[];
  tenantScopeColumn?: string;
  customerScopeColumn?: string;
  createTenantScoped?: boolean;
}

const resourceMap: Record<string, ResourceConfig> = {
  tenants: {
    table: "tenants",
    readPermission: "tenant.read",
    writePermission: "platform.tenant.write_all",
    searchable: ["tenant_code", "name", "tenant_type", "status", "billing_mode"],
    writable: [
      "tenant_code",
      "name",
      "tenant_type",
      "status",
      "billing_mode",
      "current_plan_code",
      "credit_limit",
      "prepaid_balance",
      "monthly_budget",
      "settings"
    ],
    tenantScopeColumn: "id"
  },
  tenantMemberships: {
    table: "tenant_memberships",
    readPermission: "tenant.read",
    writePermission: "platform.tenant.write_all",
    searchable: ["role_code", "status"],
    writable: ["tenant_id", "user_id", "role_code", "status"],
    tenantScopeColumn: "tenant_id"
  },
  tenantProjects: {
    table: "tenant_projects",
    readPermission: "tenant.project.read",
    writePermission: "tenant.project.write",
    searchable: ["project_code", "name", "project_type", "platform", "bundle_id", "package_name", "web_domain"],
    writable: [
      "tenant_id",
      "project_code",
      "name",
      "project_type",
      "platform",
      "bundle_id",
      "package_name",
      "web_domain",
      "status",
      "payment_policy",
      "metadata"
    ],
    tenantScopeColumn: "tenant_id",
    createTenantScoped: true
  },
  tenantCustomers: {
    table: "tenant_customers",
    readPermission: "tenant.customer.read",
    writePermission: "tenant.customer.write",
    searchable: ["customer_code", "status"],
    writable: ["tenant_id", "user_id", "source_project_id", "customer_code", "status", "metadata"],
    tenantScopeColumn: "tenant_id",
    createTenantScoped: true
  },
  tenantPlans: {
    table: "tenant_plans",
    readPermission: "tenant.billing.read",
    writePermission: "tenant.billing.write",
    searchable: ["plan_code", "name", "billing_cycle", "support_level", "status"],
    writable: [
      "plan_code",
      "name",
      "billing_cycle",
      "base_fee_amount",
      "currency",
      "included_credit",
      "included_token_budget",
      "max_projects",
      "max_customers",
      "max_members",
      "log_retention_days",
      "support_level",
      "status",
      "metadata"
    ]
  },
  tenantSubscriptions: {
    table: "tenant_subscriptions",
    readPermission: "tenant.billing.read",
    writePermission: "tenant.billing.write",
    searchable: ["subscription_no", "status", "billing_mode"],
    writable: [
      "tenant_id",
      "plan_id",
      "subscription_no",
      "status",
      "billing_mode",
      "current_period_start",
      "current_period_end",
      "next_billing_at",
      "cancel_at",
      "seat_count",
      "base_fee_amount",
      "included_credit",
      "metadata"
    ],
    tenantScopeColumn: "tenant_id",
    createTenantScoped: true
  },
  tenantInvoices: {
    table: "tenant_invoices",
    readPermission: "tenant.billing.read",
    writePermission: "tenant.billing.write",
    searchable: ["invoice_no", "status", "currency"],
    writable: [
      "tenant_id",
      "subscription_id",
      "invoice_no",
      "period_start",
      "period_end",
      "status",
      "currency",
      "subtotal_amount",
      "discount_amount",
      "tax_amount",
      "total_amount",
      "paid_amount",
      "due_at",
      "paid_at",
      "metadata"
    ],
    tenantScopeColumn: "tenant_id",
    createTenantScoped: true
  },
  tenantInvoiceItems: {
    table: "tenant_invoice_items",
    readPermission: "tenant.billing.read",
    writePermission: "tenant.billing.write",
    searchable: ["item_type", "description"],
    writable: ["invoice_id", "item_type", "description", "quantity", "unit_amount", "amount", "metadata"]
  },
  tenantBillingRules: {
    table: "tenant_billing_rules",
    readPermission: "tenant.billing.read",
    writePermission: "tenant.billing.write",
    searchable: ["rule_code", "rule_version", "status", "billing_mode", "price_type"],
    writable: [
      "tenant_id",
      "rule_code",
      "rule_version",
      "status",
      "billing_mode",
      "price_type",
      "base_fee_amount",
      "included_credit",
      "included_token_budget",
      "min_commit_amount",
      "cost_plus_markup_rate",
      "min_margin_multiplier",
      "revenue_share_rate",
      "revenue_share_base",
      "payment_service_fee_rate",
      "effective_from",
      "effective_to",
      "metadata"
    ],
    tenantScopeColumn: "tenant_id",
    createTenantScoped: true
  },
  tenantModelAuthorizations: {
    table: "tenant_model_authorizations",
    readPermission: "tenant.model.read",
    writePermission: "tenant.model.write",
    searchable: ["status"],
    writable: [
      "tenant_id",
      "model_id",
      "status",
      "max_context_tokens",
      "rpm_limit",
      "tpm_limit",
      "daily_budget",
      "monthly_budget",
      "enabled_features",
      "metadata"
    ],
    tenantScopeColumn: "tenant_id",
    createTenantScoped: true
  },
  tenantModelPrices: {
    table: "tenant_model_prices",
    readPermission: "tenant.model.read",
    writePermission: "tenant.model.write",
    searchable: ["price_version", "currency", "pricing_mode", "status"],
    writable: [
      "tenant_id",
      "model_id",
      "price_version",
      "currency",
      "pricing_mode",
      "input_price_per_1k",
      "output_price_per_1k",
      "min_margin_multiplier",
      "cost_plus_markup_rate",
      "status",
      "effective_from",
      "effective_to",
      "metadata"
    ],
    tenantScopeColumn: "tenant_id",
    createTenantScoped: true
  },
  tenantUsageAggregates: {
    table: "tenant_usage_aggregates",
    readPermission: "tenant.billing.read",
    searchable: ["status"],
    writable: [],
    tenantScopeColumn: "tenant_id"
  },
  tenantRevenueShares: {
    table: "tenant_revenue_share_records",
    readPermission: "tenant.billing.read",
    writePermission: "tenant.billing.write",
    searchable: ["status"],
    writable: ["status", "settled_at", "reversed_at", "metadata"],
    tenantScopeColumn: "tenant_id"
  },
  users: {
    table: "users",
    readPermission: "user.read",
    writePermission: "user.suspend",
    searchable: ["email", "phone", "invite_code"],
    writable: ["status", "user_type"],
    customerScopeColumn: "id"
  },
  walletLedger: {
    table: "wallet_ledger",
    readPermission: "wallet.read",
    searchable: ["related_id", "idempotency_key", "event_type"],
    writable: [],
    tenantScopeColumn: "tenant_id",
    customerScopeColumn: "user_id"
  },
  apiKeys: {
    table: "api_keys",
    readPermission: "api_key.read",
    writePermission: "api_key.write",
    searchable: ["name", "key_prefix", "key_suffix", "status"],
    writable: [
      "tenant_id",
      "project_id",
      "tenant_customer_id",
      "user_id",
      "name",
      "status",
      "model_whitelist",
      "ip_whitelist",
      "rpm_limit",
      "tpm_limit",
      "daily_budget",
      "monthly_budget",
      "expires_at"
    ],
    hidden: ["key_hash"],
    tenantScopeColumn: "tenant_id",
    customerScopeColumn: "user_id",
    createTenantScoped: true
  },
  providers: {
    table: "providers",
    readPermission: "provider.read",
    writePermission: "provider.write",
    searchable: ["code", "name", "provider_type", "region"],
    writable: [
      "code",
      "name",
      "provider_type",
      "base_url",
      "region",
      "legal_scope",
      "status",
      "cost_currency",
      "monthly_budget",
      "rpm_limit",
      "tpm_limit",
      "timeout_ms",
      "retry_count",
      "health_status",
      "health_score",
      "metadata"
    ]
  },
  providerCredentials: {
    table: "provider_credentials",
    readPermission: "provider.read",
    writePermission: "provider.credential.write",
    searchable: ["name", "credential_type", "secret_last4"],
    writable: [
      "provider_id",
      "name",
      "credential_type",
      "status",
      "rpm_limit",
      "tpm_limit",
      "daily_budget",
      "monthly_budget",
      "auth_method",
      "aws_region",
      "endpoint_url",
      "metadata"
    ],
    hidden: ["encrypted_secret"]
  },
  models: {
    table: "models",
    readPermission: "model.read",
    writePermission: "model.write",
    searchable: ["public_model_code", "display_name", "model_family"],
    writable: [
      "public_model_code",
      "display_name",
      "model_family",
      "modality",
      "max_context_tokens",
      "default_max_output_tokens",
      "supports_stream",
      "supports_tools",
      "supports_json_mode",
      "status",
      "metadata"
    ]
  },
  modelPrices: {
    table: "model_prices",
    readPermission: "price.read",
    writePermission: "price.write",
    searchable: ["price_version", "currency"],
    writable: [
      "model_id",
      "price_version",
      "currency",
      "input_price_per_1k",
      "output_price_per_1k",
      "cache_read_price_per_1k",
      "cache_write_price_per_1k",
      "reserve_multiplier",
      "effective_from",
      "effective_to",
      "status"
    ]
  },
  modelRoutes: {
    table: "model_routes",
    readPermission: "route.read",
    writePermission: "route.write",
    searchable: ["route_code", "provider_model_code", "strategy"],
    writable: [
      "route_code",
      "model_id",
      "provider_id",
      "credential_id",
      "provider_model_code",
      "weight",
      "priority",
      "strategy",
      "enabled",
      "allow_fallback",
      "cost_priority",
      "latency_priority",
      "metadata"
    ]
  },
  paymentProducts: {
    table: "payment_products",
    readPermission: "payment.read",
    writePermission: "payment.reconcile",
    searchable: ["product_code", "name", "product_type", "ios_product_id"],
    writable: [
      "tenant_id",
      "project_id",
      "product_code",
      "name",
      "product_type",
      "face_value_amount",
      "bonus_amount",
      "sale_amount",
      "currency",
      "ios_product_id",
      "status",
      "metadata"
    ],
    tenantScopeColumn: "tenant_id",
    createTenantScoped: true
  },
  paymentProductVisibility: {
    table: "payment_product_visibility",
    readPermission: "payment.read",
    writePermission: "payment.reconcile",
    searchable: ["platform", "display_name", "display_description", "badge"],
    writable: [
      "product_id",
      "tenant_id",
      "project_id",
      "platform",
      "enabled",
      "sort_order",
      "display_name",
      "display_description",
      "badge",
      "metadata"
    ],
    tenantScopeColumn: "tenant_id",
    createTenantScoped: true
  },
  paymentChannels: {
    table: "payment_channels",
    readPermission: "payment.read",
    writePermission: "payment.reconcile",
    searchable: ["channel_code", "channel_type", "display_name", "platform", "payment_method"],
    writable: [
      "tenant_id",
      "project_id",
      "channel_code",
      "channel_type",
      "display_name",
      "platform",
      "payment_method",
      "settlement_mode",
      "fee_rate_bps",
      "sort_order",
      "enabled",
      "config"
    ],
    tenantScopeColumn: "tenant_id",
    createTenantScoped: true
  },
  paymentOrders: {
    table: "payment_orders",
    readPermission: "payment.read",
    searchable: ["order_no", "checkout_channel", "payment_method", "channel_trade_no"],
    writable: ["status", "metadata"],
    tenantScopeColumn: "tenant_id",
    customerScopeColumn: "user_id"
  },
  paymentCallbacks: {
    table: "payment_callbacks",
    readPermission: "payment.read",
    searchable: ["channel_code", "event_type", "process_result"],
    writable: [],
    tenantScopeColumn: "tenant_id"
  },
  paymentTransactions: {
    table: "payment_transactions",
    readPermission: "payment.read",
    searchable: ["transaction_type", "channel_code", "channel_trade_no", "status"],
    writable: [],
    tenantScopeColumn: "tenant_id"
  },
  paymentOrderEvents: {
    table: "payment_order_events",
    readPermission: "payment.read",
    searchable: ["event_type", "from_status", "to_status", "reason", "actor_type"],
    writable: [],
    tenantScopeColumn: "tenant_id"
  },
  reconciliationRecords: {
    table: "reconciliation_records",
    readPermission: "payment.reconcile",
    searchable: ["channel_code", "status", "difference_type", "order_no"],
    writable: ["status", "resolved_note", "metadata"],
    tenantScopeColumn: "tenant_id"
  },
  distributionPolicies: {
    table: "distribution_policies",
    readPermission: "config.read",
    writePermission: "config.write",
    searchable: ["platform", "distribution_channel", "package_name", "region"],
    writable: [
      "tenant_id",
      "project_id",
      "platform",
      "distribution_channel",
      "package_name",
      "region",
      "app_version_min",
      "app_version_max",
      "show_web_payment_link",
      "web_payment_url",
      "allowed_payment_methods",
      "payment_page_notice",
      "review_mode",
      "legal_approved",
      "status",
      "metadata"
    ],
    tenantScopeColumn: "tenant_id",
    createTenantScoped: true
  },
  configs: {
    table: "configs",
    readPermission: "config.read",
    writePermission: "config.write",
    searchable: ["config_key", "config_type", "status"],
    writable: ["config_key", "config_type", "draft_value", "status", "metadata"]
  },
  requestLogs: {
    table: "request_logs",
    readPermission: "request_log.read",
    searchable: ["request_id", "public_model_code", "status", "error_code"],
    writable: [],
    tenantScopeColumn: "tenant_id",
    customerScopeColumn: "user_id"
  },
  providerRequestAttempts: {
    table: "provider_request_attempts",
    readPermission: "request_log.read",
    searchable: ["provider_model_code", "status", "error_code"],
    writable: [],
    tenantScopeColumn: "tenant_id"
  },
  billingRecords: {
    table: "billing_records",
    readPermission: "wallet.read",
    searchable: ["price_version", "billing_status"],
    writable: [],
    tenantScopeColumn: "tenant_id",
    customerScopeColumn: "user_id"
  },
  commissions: {
    table: "commission_records",
    readPermission: "commission.read",
    writePermission: "commission.approve",
    searchable: ["status"],
    writable: ["status", "metadata"],
    tenantScopeColumn: "tenant_id",
    customerScopeColumn: "beneficiary_user_id"
  },
  commissionWithdrawals: {
    table: "commission_withdrawals",
    readPermission: "commission.read",
    writePermission: "commission.approve",
    searchable: ["status", "payout_method", "requested_from"],
    writable: ["status", "reviewed_at", "metadata"],
    tenantScopeColumn: "tenant_id",
    customerScopeColumn: "user_id"
  },
  policyDocuments: {
    table: "policy_documents",
    readPermission: "config.read",
    writePermission: "config.write",
    searchable: ["policy_type", "variant", "title", "status"],
    writable: ["policy_type", "variant", "title", "content", "status", "version", "effective_at", "metadata"]
  },
  contentReports: {
    table: "content_reports",
    readPermission: "audit.read",
    writePermission: "audit.read",
    searchable: ["target_type", "target_id", "reason", "status"],
    writable: ["status", "metadata"],
    tenantScopeColumn: "tenant_id",
    customerScopeColumn: "user_id"
  },
  accountDeletionRequests: {
    table: "account_deletion_requests",
    readPermission: "audit.read",
    writePermission: "audit.read",
    searchable: ["status", "reason", "requested_from"],
    writable: ["status", "balance_policy", "metadata"],
    tenantScopeColumn: "tenant_id",
    customerScopeColumn: "user_id"
  },
  riskEvents: {
    table: "risk_events",
    readPermission: "audit.read",
    searchable: ["event_type", "risk_level", "subject_type", "subject_id", "distribution_channel"],
    writable: [],
    tenantScopeColumn: "tenant_id",
    customerScopeColumn: "user_id"
  },
  customerAssignments: {
    table: "admin_customer_accounts",
    readPermission: "platform.tenant.read_all",
    writePermission: "platform.tenant.write_all",
    searchable: ["scope_note", "status"],
    writable: ["admin_user_id", "customer_user_id", "status", "scope_note"]
  },
  auditLogs: {
    table: "audit_logs",
    readPermission: "audit.read",
    searchable: ["action", "target_type", "target_id", "approval_no"],
    writable: []
  }
};

type ResourceKey = keyof typeof resourceMap;

@Injectable()
export class AdminService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(PaymentService) private readonly payment: PaymentService
  ) {}

  assertPlatformAdmin(user: any) {
    if (user?.accountType !== "admin") {
      throw new ForbiddenException("Platform admin account is required");
    }
  }

  async dashboard(user: any) {
    this.assertPermission(user, "payment.read");
    const scopedTenantIds = await this.getScopedTenantIds(user);
    const scopedPayment = this.buildTenantScopeSql("tenant_id", scopedTenantIds, []);
    const scopedRequest = this.buildTenantScopeSql("tenant_id", scopedTenantIds, []);
    const scopedBilling = this.buildTenantScopeSql("tenant_id", scopedTenantIds, []);
    const scopedRevenueTrend = this.buildTenantScopeSql("po.tenant_id", scopedTenantIds, []);
    const scopedCostTrend = this.buildTenantScopeSql("br.tenant_id", scopedTenantIds, []);
    const scopedRequestTrend = this.buildTenantScopeSql("rl.tenant_id", scopedTenantIds, []);
    const scopedModelTop = this.buildTenantScopeSql("tenant_id", scopedTenantIds, []);
    const scopedTenantTop = this.buildTenantScopeSql("po.tenant_id", scopedTenantIds, []);
    const [
      revenue,
      cost,
      todayRequests,
      orders,
      requests,
      revenueTrend,
      costTrend,
      requestTrend,
      modelUsageTop,
      tenantRevenueTop,
      providerHealth,
      paymentStatus
    ] = await Promise.all([
      this.db.query<{ amount: string }>(
        `select coalesce(sum(amount), 0)::text as amount
           from payment_orders
          where status in ('PAID','FULFILLED')
            and created_at >= date_trunc('day', now())
            ${scopedPayment.sql}`,
        scopedPayment.params
      ),
      this.db.query<{ amount: string }>(
        `select coalesce(sum(amount), 0)::text as amount
           from billing_records
          where created_at >= date_trunc('day', now())
            ${scopedBilling.sql}`,
        scopedBilling.params
      ),
      this.db.query<{ requests: string; tokens: string; avg_latency_ms: string }>(
        `select count(*)::text as requests,
                coalesce(sum(total_tokens), 0)::text as tokens,
                coalesce(round(avg(latency_ms))::int, 0)::text as avg_latency_ms
           from request_logs
          where created_at >= date_trunc('day', now())
            ${scopedRequest.sql}`,
        scopedRequest.params
      ),
      this.db.query<{ status: string; count: string }>(
        `select status, count(*)::text
           from payment_orders
          where 1=1 ${scopedPayment.sql}
          group by status
          order by status`,
        scopedPayment.params
      ),
      this.db.query<{ status: string; count: string }>(
        `select status, count(*)::text
           from request_logs
          where created_at >= now() - interval '24 hours'
            ${scopedRequest.sql}
          group by status`,
        scopedRequest.params
      ),
      this.db.query<{ date: string; label: string; revenue: string; orders: string }>(
        `with days as (
           select generate_series(
                    date_trunc('day', now()) - interval '13 days',
                    date_trunc('day', now()),
                    interval '1 day'
                  ) as day
         )
         select to_char(day, 'YYYY-MM-DD') as date,
                to_char(day, 'MM-DD') as label,
                coalesce(sum(po.amount) filter (where po.status in ('PAID','FULFILLED')), 0)::text as revenue,
                (count(po.id) filter (where po.status in ('PAID','FULFILLED')))::text as orders
           from days
           left join payment_orders po
             on po.created_at >= day
            and po.created_at < day + interval '1 day'
            ${scopedRevenueTrend.sql}
          group by day
          order by day`,
        scopedRevenueTrend.params
      ),
      this.db.query<{ date: string; cost: string }>(
        `with days as (
           select generate_series(
                    date_trunc('day', now()) - interval '13 days',
                    date_trunc('day', now()),
                    interval '1 day'
                  ) as day
         )
         select to_char(day, 'YYYY-MM-DD') as date,
                coalesce(sum(br.amount), 0)::text as cost
           from days
           left join billing_records br
             on br.created_at >= day
            and br.created_at < day + interval '1 day'
            and br.billing_status = 'settled'
            ${scopedCostTrend.sql}
          group by day
          order by day`,
        scopedCostTrend.params
      ),
      this.db.query<{ date: string; label: string; requests: string; tokens: string; error_requests: string; avg_latency_ms: string }>(
        `with days as (
           select generate_series(
                    date_trunc('day', now()) - interval '13 days',
                    date_trunc('day', now()),
                    interval '1 day'
                  ) as day
         )
         select to_char(day, 'YYYY-MM-DD') as date,
                to_char(day, 'MM-DD') as label,
                count(rl.id)::text as requests,
                coalesce(sum(rl.total_tokens), 0)::text as tokens,
                (count(rl.id) filter (where rl.error_code is not null or rl.status ilike '%error%' or rl.status ilike '%fail%'))::text as error_requests,
                coalesce(round(avg(rl.latency_ms))::int, 0)::text as avg_latency_ms
           from days
           left join request_logs rl
             on rl.created_at >= day
            and rl.created_at < day + interval '1 day'
            ${scopedRequestTrend.sql}
          group by day
          order by day`,
        scopedRequestTrend.params
      ),
      this.db.query<{ public_model_code: string; requests: string; tokens: string; error_requests: string; avg_latency_ms: string }>(
        `select public_model_code,
                count(*)::text as requests,
                coalesce(sum(total_tokens), 0)::text as tokens,
                (count(*) filter (where error_code is not null or status ilike '%error%' or status ilike '%fail%'))::text as error_requests,
                coalesce(round(avg(latency_ms))::int, 0)::text as avg_latency_ms
           from request_logs
          where created_at >= now() - interval '7 days'
            ${scopedModelTop.sql}
          group by public_model_code
          order by count(*) desc
          limit 8`,
        scopedModelTop.params
      ),
      this.db.query<{ tenant_id: string; tenant_name: string; revenue: string; orders: string }>(
        `select t.id as tenant_id,
                t.name as tenant_name,
                coalesce(sum(po.amount) filter (where po.status in ('PAID','FULFILLED')), 0)::text as revenue,
                (count(po.id) filter (where po.status in ('PAID','FULFILLED')))::text as orders
           from payment_orders po
           join tenants t on t.id = po.tenant_id
          where po.created_at >= now() - interval '30 days'
            ${scopedTenantTop.sql}
          group by t.id, t.name
          order by coalesce(sum(po.amount) filter (where po.status in ('PAID','FULFILLED')), 0) desc
          limit 8`,
        scopedTenantTop.params
      ),
      this.db.query(
        `select code, name, health_status, health_score
           from providers
          order by health_score asc nulls last
          limit 8`
      ),
      this.db.query(
        `select checkout_channel, status, count(*)::text
           from payment_orders
          where created_at >= now() - interval '7 days'
            ${scopedPayment.sql}
          group by checkout_channel, status
          order by checkout_channel, status`,
        scopedPayment.params
      )
    ]);

    const revenueAmount = Number(revenue.rows[0]?.amount ?? 0);
    const costAmount = Number(cost.rows[0]?.amount ?? 0);
    const costByDate = new Map(costTrend.rows.map((row) => [row.date, Number(row.cost ?? 0)]));
    return {
      todayRevenue: revenueAmount,
      todayCost: costAmount,
      todayGrossProfit: revenueAmount - costAmount,
      todayRequests: Number(todayRequests.rows[0]?.requests ?? 0),
      todayTokens: Number(todayRequests.rows[0]?.tokens ?? 0),
      todayAverageLatencyMs: Number(todayRequests.rows[0]?.avg_latency_ms ?? 0),
      paymentOrdersByStatus: orders.rows,
      requestsByStatus: requests.rows,
      revenueTrend: revenueTrend.rows.map((row) => {
        const dayRevenue = Number(row.revenue ?? 0);
        const dayCost = costByDate.get(row.date) ?? 0;
        return {
          ...row,
          revenue: dayRevenue,
          cost: dayCost,
          grossProfit: dayRevenue - dayCost,
          orders: Number(row.orders ?? 0)
        };
      }),
      requestTrend: requestTrend.rows.map((row) => ({
        date: row.date,
        label: row.label,
        requests: Number(row.requests ?? 0),
        tokens: Number(row.tokens ?? 0),
        errorRequests: Number(row.error_requests ?? 0),
        avgLatencyMs: Number(row.avg_latency_ms ?? 0)
      })),
      modelUsageTop: modelUsageTop.rows.map((row) => ({
        public_model_code: row.public_model_code,
        requests: Number(row.requests ?? 0),
        tokens: Number(row.tokens ?? 0),
        errorRequests: Number(row.error_requests ?? 0),
        avgLatencyMs: Number(row.avg_latency_ms ?? 0)
      })),
      tenantRevenueTop: tenantRevenueTop.rows.map((row) => ({
        ...row,
        revenue: Number(row.revenue ?? 0),
        orders: Number(row.orders ?? 0)
      })),
      providerHealth: providerHealth.rows,
      paymentStatus: paymentStatus.rows
    };
  }

  async list(resource: ResourceKey, query: Record<string, unknown>, user: any) {
    const config = this.getResource(resource);
    this.assertPermission(user, config.readPermission);
    if (resource === "customerAssignments") {
      return this.listCustomerAssignments(query);
    }
    if (resource === "tenantMemberships") {
      return this.listTenantMemberships(query, user);
    }
    if (resource === "tenantCustomers") {
      return this.listTenantCustomers(query, user);
    }
    if (resource === "tenantModelAuthorizations") {
      return this.listTenantModelAuthorizations(query, user);
    }
    if (resource === "tenantModelPrices") {
      return this.listTenantModelPrices(query, user);
    }
    if (resource === "tenantUsageAggregates") {
      return this.listTenantUsageAggregates(query, user);
    }
    if (resource === "paymentProducts") {
      return this.listPaymentProducts(query, user);
    }
    if (resource === "paymentProductVisibility") {
      return this.listPaymentProductVisibility(query, user);
    }

    const { page, pageSize, offset } = parsePagination(query);
    const params: unknown[] = [];
    const filters: string[] = [];
    await this.applyTenantScope(config, user, filters, params);
    await this.applyCustomerScope(config, user, filters, params);

    if (query.search && config.searchable?.length) {
      params.push(`%${String(query.search)}%`);
      const p = `$${params.length}`;
      filters.push(
        `(${config.searchable.map((col) => `${col}::text ilike ${p}`).join(" or ")})`
      );
    }

    for (const field of ["status", "tenant_id", "project_id", "user_id", "provider_id", "model_id", "platform", "payment_method"]) {
      if (query[field]) {
        params.push(query[field]);
        filters.push(`${field} = $${params.length}`);
      }
    }

    if (resource === "users" && query.user_type) {
      params.push(query.user_type);
      filters.push(`user_type = $${params.length}`);
    }

    if (resource === "users" && query.exclude_user_type) {
      params.push(query.exclude_user_type);
      filters.push(`user_type <> $${params.length}`);
    }

    if (resource === "users" && query.account_type) {
      const accountType = String(query.account_type);
      if (accountType === "admin") {
        filters.push("user_type = 'admin'");
      } else if (accountType === "tenant") {
        filters.push("user_type = 'tenant'");
      } else if (accountType === "customer") {
        filters.push("user_type not in ('admin', 'tenant')");
      }
    }

    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const countSql = `select count(*)::int as total from ${config.table} ${where}`;
    const dataSql = `select * from ${config.table} ${where} order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`;
    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ total: number }>(countSql, params),
      this.db.query(dataSql, [...params, pageSize, offset])
    ]);

    return {
      data: this.hideFields(dataResult.rows, config.hidden),
      total: countResult.rows[0]?.total ?? 0,
      page,
      pageSize
    };
  }

  private async listCustomerAssignments(query: Record<string, unknown>) {
    const { page, pageSize, offset } = parsePagination(query);
    const params: unknown[] = [];
    const filters: string[] = [];
    if (query.search) {
      params.push(`%${String(query.search)}%`);
      filters.push(
        `(admin_user.email ilike $${params.length} or customer_user.email ilike $${params.length} or aca.scope_note ilike $${params.length})`
      );
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`aca.status = $${params.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ total: number }>(
        `select count(*)::int as total
           from admin_customer_accounts aca
           join users admin_user on admin_user.id = aca.admin_user_id
           join users customer_user on customer_user.id = aca.customer_user_id
          ${where}`,
        params
      ),
      this.db.query(
        `select aca.*,
                admin_user.email as admin_email,
                customer_user.email as customer_email,
                customer_user.user_type as customer_type
           from admin_customer_accounts aca
           join users admin_user on admin_user.id = aca.admin_user_id
           join users customer_user on customer_user.id = aca.customer_user_id
          ${where}
          order by aca.created_at desc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, offset]
      )
    ]);
    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      pageSize
    };
  }

  private async listTenantMemberships(query: Record<string, unknown>, user: any) {
    const { page, pageSize, offset } = parsePagination(query);
    const params: unknown[] = [];
    const filters: string[] = [];
    if (!this.isSuperAdmin(user)) {
      const tenantIds = await this.getScopedTenantIds(user);
      if (!tenantIds?.length) {
        filters.push("false");
      } else {
        params.push(tenantIds);
        filters.push(`tm.tenant_id = any($${params.length}::uuid[])`);
      }
    }
    if (query.search) {
      params.push(`%${String(query.search)}%`);
      filters.push(
        `(tenant.name ilike $${params.length} or member_user.email ilike $${params.length} or tm.role_code ilike $${params.length})`
      );
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`tm.status = $${params.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ total: number }>(
        `select count(*)::int as total
           from tenant_memberships tm
           join tenants tenant on tenant.id = tm.tenant_id
           join users member_user on member_user.id = tm.user_id
          ${where}`,
        params
      ),
      this.db.query(
        `select tm.*,
                tenant.name as tenant_name,
                tenant.tenant_code,
                member_user.email as member_email,
                member_user.user_type as member_user_type
           from tenant_memberships tm
           join tenants tenant on tenant.id = tm.tenant_id
           join users member_user on member_user.id = tm.user_id
          ${where}
          order by tm.created_at desc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, offset]
      )
    ]);
    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      pageSize
    };
  }

  private async listTenantCustomers(query: Record<string, unknown>, user: any) {
    const { page, pageSize, offset } = parsePagination(query);
    const params: unknown[] = [];
    const filters: string[] = [];
    if (!this.isSuperAdmin(user)) {
      const tenantIds = await this.getScopedTenantIds(user);
      if (!tenantIds?.length) {
        filters.push("false");
      } else {
        params.push(tenantIds);
        filters.push(`tc.tenant_id = any($${params.length}::uuid[])`);
      }
    }
    if (query.search) {
      params.push(`%${String(query.search)}%`);
      filters.push(
        `(tenant.name ilike $${params.length} or customer_user.email ilike $${params.length} or customer_user.phone ilike $${params.length} or tc.customer_code ilike $${params.length})`
      );
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`tc.status = $${params.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ total: number }>(
        `select count(*)::int as total
           from tenant_customers tc
           join tenants tenant on tenant.id = tc.tenant_id
           join users customer_user on customer_user.id = tc.user_id
           left join tenant_projects project on project.id = tc.source_project_id
          ${where}`,
        params
      ),
      this.db.query(
        `select tc.*,
                tenant.name as tenant_name,
                tenant.tenant_code,
                project.name as project_name,
                project.project_type,
                customer_user.email as customer_email,
                customer_user.phone as customer_phone,
                customer_user.user_type as customer_user_type
           from tenant_customers tc
           join tenants tenant on tenant.id = tc.tenant_id
           join users customer_user on customer_user.id = tc.user_id
           left join tenant_projects project on project.id = tc.source_project_id
          ${where}
          order by tc.created_at desc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, offset]
      )
    ]);
    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      pageSize
    };
  }

  private async listTenantModelAuthorizations(query: Record<string, unknown>, user: any) {
    const { page, pageSize, offset } = parsePagination(query);
    const params: unknown[] = [];
    const filters: string[] = [];
    if (!this.isSuperAdmin(user)) {
      const tenantIds = await this.getScopedTenantIds(user);
      if (!tenantIds?.length) {
        filters.push("false");
      } else {
        params.push(tenantIds);
        filters.push(`tma.tenant_id = any($${params.length}::uuid[])`);
      }
    }
    if (query.search) {
      params.push(`%${String(query.search)}%`);
      filters.push(
        `(tenant.name ilike $${params.length} or m.public_model_code ilike $${params.length} or m.display_name ilike $${params.length} or tma.status ilike $${params.length})`
      );
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`tma.status = $${params.length}`);
    }
    if (query.tenant_id) {
      params.push(query.tenant_id);
      filters.push(`tma.tenant_id = $${params.length}`);
    }
    if (query.model_id) {
      params.push(query.model_id);
      filters.push(`tma.model_id = $${params.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ total: number }>(
        `select count(*)::int as total
           from tenant_model_authorizations tma
           join tenants tenant on tenant.id = tma.tenant_id
           join models m on m.id = tma.model_id
          ${where}`,
        params
      ),
      this.db.query(
        `select tma.*,
                tenant.name as tenant_name,
                tenant.tenant_code,
                m.public_model_code,
                m.display_name as model_display_name,
                m.model_family
           from tenant_model_authorizations tma
           join tenants tenant on tenant.id = tma.tenant_id
           join models m on m.id = tma.model_id
          ${where}
          order by tma.created_at desc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, offset]
      )
    ]);
    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      pageSize
    };
  }

  private async listTenantModelPrices(query: Record<string, unknown>, user: any) {
    const { page, pageSize, offset } = parsePagination(query);
    const params: unknown[] = [];
    const filters: string[] = [];
    if (!this.isSuperAdmin(user)) {
      const tenantIds = await this.getScopedTenantIds(user);
      if (!tenantIds?.length) {
        filters.push("false");
      } else {
        params.push(tenantIds);
        filters.push(`tmp.tenant_id = any($${params.length}::uuid[])`);
      }
    }
    if (query.search) {
      params.push(`%${String(query.search)}%`);
      filters.push(
        `(tenant.name ilike $${params.length} or m.public_model_code ilike $${params.length} or m.display_name ilike $${params.length} or tmp.price_version ilike $${params.length} or tmp.status ilike $${params.length})`
      );
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`tmp.status = $${params.length}`);
    }
    if (query.tenant_id) {
      params.push(query.tenant_id);
      filters.push(`tmp.tenant_id = $${params.length}`);
    }
    if (query.model_id) {
      params.push(query.model_id);
      filters.push(`tmp.model_id = $${params.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ total: number }>(
        `select count(*)::int as total
           from tenant_model_prices tmp
           join tenants tenant on tenant.id = tmp.tenant_id
           join models m on m.id = tmp.model_id
          ${where}`,
        params
      ),
      this.db.query(
        `select tmp.*,
                tenant.name as tenant_name,
                tenant.tenant_code,
                m.public_model_code,
                m.display_name as model_display_name,
                m.model_family
           from tenant_model_prices tmp
           join tenants tenant on tenant.id = tmp.tenant_id
           join models m on m.id = tmp.model_id
          ${where}
          order by tmp.created_at desc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, offset]
      )
    ]);
    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      pageSize
    };
  }

  private async listTenantUsageAggregates(query: Record<string, unknown>, user: any) {
    const { page, pageSize, offset } = parsePagination(query);
    const params: unknown[] = [];
    const filters: string[] = [];
    if (!this.isSuperAdmin(user)) {
      const tenantIds = await this.getScopedTenantIds(user);
      if (!tenantIds?.length) {
        filters.push("false");
      } else {
        params.push(tenantIds);
        filters.push(`tua.tenant_id = any($${params.length}::uuid[])`);
      }
    }
    if (query.search) {
      params.push(`%${String(query.search)}%`);
      filters.push(
        `(tenant.name ilike $${params.length} or project.name ilike $${params.length} or m.public_model_code ilike $${params.length} or tua.status ilike $${params.length})`
      );
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`tua.status = $${params.length}`);
    }
    if (query.tenant_id) {
      params.push(query.tenant_id);
      filters.push(`tua.tenant_id = $${params.length}`);
    }
    if (query.project_id) {
      params.push(query.project_id);
      filters.push(`tua.project_id = $${params.length}`);
    }
    if (query.model_id) {
      params.push(query.model_id);
      filters.push(`tua.model_id = $${params.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ total: number }>(
        `select count(*)::int as total
           from tenant_usage_aggregates tua
           join tenants tenant on tenant.id = tua.tenant_id
           left join tenant_projects project on project.id = tua.project_id
           left join models m on m.id = tua.model_id
          ${where}`,
        params
      ),
      this.db.query(
        `select tua.*,
                tenant.name as tenant_name,
                tenant.tenant_code,
                project.name as project_name,
                project.project_code,
                m.public_model_code,
                m.display_name as model_display_name
           from tenant_usage_aggregates tua
           join tenants tenant on tenant.id = tua.tenant_id
           left join tenant_projects project on project.id = tua.project_id
           left join models m on m.id = tua.model_id
          ${where}
          order by tua.period_start desc, tua.created_at desc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, offset]
      )
    ]);
    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      pageSize
    };
  }

  private async listPaymentProducts(query: Record<string, unknown>, user: any) {
    const { page, pageSize, offset } = parsePagination(query);
    const params: unknown[] = [];
    const filters: string[] = [];
    if (!this.isSuperAdmin(user)) {
      const tenantIds = await this.getScopedTenantIds(user);
      if (!tenantIds?.length) {
        filters.push("false");
      } else {
        params.push(tenantIds);
        filters.push(`pp.tenant_id = any($${params.length}::uuid[])`);
      }
    }
    if (query.search) {
      params.push(`%${String(query.search)}%`);
      filters.push(
        `(tenant.name ilike $${params.length} or project.name ilike $${params.length} or pp.product_code ilike $${params.length} or pp.name ilike $${params.length} or pp.product_type ilike $${params.length})`
      );
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`pp.status = $${params.length}`);
    }
    if (query.tenant_id) {
      params.push(query.tenant_id);
      filters.push(`pp.tenant_id = $${params.length}`);
    }
    if (query.project_id) {
      params.push(query.project_id);
      filters.push(`pp.project_id = $${params.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ total: number }>(
        `select count(*)::int as total
           from payment_products pp
           join tenants tenant on tenant.id = pp.tenant_id
           left join tenant_projects project on project.id = pp.project_id
          ${where}`,
        params
      ),
      this.db.query(
        `select pp.*,
                tenant.name as tenant_name,
                tenant.tenant_code,
                project.name as project_name,
                project.project_code,
                (
                  select string_agg(ppv.platform, ',' order by ppv.platform)
                    from payment_product_visibility ppv
                   where ppv.product_id = pp.id
                     and ppv.enabled = true
                ) as visible_platforms
           from payment_products pp
           join tenants tenant on tenant.id = pp.tenant_id
           left join tenant_projects project on project.id = pp.project_id
          ${where}
          order by pp.created_at desc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, offset]
      )
    ]);
    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      pageSize
    };
  }

  private async listPaymentProductVisibility(query: Record<string, unknown>, user: any) {
    const { page, pageSize, offset } = parsePagination(query);
    const params: unknown[] = [];
    const filters: string[] = [];
    if (!this.isSuperAdmin(user)) {
      const tenantIds = await this.getScopedTenantIds(user);
      if (!tenantIds?.length) {
        filters.push("false");
      } else {
        params.push(tenantIds);
        filters.push(`ppv.tenant_id = any($${params.length}::uuid[])`);
      }
    }
    if (query.search) {
      params.push(`%${String(query.search)}%`);
      filters.push(
        `(tenant.name ilike $${params.length} or project.name ilike $${params.length} or p.product_code ilike $${params.length} or p.name ilike $${params.length} or ppv.display_name ilike $${params.length} or ppv.badge ilike $${params.length})`
      );
    }
    if (query.tenant_id) {
      params.push(query.tenant_id);
      filters.push(`ppv.tenant_id = $${params.length}`);
    }
    if (query.project_id) {
      params.push(query.project_id);
      filters.push(`ppv.project_id = $${params.length}`);
    }
    if (query.product_id) {
      params.push(query.product_id);
      filters.push(`ppv.product_id = $${params.length}`);
    }
    if (query.platform) {
      params.push(query.platform);
      filters.push(`ppv.platform = $${params.length}`);
    }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ total: number }>(
        `select count(*)::int as total
           from payment_product_visibility ppv
           join payment_products p on p.id = ppv.product_id
           join tenants tenant on tenant.id = ppv.tenant_id
           left join tenant_projects project on project.id = ppv.project_id
          ${where}`,
        params
      ),
      this.db.query(
        `select ppv.*,
                p.product_code,
                p.name as product_name,
                p.product_type,
                tenant.name as tenant_name,
                tenant.tenant_code,
                project.name as project_name,
                project.project_code
           from payment_product_visibility ppv
           join payment_products p on p.id = ppv.product_id
           join tenants tenant on tenant.id = ppv.tenant_id
           left join tenant_projects project on project.id = ppv.project_id
          ${where}
          order by ppv.sort_order asc, ppv.created_at desc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, offset]
      )
    ]);
    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      pageSize
    };
  }

  async create(resource: ResourceKey, body: Record<string, unknown>, user: any, actor: AuditActor) {
    const config = this.getResource(resource);
    this.assertPermission(user, config.writePermission);
    const payload = this.pickWritable(config, body);
    await this.applyDefaultTenantForCreate(config, payload, user);
    await this.validateScopedPayload(config, payload, user);
    if (resource === "customerAssignments") {
      await this.validateCustomerAssignment(payload);
    }
    if (resource === "tenantCustomers") {
      await this.validateTenantCustomer(payload);
    }
    if (resource === "paymentProductVisibility") {
      await this.validatePaymentProductVisibility(payload);
    }
    if (!Object.keys(payload).length) {
      throw new BadRequestException("No writable fields provided");
    }
    const columns = Object.keys(payload);
    const values = columns.map((column) => this.normalizeValue(column, payload[column]));
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const { rows } = await this.db.query(
      `insert into ${config.table} (${columns.join(", ")})
       values (${placeholders.join(", ")})
       returning *`,
      values
    );
    await this.audit.record({
      actor,
      action: `${resource}.create`,
      targetType: config.table,
      targetId: rows[0].id,
      afterValue: this.hideFields([rows[0]], config.hidden)[0],
      reason: String(body.reason ?? "")
    });
    return this.hideFields(rows, config.hidden)[0];
  }

  async update(
    resource: ResourceKey,
    id: string,
    body: Record<string, unknown>,
    user: any,
    actor: AuditActor
  ) {
    const config = this.getResource(resource);
    this.assertPermission(user, config.writePermission);
    const before = await this.findById(config, id);
    await this.assertRecordScope(config, before, user);
    const payload = this.pickWritable(config, body);
    await this.validateScopedPayload(config, payload, user);
    if (resource === "customerAssignments") {
      await this.validateCustomerAssignment({ ...before, ...payload });
    }
    if (resource === "tenantCustomers") {
      await this.validateTenantCustomer({ ...before, ...payload });
    }
    if (resource === "paymentProductVisibility") {
      await this.validatePaymentProductVisibility({ ...before, ...payload });
    }
    if (!Object.keys(payload).length) {
      throw new BadRequestException("No writable fields provided");
    }
    const columns = Object.keys(payload);
    const values = columns.map((column) => this.normalizeValue(column, payload[column]));
    const setSql = columns.map((column, index) => `${column} = $${index + 1}`).join(", ");
    const { rows } = await this.db.query(
      `update ${config.table}
          set ${setSql}, updated_at = now()
        where ${config.idColumn ?? "id"} = $${columns.length + 1}
        returning *`,
      [...values, id]
    );
    await this.audit.record({
      actor,
      action: `${resource}.update`,
      targetType: config.table,
      targetId: id,
      beforeValue: this.hideFields([before], config.hidden)[0],
      afterValue: this.hideFields(rows, config.hidden)[0],
      reason: String(body.reason ?? "")
    });
    return this.hideFields(rows, config.hidden)[0];
  }

  async suspendUser(id: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "user.suspend");
    requireReason(body);
    const before = await this.findById(resourceMap.users, id);
    await this.assertRecordScope(resourceMap.users, before, user);
    const status = body.status === "active" ? "active" : "suspended";
    const { rows } = await this.db.query(
      `update users set status = $1, updated_at = now() where id = $2 returning *`,
      [status, id]
    );
    await this.audit.record({
      actor,
      action: status === "active" ? "user.unsuspend" : "user.suspend",
      targetType: "users",
      targetId: id,
      beforeValue: before,
      afterValue: rows[0],
      reason: String(body.reason)
    });
    return rows[0];
  }

  async adjustWallet(userId: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "wallet.adjust");
    requireReason(body);
    await this.assertCustomerAccess(user, userId);
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException("amount must be a positive integer in cents");
    }
    const direction = String(body.direction ?? "credit");
    if (!["credit", "debit", "freeze", "unfreeze"].includes(direction)) {
      throw new BadRequestException("Invalid direction");
    }
    const balanceType = String(body.balance_type ?? "cash");
    if (!["cash", "bonus", "frozen", "credit"].includes(balanceType)) {
      throw new BadRequestException("Invalid balance_type");
    }

    const result = await this.db.transaction(async (client) => {
      const wallet = await this.ensureWallet(client, userId, user);
      const before = { ...wallet };
      const next = this.applyWalletChange(wallet, direction, balanceType, amount);
      await client.query(
        `update wallets
            set cash_balance = $1,
                bonus_balance = $2,
                frozen_balance = $3,
                credit_limit = $4,
                updated_at = now()
          where id = $5`,
        [
          next.cash_balance,
          next.bonus_balance,
          next.frozen_balance,
          next.credit_limit,
          wallet.id
        ]
      );
      const ledger = await client.query(
        `insert into wallet_ledger
          (wallet_id, user_id, event_type, direction, balance_type, amount, currency, balance_after, related_type, related_id, idempotency_key, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'admin_adjustment', $9, $10, $11::jsonb)
         returning *`,
        [
          wallet.id,
          userId,
          "admin_adjustment",
          direction,
          balanceType,
          amount,
          wallet.currency,
          this.balanceAfter(next, balanceType),
          body.approval_no ?? null,
          `admin-adjust:${userId}:${Date.now()}`,
          JSON.stringify({ reason: body.reason, operator: actor.id })
        ]
      );
      return { before, wallet: next, ledger: ledger.rows[0] };
    });

    await this.audit.record({
      actor,
      action: "wallet.adjust",
      targetType: "wallets",
      targetId: result.wallet.id,
      beforeValue: result.before,
      afterValue: result.wallet,
      reason: String(body.reason)
    });
    return result;
  }

  async createCredential(providerId: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "provider.credential.write");
    if (!body.secret) {
      throw new BadRequestException("secret is required");
    }
    const secret = String(body.secret);
    const encryptedSecret = this.crypto.encryptSecret(secret);
    const payload = {
      provider_id: providerId,
      name: body.name,
      credential_type: body.credential_type ?? "openai_compatible_api_key",
      auth_method: body.auth_method ?? body.credential_type ?? "api_key",
      encrypted_secret: encryptedSecret,
      secret_last4: secret.slice(-4),
      status: body.status ?? "active",
      rpm_limit: body.rpm_limit,
      tpm_limit: body.tpm_limit,
      daily_budget: body.daily_budget,
      monthly_budget: body.monthly_budget,
      aws_region: body.aws_region,
      endpoint_url: body.endpoint_url,
      metadata: body.metadata ? JSON.stringify(body.metadata) : undefined
    };
    const columns = Object.entries(payload).filter(([, value]) => value !== undefined);
    const { rows } = await this.db.query(
      `insert into provider_credentials (${columns.map(([key]) => key).join(", ")})
       values (${columns.map((_, index) => `$${index + 1}`).join(", ")})
       returning id, provider_id, name, credential_type, auth_method, aws_region, endpoint_url, secret_last4, status, rpm_limit, tpm_limit, daily_budget, monthly_budget, metadata, last_used_at, created_at, updated_at`,
      columns.map(([, value]) => value)
    );
    await this.audit.record({
      actor,
      action: "provider.credential.create",
      targetType: "provider_credentials",
      targetId: rows[0].id,
      afterValue: rows[0],
      reason: String(body.reason ?? "")
    });
    return rows[0];
  }

  async syncProviderModels(providerId: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "provider.sync_models");
    const provider = await this.findById(resourceMap.providers, providerId);
    const credential = await this.resolveProviderCredential(providerId, body.credential_id ? String(body.credential_id) : undefined);
    const providerType = String(provider.provider_type);
    if (providerType !== "aws_bedrock" && credential.credential_type !== "bedrock_api_key") {
      throw new BadRequestException("Only AWS Bedrock API key model sync is implemented");
    }

    const apiKey = this.crypto.decryptSecret(credential.encrypted_secret);
    const region = String(body.aws_region ?? credential.aws_region ?? provider.region ?? "us-east-1");
    const endpoint = String(
      credential.endpoint_url ??
      provider.base_url ??
      `https://bedrock.${region}.amazonaws.com`
    ).replace(/\/$/, "");
    const res = await fetch(`${endpoint}/foundation-models`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json"
      }
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new BadRequestException(`Bedrock model sync failed: ${res.status} ${detail.slice(0, 240)}`);
    }

    const payload = await res.json() as { modelSummaries?: any[] };
    const summaries = payload.modelSummaries ?? [];
    const synced: any[] = [];
    for (const summary of summaries) {
      const modelId = String(summary.modelId ?? "");
      if (!modelId) {
        continue;
      }
      const model = await this.upsertSyncedModel(summary);
      const route = await this.upsertSyncedRoute(provider.id, credential.id, model.id, modelId);
      synced.push({
        model_id: model.id,
        public_model_code: model.public_model_code,
        provider_model_code: modelId,
        route_id: route.id
      });
    }

    await this.db.query(
      `update providers
          set metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb,
              updated_at = now()
        where id = $2`,
      [
        JSON.stringify({
          last_model_sync_at: new Date().toISOString(),
          last_model_sync_count: synced.length,
          model_source: "aws_bedrock"
        }),
        provider.id
      ]
    );

    await this.audit.record({
      actor,
      action: "provider.models.sync",
      targetType: "providers",
      targetId: provider.id,
      afterValue: { provider_id: provider.id, synced_count: synced.length },
      reason: String(body.reason ?? "sync provider models")
    });

    return {
      provider_id: provider.id,
      synced_count: synced.length,
      models: synced
    };
  }

  async createApiKey(body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "api_key.write");
    const tenantId = String(body.tenant_id ?? "");
    const projectId = String(body.project_id ?? "");
    const userId = String(body.user_id ?? "");
    if (!tenantId || !projectId || !userId || !body.name) {
      throw new BadRequestException("tenant_id, project_id, user_id and name are required");
    }
    await this.assertTenantAccess(user, tenantId);
    await this.assertCustomerAccess(user, userId);
    await this.assertProjectTenant(projectId, tenantId);
    const tenantCustomer = await this.findTenantCustomer(tenantId, userId);
    const modelWhitelist = this.asOptionalArray(body.model_whitelist);
    if (modelWhitelist?.length) {
      await this.validateTenantModelWhitelist(tenantId, modelWhitelist);
    }
    const plaintext = `aitp_${crypto.randomBytes(24).toString("base64url")}`;
    const keyHash = crypto.createHash("sha256").update(plaintext).digest("hex");
    const payload = {
      tenant_id: tenantId,
      project_id: projectId,
      tenant_customer_id: tenantCustomer.id,
      user_id: userId,
      name: body.name,
      key_prefix: plaintext.slice(0, 12),
      key_suffix: plaintext.slice(-6),
      key_hash: keyHash,
      status: body.status ?? "active",
      model_whitelist: modelWhitelist,
      ip_whitelist: this.asOptionalArray(body.ip_whitelist),
      rpm_limit: body.rpm_limit,
      tpm_limit: body.tpm_limit,
      daily_budget: body.daily_budget,
      monthly_budget: body.monthly_budget,
      expires_at: body.expires_at || null
    };
    const columns = Object.entries(payload).filter(([, value]) => value !== undefined);
    const { rows } = await this.db.query(
      `insert into api_keys (${columns.map(([key]) => key).join(", ")})
       values (${columns.map((_, index) => `$${index + 1}`).join(", ")})
       returning id, tenant_id, project_id, tenant_customer_id, user_id, name, key_prefix, key_suffix, status, model_whitelist, ip_whitelist, rpm_limit, tpm_limit, daily_budget, monthly_budget, expires_at, last_used_at, created_at, revoked_at`,
      columns.map(([, value]) => value)
    );
    await this.audit.record({
      actor,
      action: "api_key.create",
      targetType: "api_keys",
      targetId: rows[0].id,
      afterValue: rows[0],
      reason: String(body.reason ?? "")
    });
    return {
      key: plaintext,
      record: rows[0]
    };
  }

  async createTenantAccount(body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "platform.tenant.write_all");
    const tenantId = String(body.tenant_id ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const status = String(body.status ?? "active");
    if (!tenantId || !email || !password) {
      throw new BadRequestException("tenant_id, email and password are required");
    }
    if (!email.includes("@")) {
      throw new BadRequestException("email must be valid");
    }
    if (password.length < 8) {
      throw new BadRequestException("password must be at least 8 characters");
    }
    if (!["active", "suspended"].includes(status)) {
      throw new BadRequestException("Invalid account status");
    }
    const tenant = await this.findById(resourceMap.tenants, tenantId);
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await this.db.transaction(async (client) => {
      const existing = await client.query<{ id: string; user_type: string }>(
        `select id, user_type
           from users
          where email = $1
          for update`,
        [email]
      );
      if (existing.rows[0] && existing.rows[0].user_type !== "tenant") {
        throw new BadRequestException("This email already belongs to an admin or customer account");
      }

      const account = existing.rows[0]
        ? await client.query(
            `update users
                set password_hash = $1,
                    status = $2,
                    user_type = 'tenant',
                    updated_at = now()
              where id = $3
              returning id, email, status, user_type, created_at, updated_at`,
            [passwordHash, status, existing.rows[0].id]
          )
        : await client.query(
            `insert into users (email, password_hash, status, user_type, invite_code)
             values ($1, $2, $3, 'tenant', $4)
             returning id, email, status, user_type, created_at, updated_at`,
            [email, passwordHash, status, String(body.invite_code ?? `TENANT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`)]
          );

      const role = await client.query<{ id: string }>(
        `select id from roles where code = 'tenant' limit 1`
      );
      if (!role.rows[0]) {
        throw new BadRequestException("Tenant role is not initialized");
      }
      await client.query(
        `insert into user_roles (user_id, role_id)
         values ($1, $2)
         on conflict do nothing`,
        [account.rows[0].id, role.rows[0].id]
      );
      await client.query(
        `insert into tenant_memberships (tenant_id, user_id, role_code, status)
         values ($1, $2, 'tenant', $3)
         on conflict (tenant_id, user_id, role_code) do update
            set status = excluded.status,
                updated_at = now()
         returning *`,
        [tenantId, account.rows[0].id, status]
      );
      return account.rows[0];
    });

    await this.audit.record({
      actor,
      action: "tenant_account.create",
      targetType: "users",
      targetId: result.id,
      afterValue: { ...result, tenant_id: tenant.id, tenant_code: tenant.tenant_code },
      reason: String(body.reason ?? "")
    });
    return {
      account: result,
      tenant: {
        id: tenant.id,
        tenant_code: tenant.tenant_code,
        name: tenant.name
      }
    };
  }

  async revokeApiKey(id: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "api_key.revoke");
    requireReason(body);
    const before = await this.findById(resourceMap.apiKeys, id);
    await this.assertRecordScope(resourceMap.apiKeys, before, user);
    const { rows } = await this.db.query(
      `update api_keys
          set status = 'revoked',
              revoked_at = now()
        where id = $1
        returning id, tenant_id, project_id, tenant_customer_id, user_id, name, key_prefix, key_suffix, status, model_whitelist, ip_whitelist, rpm_limit, tpm_limit, daily_budget, monthly_budget, expires_at, last_used_at, created_at, revoked_at`,
      [id]
    );
    await this.audit.record({
      actor,
      action: "api_key.revoke",
      targetType: "api_keys",
      targetId: id,
      beforeValue: this.hideFields([before], resourceMap.apiKeys.hidden)[0],
      afterValue: rows[0],
      reason: String(body.reason)
    });
    return rows[0];
  }

  async previewTenantInvoice(tenantId: string, body: Record<string, unknown>, user: any) {
    this.assertPermission(user, "tenant.billing.read");
    await this.assertTenantAccess(user, tenantId);
    return this.buildTenantInvoiceDraft(tenantId, body);
  }

  async generateTenantInvoice(tenantId: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "tenant.billing.write");
    requireReason(body);
    await this.assertTenantAccess(user, tenantId);
    const draft = await this.buildTenantInvoiceDraft(tenantId, body);
    const result = await this.db.transaction(async (client) => {
      const invoiceNo = `TIN${Date.now()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const invoice = await client.query(
        `insert into tenant_invoices
          (tenant_id, subscription_id, invoice_no, period_start, period_end, status, currency, subtotal_amount, discount_amount, tax_amount, total_amount, due_at, metadata)
         values ($1, $2, $3, $4, $5, 'issued', 'CNY', $6, 0, 0, $6, now() + interval '15 days', $7::jsonb)
         returning *`,
        [
          tenantId,
          draft.subscription?.id ?? null,
          invoiceNo,
          draft.period_start,
          draft.period_end,
          draft.total_amount,
          JSON.stringify({ generated_by: actor.id, preview: draft.summary })
        ]
      );
      for (const item of draft.items) {
        await client.query(
          `insert into tenant_invoice_items (invoice_id, item_type, description, quantity, unit_amount, amount, metadata)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            invoice.rows[0].id,
            item.item_type,
            item.description,
            item.quantity,
            item.unit_amount,
            item.amount,
            JSON.stringify(item.metadata ?? {})
          ]
        );
      }
      return invoice.rows[0];
    });
    await this.audit.record({
      actor,
      action: "tenant.invoice.generate",
      targetType: "tenant_invoices",
      targetId: result.id,
      afterValue: result,
      reason: String(body.reason)
    });
    return result;
  }

  async refundOrder(orderId: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "payment.refund");
    requireReason(body);
    const before = await this.findById(resourceMap.paymentOrders, orderId);
    await this.assertRecordScope(resourceMap.paymentOrders, before, user);
    const result = await this.payment.requestRefund(
      orderId,
      body.amount === undefined || body.amount === null ? null : Number(body.amount),
      String(body.reason),
      "admin"
    );
    await this.audit.record({
      actor,
      action: "payment.refund.request",
      targetType: "payment_orders",
      targetId: orderId,
      beforeValue: before,
      afterValue: result,
      reason: String(body.reason)
    });
    return result;
  }

  async syncOrder(orderId: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "payment.reconcile");
    requireReason(body);
    const before = await this.findById(resourceMap.paymentOrders, orderId);
    await this.assertRecordScope(resourceMap.paymentOrders, before, user);
    const result = await this.payment.syncOrder(orderId, String(body.reason), "admin");
    await this.audit.record({
      actor,
      action: "payment.order.sync",
      targetType: "payment_orders",
      targetId: orderId,
      beforeValue: before,
      afterValue: result,
      reason: String(body.reason)
    });
    return result;
  }

  async publishConfig(id: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "config.publish");
    requireReason(body);
    const before = await this.findById(resourceMap.configs, id);
    const nextVersion = Number(before.config_version ?? 0) + 1;
    const { rows } = await this.db.query(
      `update configs
          set published_value = draft_value,
              status = 'published',
              config_version = $1,
              published_by = $2,
              published_at = now(),
              rollback_from_version = null,
              updated_at = now()
        where id = $3
        returning *`,
      [nextVersion, actor.id, id]
    );
    await this.audit.record({
      actor,
      action: "config.publish",
      targetType: "configs",
      targetId: id,
      beforeValue: before,
      afterValue: rows[0],
      reason: String(body.reason)
    });
    return rows[0];
  }

  async rollbackConfig(id: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "config.publish");
    requireReason(body);
    const before = await this.findById(resourceMap.configs, id);
    const { rows } = await this.db.query(
      `update configs
          set draft_value = published_value,
              status = 'draft',
              rollback_from_version = config_version,
              updated_at = now()
        where id = $1
        returning *`,
      [id]
    );
    await this.audit.record({
      actor,
      action: "config.rollback",
      targetType: "configs",
      targetId: id,
      beforeValue: before,
      afterValue: rows[0],
      reason: String(body.reason)
    });
    return rows[0];
  }

  async approveCommission(id: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "commission.approve");
    requireReason(body);
    const before = await this.findById(resourceMap.commissions, id);
    const { rows } = await this.db.query(
      `update commission_records set status = 'available', updated_at = now() where id = $1 returning *`,
      [id]
    );
    await this.audit.record({
      actor,
      action: "commission.approve",
      targetType: "commission_records",
      targetId: id,
      beforeValue: before,
      afterValue: rows[0],
      reason: String(body.reason)
    });
    return rows[0];
  }

  async reverseCommission(id: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "commission.approve");
    requireReason(body);
    const before = await this.findById(resourceMap.commissions, id);
    const { rows } = await this.db.query(
      `update commission_records set status = 'reversed', updated_at = now() where id = $1 returning *`,
      [id]
    );
    await this.audit.record({
      actor,
      action: "commission.reverse",
      targetType: "commission_records",
      targetId: id,
      beforeValue: before,
      afterValue: rows[0],
      reason: String(body.reason)
    });
    return rows[0];
  }

  async reviewCommissionWithdrawal(id: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "commission.approve");
    requireReason(body);
    const before = await this.findById(resourceMap.commissionWithdrawals, id);
    await this.assertRecordScope(resourceMap.commissionWithdrawals, before, user);
    const nextStatus = String(body.status ?? "approved");
    if (!["approved", "paid", "rejected"].includes(nextStatus)) {
      throw new BadRequestException("status must be approved, paid or rejected");
    }
    const { rows } = await this.db.query(
      `update commission_withdrawals
          set status = $2,
              reviewed_by = $3,
              reviewed_at = now(),
              metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb,
              updated_at = now()
        where id = $1
        returning *`,
      [
        id,
        nextStatus,
        user.id,
        JSON.stringify({
          review_reason: String(body.reason),
          payout_reference: body.payout_reference ?? null
        })
      ]
    );
    await this.audit.record({
      actor,
      action: "commission.withdrawal.review",
      targetType: "commission_withdrawals",
      targetId: id,
      beforeValue: before,
      afterValue: rows[0],
      reason: String(body.reason)
    });
    return rows[0];
  }

  async rebuildUsageAggregates(body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "tenant.billing.write");
    requireReason(body);
    const periodStart = body.period_start ? String(body.period_start) : null;
    const periodEnd = body.period_end ? String(body.period_end) : null;
    const tenantId = body.tenant_id ? String(body.tenant_id) : null;
    const { rowCount } = await this.db.query(
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
              jsonb_build_object('source', 'admin_rebuild')
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
    await this.audit.record({
      actor,
      action: "tenant_usage_aggregates.rebuild",
      targetType: "tenant_usage_aggregates",
      targetId: tenantId ?? "all",
      afterValue: { rowCount, period_start: periodStart, period_end: periodEnd, tenant_id: tenantId },
      reason: String(body.reason)
    });
    return { ok: true, affected: rowCount, period_start: periodStart, period_end: periodEnd, tenant_id: tenantId };
  }

  private async resolveProviderCredential(providerId: string, credentialId?: string) {
    const params = credentialId ? [providerId, credentialId] : [providerId];
    const { rows } = await this.db.query(
      `select *
         from provider_credentials
        where provider_id = $1
          and status = 'active'
          ${credentialId ? "and id = $2" : ""}
        order by created_at desc
        limit 1`,
      params
    );
    if (!rows[0]) {
      throw new NotFoundException("Active provider credential not found");
    }
    return rows[0];
  }

  private async upsertSyncedModel(summary: any) {
    const modelId = String(summary.modelId);
    const metadata = {
      source: "aws_bedrock",
      model_arn: summary.modelArn,
      provider_name: summary.providerName,
      input_modalities: summary.inputModalities,
      output_modalities: summary.outputModalities,
      customizations_supported: summary.customizationsSupported,
      inference_types_supported: summary.inferenceTypesSupported,
      model_lifecycle: summary.modelLifecycle
    };
    const modality = Array.isArray(summary.outputModalities) && summary.outputModalities.length
      ? summary.outputModalities.map((item: unknown) => String(item).toLowerCase())
      : ["text"];
    const { rows } = await this.db.query(
      `insert into models
        (public_model_code, display_name, model_family, modality, supports_stream, supports_tools, supports_json_mode, status, metadata)
       values ($1, $2, $3, $4, $5, false, false, 'active', $6::jsonb)
       on conflict (public_model_code) do update
          set display_name = excluded.display_name,
              model_family = excluded.model_family,
              modality = excluded.modality,
              supports_stream = excluded.supports_stream,
              metadata = coalesce(models.metadata, '{}'::jsonb) || excluded.metadata,
              updated_at = now()
       returning *`,
      [
        modelId,
        summary.modelName ?? modelId,
        summary.providerName ?? "aws_bedrock",
        modality,
        Boolean(summary.responseStreamingSupported),
        JSON.stringify(metadata)
      ]
    );
    return rows[0];
  }

  private async upsertSyncedRoute(providerId: string, credentialId: string, modelId: string, providerModelCode: string) {
    const routeCode = `bedrock-${providerModelCode.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`;
    const { rows } = await this.db.query(
      `insert into model_routes
        (route_code, model_id, provider_id, credential_id, provider_model_code, weight, priority, strategy, enabled, allow_fallback, metadata)
       values ($1, $2, $3, $4, $5, 100, 100, 'weighted_round_robin', true, true, '{"source":"aws_bedrock_sync"}'::jsonb)
       on conflict (route_code) do update
          set model_id = excluded.model_id,
              provider_id = excluded.provider_id,
              credential_id = excluded.credential_id,
              provider_model_code = excluded.provider_model_code,
              enabled = true,
              updated_at = now()
       returning *`,
      [routeCode, modelId, providerId, credentialId, providerModelCode]
    );
    return rows[0];
  }

  private async buildTenantInvoiceDraft(tenantId: string, body: Record<string, unknown>) {
    const subscriptionResult = await this.db.query(
      `select s.*, p.plan_code, p.name as plan_name
         from tenant_subscriptions s
         join tenant_plans p on p.id = s.plan_id
        where s.tenant_id = $1
          and s.status in ('active', 'trialing', 'past_due')
        order by s.created_at desc
        limit 1`,
      [tenantId]
    );
    const subscription = subscriptionResult.rows[0] ?? null;
    const periodStart = String(
      body.period_start ??
      subscription?.current_period_start?.toISOString?.() ??
      new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    );
    const periodEnd = String(
      body.period_end ??
      subscription?.current_period_end?.toISOString?.() ??
      new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
    );
    const ruleResult = await this.db.query(
      `select *
         from tenant_billing_rules
        where (tenant_id = $1 or tenant_id is null)
          and status = 'published'
          and effective_from <= $2
          and (effective_to is null or effective_to > $2::timestamptz)
        order by tenant_id nulls last, effective_from desc
        limit 1`,
      [tenantId, periodEnd]
    );
    const rule = ruleResult.rows[0] ?? null;
    const usageResult = await this.db.query<{ provider_cost: string; wholesale: string; tokens: string; requests: string }>(
      `select coalesce(sum(provider_cost_amount), 0)::text as provider_cost,
              coalesce(sum(tenant_wholesale_amount), 0)::text as wholesale,
              coalesce(sum(total_tokens), 0)::text as tokens,
              coalesce(sum(total_requests), 0)::text as requests
         from tenant_usage_aggregates
        where tenant_id = $1
          and period_start >= $2
          and period_end <= $3`,
      [tenantId, periodStart, periodEnd]
    );
    const paymentResult = await this.db.query<{ amount: string }>(
      `select coalesce(sum(amount), 0)::text as amount
         from payment_orders
        where tenant_id = $1
          and status in ('PAID','FULFILLED')
          and created_at >= $2
          and created_at < $3`,
      [tenantId, periodStart, periodEnd]
    );

    const baseFee = Number(rule?.base_fee_amount ?? subscription?.base_fee_amount ?? 0);
    const includedCredit = Number(rule?.included_credit ?? subscription?.included_credit ?? 0);
    const wholesale = Number(usageResult.rows[0]?.wholesale ?? 0);
    const payableUsage = Math.max(0, wholesale - includedCredit);
    const minCommit = Number(rule?.min_commit_amount ?? 0);
    const beforeMinCommit = baseFee + payableUsage;
    const minCommitDiff = Math.max(0, minCommit - beforeMinCommit);
    const items = [
      {
        item_type: "base_fee",
        description: "SaaS 基础服务费",
        quantity: 1,
        unit_amount: baseFee,
        amount: baseFee
      },
      {
        item_type: "usage_fee",
        description: "租户模型用量费",
        quantity: Number(usageResult.rows[0]?.tokens ?? 0),
        unit_amount: 0,
        amount: payableUsage,
        metadata: {
          included_credit: includedCredit,
          raw_wholesale_amount: wholesale,
          total_requests: Number(usageResult.rows[0]?.requests ?? 0)
        }
      },
      {
        item_type: "min_commit_diff",
        description: "最低消费补差",
        quantity: 1,
        unit_amount: minCommitDiff,
        amount: minCommitDiff
      }
    ].filter((item) => item.amount > 0 || item.item_type !== "min_commit_diff");
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    return {
      tenant_id: tenantId,
      subscription,
      rule,
      period_start: periodStart,
      period_end: periodEnd,
      total_amount: total,
      items,
      summary: {
        provider_cost_amount: Number(usageResult.rows[0]?.provider_cost ?? 0),
        tenant_wholesale_amount: wholesale,
        end_user_payment_amount: Number(paymentResult.rows[0]?.amount ?? 0),
        included_credit: includedCredit,
        min_commit_amount: minCommit
      }
    };
  }

  private getResource(resource: ResourceKey) {
    const config = resourceMap[resource];
    if (!config) {
      throw new NotFoundException("Resource not found");
    }
    return config;
  }

  private assertPermission(user: any, permission?: string) {
    if (!permission) {
      throw new ForbiddenException("Write operation is not allowed");
    }
    if (!user.permissions?.includes(permission)) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
  }

  private pickWritable(config: ResourceConfig, body: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(body).filter(([key, value]) => config.writable.includes(key) && value !== undefined)
    );
  }

  private normalizeValue(column: string, value: unknown) {
    if (value === "") {
      return null;
    }
    if (["metadata", "config", "draft_value", "published_value", "settings", "payment_policy"].includes(column)) {
      return JSON.stringify(value ?? {});
    }
    return value;
  }

  private asOptionalArray(value: unknown) {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    return String(value)
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private hideFields(rows: any[], hidden: string[] = []) {
    return rows.map((row) => {
      const clone = { ...row };
      for (const field of hidden) {
        delete clone[field];
      }
      return clone;
    });
  }

  private async findById(config: ResourceConfig, id: string) {
    const { rows } = await this.db.query(
      `select * from ${config.table} where ${config.idColumn ?? "id"} = $1`,
      [id]
    );
    if (!rows[0]) {
      throw new NotFoundException("Record not found");
    }
    return rows[0];
  }

  private isSuperAdmin(user: any) {
    return user.accountType === "admin" &&
      Array.isArray(user.permissions) &&
      user.permissions.includes("platform.tenant.read_all");
  }

  private async getScopedTenantIds(user: any): Promise<string[] | null> {
    if (this.isSuperAdmin(user)) {
      return null;
    }
    const { rows } = await this.db.query<{ tenant_id: string }>(
      `select tenant_id
         from tenant_memberships
        where user_id = $1
          and status = 'active'`,
      [user.id]
    );
    return rows.map((row) => row.tenant_id);
  }

  private async getScopedCustomerIds(user: any): Promise<string[] | null> {
    if (this.isSuperAdmin(user)) {
      return null;
    }
    const { rows } = await this.db.query<{ user_id: string }>(
      `select distinct tc.user_id
         from tenant_customers tc
         join tenant_memberships tm on tm.tenant_id = tc.tenant_id
        where tm.user_id = $1
          and tm.status = 'active'
          and tc.status = 'active'`,
      [user.id]
    );
    return rows.map((row) => row.user_id);
  }

  private buildTenantScopeSql(
    column: string,
    tenantIds: string[] | null,
    params: unknown[],
    conjunction = "and"
  ) {
    if (tenantIds === null) {
      return { sql: "", params };
    }
    if (!tenantIds.length) {
      return { sql: ` ${conjunction} false`, params };
    }
    params.push(tenantIds);
    return {
      sql: ` ${conjunction} ${column} = any($${params.length}::uuid[])`,
      params
    };
  }

  private async applyTenantScope(
    config: ResourceConfig,
    user: any,
    filters: string[],
    params: unknown[]
  ) {
    if (!config.tenantScopeColumn || this.isSuperAdmin(user)) {
      return;
    }
    const tenantIds = await this.getScopedTenantIds(user);
    if (!tenantIds?.length) {
      filters.push("false");
      return;
    }
    params.push(tenantIds);
    filters.push(`${config.tenantScopeColumn} = any($${params.length}::uuid[])`);
  }

  private async applyCustomerScope(
    config: ResourceConfig,
    user: any,
    filters: string[],
    params: unknown[]
  ) {
    if (!config.customerScopeColumn || this.isSuperAdmin(user)) {
      return;
    }
    const customerIds = await this.getScopedCustomerIds(user);
    if (!customerIds?.length) {
      filters.push("false");
      return;
    }
    params.push(customerIds);
    filters.push(`${config.customerScopeColumn} = any($${params.length}::uuid[])`);
  }

  private async assertRecordScope(config: ResourceConfig, record: any, user: any) {
    if (this.isSuperAdmin(user)) {
      return;
    }
    if (config.tenantScopeColumn) {
      await this.assertTenantAccess(user, record[config.tenantScopeColumn]);
    }
    if (config.customerScopeColumn) {
      await this.assertCustomerAccess(user, record[config.customerScopeColumn]);
    }
  }

  private async assertCustomerAccess(user: any, customerUserId: string) {
    if (this.isSuperAdmin(user)) {
      return;
    }
    const { rowCount } = await this.db.query(
      `select 1
         from tenant_customers tc
         join tenant_memberships tm on tm.tenant_id = tc.tenant_id
        where tm.user_id = $1
          and tc.user_id = $2
          and tm.status = 'active'
          and tc.status = 'active'`,
      [user.id, customerUserId]
    );
    if (!rowCount) {
      throw new ForbiddenException("Customer is outside current tenant scope");
    }
  }

  private async findTenantCustomer(tenantId: string, userId: string) {
    const { rows } = await this.db.query(
      `select *
         from tenant_customers
        where tenant_id = $1
          and user_id = $2
          and status = 'active'
        limit 1`,
      [tenantId, userId]
    );
    if (!rows[0]) {
      throw new ForbiddenException("Customer is not linked to the selected tenant");
    }
    return rows[0];
  }

  private async assertProjectTenant(projectId: string, tenantId: string) {
    const { rowCount } = await this.db.query(
      `select 1
         from tenant_projects
        where id = $1
          and tenant_id = $2
          and status = 'active'`,
      [projectId, tenantId]
    );
    if (!rowCount) {
      throw new ForbiddenException("Project is outside the selected tenant scope");
    }
  }

  private async validateTenantModelWhitelist(tenantId: string, modelCodes: string[]) {
    const { rows } = await this.db.query<{ public_model_code: string }>(
      `select m.public_model_code
         from models m
         join tenant_model_authorizations tma on tma.model_id = m.id
        where tma.tenant_id = $1
          and tma.status = 'active'
          and m.public_model_code = any($2::text[])`,
      [tenantId, modelCodes]
    );
    const allowed = new Set(rows.map((row) => row.public_model_code));
    const denied = modelCodes.filter((code) => !allowed.has(code));
    if (denied.length) {
      throw new ForbiddenException(`Model is not authorized for this tenant: ${denied.join(", ")}`);
    }
  }

  private async assertTenantAccess(user: any, tenantId: string) {
    if (this.isSuperAdmin(user)) {
      return;
    }
    const { rowCount } = await this.db.query(
      `select 1
         from tenant_memberships
        where user_id = $1
          and tenant_id = $2
          and status = 'active'`,
      [user.id, tenantId]
    );
    if (!rowCount) {
      throw new ForbiddenException("Tenant is outside current admin scope");
    }
  }

  private async applyDefaultTenantForCreate(config: ResourceConfig, payload: Record<string, unknown>, user: any) {
    if (!config.createTenantScoped || payload.tenant_id || this.isSuperAdmin(user)) {
      return;
    }
    const tenantIds = await this.getScopedTenantIds(user);
    if (!tenantIds?.length) {
      throw new ForbiddenException("Current admin has no active tenant scope");
    }
    payload.tenant_id = tenantIds[0];
  }

  private async validateScopedPayload(config: ResourceConfig, payload: Record<string, unknown>, user: any) {
    if (payload.tenant_id) {
      await this.assertTenantAccess(user, String(payload.tenant_id));
    }
    if (payload.user_id && config.table !== "users") {
      await this.assertCustomerAccess(user, String(payload.user_id));
    }
  }

  private async validatePaymentProductVisibility(payload: Record<string, unknown>) {
    const tenantId = payload.tenant_id ? String(payload.tenant_id) : "";
    const productId = payload.product_id ? String(payload.product_id) : "";
    const projectId = payload.project_id ? String(payload.project_id) : "";
    const platform = payload.platform ? String(payload.platform) : "";
    if (!tenantId || !productId || !platform) {
      return;
    }
    if (!["ios", "android", "web", "api"].includes(platform)) {
      throw new BadRequestException("Invalid platform");
    }
    const product = await this.db.query<{ id: string }>(
      `select id
         from payment_products
        where id = $1
          and tenant_id = $2`,
      [productId, tenantId]
    );
    if (!product.rowCount) {
      throw new BadRequestException("Product is outside the selected tenant");
    }
    if (!projectId) {
      return;
    }
    const project = await this.db.query<{ platform: string }>(
      `select platform
         from tenant_projects
        where id = $1
          and tenant_id = $2`,
      [projectId, tenantId]
    );
    if (!project.rows[0]) {
      throw new BadRequestException("Project is outside the selected tenant");
    }
    if (project.rows[0].platform !== platform) {
      throw new BadRequestException("Project platform must match visibility platform");
    }
  }

  private async validateCustomerAssignment(payload: Record<string, unknown>) {
    const adminUserId = payload.admin_user_id ? String(payload.admin_user_id) : "";
    const customerUserId = payload.customer_user_id ? String(payload.customer_user_id) : "";
    if (!adminUserId || !customerUserId) {
      return;
    }
    const { rows } = await this.db.query<{ id: string; user_type: string }>(
      `select id, user_type from users where id = any($1::uuid[])`,
      [[adminUserId, customerUserId]]
    );
    const byId = new Map(rows.map((row) => [row.id, row.user_type]));
    if (byId.get(adminUserId) !== "admin") {
      throw new BadRequestException("Customer assignment owner must be a platform admin account");
    }
    if (["admin", "tenant"].includes(String(byId.get(customerUserId)))) {
      throw new BadRequestException("Customer assignment target must be an app/web/API customer account");
    }
  }

  private async validateTenantCustomer(payload: Record<string, unknown>) {
    if (!payload.user_id) {
      return;
    }
    const { rows } = await this.db.query<{ user_type: string }>(
      `select user_type from users where id = $1`,
      [payload.user_id]
    );
    if (!rows[0]) {
      throw new NotFoundException("User not found");
    }
    if (["admin", "tenant"].includes(rows[0].user_type)) {
      throw new BadRequestException("Tenant customer must be an app/web/API customer account");
    }
  }

  private async ensureWallet(client: PoolClient, userId: string, actorUser: any) {
    const tenant = await this.resolveCustomerTenantForWrite(userId, actorUser);
    const existing = await client.query(
      `select * from wallets where user_id = $1 and tenant_id = $2 for update`,
      [userId, tenant.tenant_id]
    );
    if (existing.rows[0]) {
      return existing.rows[0];
    }
    const created = await client.query(
      `insert into wallets (user_id, tenant_id, tenant_customer_id, currency)
       values ($1, $2, $3, 'CNY')
       returning *`,
      [userId, tenant.tenant_id, tenant.tenant_customer_id]
    );
    return created.rows[0];
  }

  private async resolveCustomerTenantForWrite(userId: string, actorUser: any) {
    const params: unknown[] = [userId];
    const tenantFilter = this.isSuperAdmin(actorUser)
      ? ""
      : `and tc.tenant_id in (
           select tenant_id from tenant_memberships where user_id = $2 and status = 'active'
         )`;
    if (!this.isSuperAdmin(actorUser)) {
      params.push(actorUser.id);
    }
    const { rows } = await this.db.query<{ tenant_id: string; tenant_customer_id: string }>(
      `select tc.tenant_id, tc.id as tenant_customer_id
         from tenant_customers tc
        where tc.user_id = $1
          and tc.status = 'active'
          ${tenantFilter}
        order by tc.created_at asc
        limit 1`,
      params
    );
    if (!rows[0]) {
      throw new ForbiddenException("Customer is not linked to an active tenant");
    }
    return rows[0];
  }

  private applyWalletChange(wallet: any, direction: string, balanceType: string, amount: number) {
    const next = { ...wallet };
    const column =
      balanceType === "bonus"
        ? "bonus_balance"
        : balanceType === "frozen"
          ? "frozen_balance"
          : balanceType === "credit"
            ? "credit_limit"
            : "cash_balance";
    if (direction === "credit" || direction === "unfreeze") {
      next[column] = Number(next[column]) + amount;
    } else {
      next[column] = Number(next[column]) - amount;
    }
    if (next[column] < 0) {
      throw new BadRequestException("Wallet balance cannot become negative");
    }
    return next;
  }

  private balanceAfter(wallet: any, balanceType: string) {
    if (balanceType === "bonus") return wallet.bonus_balance;
    if (balanceType === "frozen") return wallet.frozen_balance;
    if (balanceType === "credit") return wallet.credit_limit;
    return wallet.cash_balance;
  }
}
