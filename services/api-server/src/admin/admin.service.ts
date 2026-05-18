import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { AuditActor, AuditService } from "../common/audit.service.js";
import { CryptoService } from "../common/crypto.service.js";
import { parsePagination, requireReason } from "../common/http.js";

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
    @Inject(CryptoService) private readonly crypto: CryptoService
  ) {}

  async dashboard(user: any) {
    this.assertPermission(user, "payment.read");
    const scopedTenantIds = await this.getScopedTenantIds(user);
    const scopedPayment = this.buildTenantScopeSql("tenant_id", scopedTenantIds, []);
    const scopedRequest = this.buildTenantScopeSql("tenant_id", scopedTenantIds, []);
    const [
      revenue,
      cost,
      orders,
      requests,
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
            ${this.buildTenantScopeSql("tenant_id", scopedTenantIds, []).sql}`,
        this.buildTenantScopeSql("tenant_id", scopedTenantIds, []).params
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
    return {
      todayRevenue: revenueAmount,
      todayCost: costAmount,
      todayGrossProfit: revenueAmount - costAmount,
      paymentOrdersByStatus: orders.rows,
      requestsByStatus: requests.rows,
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

  async refundOrder(orderId: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "payment.refund");
    requireReason(body);
    const before = await this.findById(resourceMap.paymentOrders, orderId);
    await this.assertRecordScope(resourceMap.paymentOrders, before, user);
    const { rows } = await this.db.query(
      `update payment_orders
          set status = 'REFUNDING',
              metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb,
              updated_at = now()
        where id = $2
        returning *`,
      [JSON.stringify({ refund_reason: body.reason, refund_amount: body.amount ?? null }), orderId]
    );
    await this.audit.record({
      actor,
      action: "payment.refund.request",
      targetType: "payment_orders",
      targetId: orderId,
      beforeValue: before,
      afterValue: rows[0],
      reason: String(body.reason)
    });
    return rows[0];
  }

  async syncOrder(orderId: string, body: Record<string, unknown>, user: any, actor: AuditActor) {
    this.assertPermission(user, "payment.reconcile");
    requireReason(body);
    const before = await this.findById(resourceMap.paymentOrders, orderId);
    await this.assertRecordScope(resourceMap.paymentOrders, before, user);
    const { rows } = await this.db.query(
      `update payment_orders
          set metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb,
              updated_at = now()
        where id = $2
        returning *`,
      [JSON.stringify({ manual_sync_at: new Date().toISOString(), sync_reason: body.reason }), orderId]
    );
    await this.audit.record({
      actor,
      action: "payment.order.sync",
      targetType: "payment_orders",
      targetId: orderId,
      beforeValue: before,
      afterValue: rows[0],
      reason: String(body.reason)
    });
    return rows[0];
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
    return Array.isArray(user.roles) &&
      (user.roles.includes("super_admin") ||
        user.roles.includes("platform_master") ||
        user.roles.includes("platform_admin") ||
        user.permissions?.includes("platform.tenant.read_all"));
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
    if (byId.get(customerUserId) === "admin") {
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
    if (rows[0].user_type === "admin") {
      throw new BadRequestException("Tenant customer cannot be an admin account");
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
