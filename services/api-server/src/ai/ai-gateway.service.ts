import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { PublicRequestUser } from "../public/public-auth.guard.js";
import { PublicService } from "../public/public.service.js";

type ChatRole = "system" | "user" | "assistant";

interface GatewayContext {
  tenantId: string;
  projectId: string | null;
  tenantCustomerId: string | null;
  userId: string;
  apiKeyId: string | null;
}

interface ChatMessageInput {
  role: ChatRole;
  content: string;
}

interface ModelPricing {
  model_id: string;
  public_model_code: string;
  display_name: string;
  default_max_output_tokens: number | null;
  input_price_per_1k: number;
  output_price_per_1k: number;
  price_version: string | null;
  currency: string;
}

interface CompletionResult {
  requestId: string;
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    actual_cost: number;
    model: string;
    charged_at: string;
  };
}

@Injectable()
export class AiGatewayService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PublicService) private readonly publicService: PublicService
  ) {}

  async authenticateApiKey(authorization?: string): Promise<GatewayContext> {
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing API key bearer token");
    }
    const plaintext = authorization.slice("Bearer ".length).trim();
    const keyHash = createHash("sha256").update(plaintext).digest("hex");
    const { rows } = await this.db.query<{
      id: string;
      tenant_id: string;
      project_id: string | null;
      tenant_customer_id: string | null;
      user_id: string;
      status: string;
      expires_at: Date | null;
      model_whitelist: string[] | null;
    }>(
      `select id,
              tenant_id,
              project_id,
              tenant_customer_id,
              user_id,
              status,
              expires_at,
              model_whitelist
         from api_keys
        where key_hash = $1
          and deleted_at is null
        limit 1`,
      [keyHash]
    );
    const key = rows[0];
    if (!key || key.status !== "active") {
      throw new UnauthorizedException("Invalid API key");
    }
    if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedException("API key expired");
    }
    await this.db.query(`update api_keys set last_used_at = now(), updated_at = now() where id = $1`, [
      key.id
    ]);
    return {
      tenantId: key.tenant_id,
      projectId: key.project_id,
      tenantCustomerId: key.tenant_customer_id,
      userId: key.user_id,
      apiKeyId: key.id
    };
  }

  async listOpenAiModels(context: GatewayContext) {
    const models = await this.listTenantModels(context.tenantId);
    return {
      object: "list",
      data: models.map((model) => ({
        id: model.public_model_code,
        object: "model",
        created: 0,
        owned_by: "onetoken",
        permission: []
      }))
    };
  }

  async listTenantModels(tenantId: string) {
    const { rows } = await this.db.query<{
      id: string;
      public_model_code: string;
      display_name: string;
      model_family: string | null;
      max_context_tokens: number | null;
      default_max_output_tokens: number | null;
      supports_stream: boolean;
      supports_tools: boolean;
      supports_json_mode: boolean;
    }>(
      `select m.id,
              m.public_model_code,
              m.display_name,
              m.model_family,
              m.max_context_tokens,
              m.default_max_output_tokens,
              m.supports_stream,
              m.supports_tools,
              m.supports_json_mode
         from tenant_model_authorizations tma
         join models m on m.id = tma.model_id
        where tma.tenant_id = $1
          and tma.status = 'active'
          and m.status = 'active'
        order by m.model_family nulls last, m.display_name asc`,
      [tenantId]
    );
    return rows;
  }

  async estimateForUser(user: PublicRequestUser, body: Record<string, unknown>) {
    const context = await this.contextFromUser(user, body);
    const model = String(body.model ?? body.model_code ?? "");
    const messages = this.parseMessages(body.messages);
    const pricing = await this.getPricing(context.tenantId, model);
    const outputLimit = this.resolveOutputLimit(body.max_tokens, pricing);
    const inputTokens = this.estimateTokens(messages.map((message) => message.content).join("\n"));
    const estimatedCost = this.calculateCost(pricing, inputTokens, outputLimit);
    const balance = await this.getAvailableBalance(context);
    const row = await this.db.query(
      `insert into chat_estimates
        (tenant_id, project_id, tenant_customer_id, user_id, model_code, prompt_tokens,
         max_output_tokens, estimated_cost_amount, currency, current_balance, enough_balance,
         metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '{}'::jsonb)
       returning id, created_at`,
      [
        context.tenantId,
        context.projectId,
        context.tenantCustomerId,
        context.userId,
        model,
        inputTokens,
        outputLimit,
        estimatedCost,
        pricing.currency,
        balance,
        balance >= estimatedCost
      ]
    );
    return {
      id: row.rows[0].id,
      model,
      input_tokens: inputTokens,
      output_token_limit: outputLimit,
      max_output_tokens: outputLimit,
      estimated_cost: estimatedCost,
      current_balance: balance,
      enough_balance: balance >= estimatedCost,
      currency: pricing.currency,
      created_at: row.rows[0].created_at
    };
  }

  async createChatSession(user: PublicRequestUser, body: Record<string, unknown>) {
    const context = await this.contextFromUser(user, body);
    const model = String(body.model ?? body.model_code ?? "");
    if (!model) {
      throw new BadRequestException("model is required");
    }
    await this.getPricing(context.tenantId, model);
    const title = String(body.title ?? "新的对话").slice(0, 80);
    const { rows } = await this.db.query(
      `insert into chat_sessions
        (tenant_id, project_id, tenant_customer_id, user_id, title, model_code)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [context.tenantId, context.projectId, context.tenantCustomerId, context.userId, title, model]
    );
    return this.toChatSession(rows[0], []);
  }

  async listChatSessions(user: PublicRequestUser, query: Record<string, unknown>) {
    const context = await this.contextFromUser(user, query);
    const { rows } = await this.db.query(
      `select *
         from chat_sessions
        where tenant_id = $1
          and user_id = $2
          and deleted_at is null
        order by updated_at desc
        limit 50`,
      [context.tenantId, context.userId]
    );
    return { data: rows.map((row) => this.toChatSession(row, [])) };
  }

  async getChatSession(user: PublicRequestUser, id: string) {
    const session = await this.findChatSession(user, id);
    const messages = await this.listMessages(session.id);
    return this.toChatSession(session, messages);
  }

  async deleteChatSession(user: PublicRequestUser, id: string) {
    const session = await this.findChatSession(user, id);
    await this.db.query(
      `update chat_sessions
          set status = 'deleted',
              deleted_at = now(),
              updated_at = now()
        where id = $1`,
      [session.id]
    );
    return { ok: true };
  }

  async sendChatMessage(user: PublicRequestUser, id: string, body: Record<string, unknown>) {
    const session = await this.findChatSession(user, id);
    const context: GatewayContext = {
      tenantId: session.tenant_id,
      projectId: session.project_id,
      tenantCustomerId: session.tenant_customer_id,
      userId: session.user_id,
      apiKeyId: null
    };
    const content = String(body.content ?? "").trim();
    if (!content) {
      throw new BadRequestException("content is required");
    }
    const model = String(body.model ?? session.model_code);
    const previous = await this.listMessages(session.id);
    const userMessage = await this.insertChatMessage({
      sessionId: session.id,
      context,
      role: "user",
      content,
      modelCode: model
    });
    const messages: ChatMessageInput[] = [
      ...previous.map((message: any) => ({
        role: message.role as ChatRole,
        content: String(message.content)
      })),
      { role: "user", content }
    ];
    const completion = await this.complete({
      context,
      model,
      messages,
      source: "app_chat",
      stream: Boolean(body.stream),
      maxTokens: body.max_tokens,
      idempotencyKey: body.idempotency_key ? String(body.idempotency_key) : null
    });
    const assistantMessage = await this.insertChatMessage({
      sessionId: session.id,
      context,
      role: "assistant",
      content: completion.content,
      modelCode: model,
      requestLogId: completion.requestId,
      usage: completion.usage
    });
    await this.db.query(`update chat_sessions set updated_at = now(), model_code = $2 where id = $1`, [
      session.id,
      model
    ]);
    return {
      id: assistantMessage.id,
      role: "assistant",
      content: completion.content,
      created_at: assistantMessage.created_at,
      user_message_id: userMessage.id,
      usage: completion.usage
    };
  }

  async complete(input: {
    context: GatewayContext;
    model: string;
    messages: ChatMessageInput[];
    source: "app_chat" | "developer_api";
    stream: boolean;
    maxTokens: unknown;
    idempotencyKey: string | null;
  }): Promise<CompletionResult> {
    if (!input.model) {
      throw new BadRequestException("model is required");
    }
    const pricing = await this.getPricing(input.context.tenantId, input.model);
    const outputLimit = this.resolveOutputLimit(input.maxTokens, pricing);
    const inputTokens = this.estimateTokens(input.messages.map((message) => message.content).join("\n"));
    const content = this.fakeCompletion(input.model, input.messages);
    const outputTokens = Math.min(this.estimateTokens(content), outputLimit);
    const actualCost = this.calculateCost(pricing, inputTokens, outputTokens);
    const chargedAt = new Date().toISOString();
    const requestId = `req_${randomUUID().replace(/-/g, "")}`;
    const started = Date.now();

    if (process.env.NODE_ENV === "production" && process.env.ENABLE_FAKE_PROVIDER !== "true") {
      throw new HttpException("No production provider adapter is configured for this model", 503);
    }

    if (input.idempotencyKey) {
      const cached = await this.findCachedCompletion(input.context, input.idempotencyKey);
      if (cached) return cached;
    }

    const route = await this.selectRoute(pricing.model_id);
    const result = await this.db.transaction(async (client) => {
      const wallet = await this.lockWallet(client, input.context);
      const available =
        Number(wallet.cash_balance) + Number(wallet.bonus_balance) + Number(wallet.credit_limit);
      if (available < actualCost) {
        throw new HttpException("Insufficient wallet balance", 402);
      }
      const requestLog = await client.query(
        `insert into request_logs
          (request_id, tenant_id, project_id, tenant_customer_id, user_id, api_key_id,
           source, public_model_code, provider_id, route_id, status, stream,
           estimated_prompt_tokens, estimated_completion_tokens, actual_prompt_tokens,
           actual_completion_tokens, total_tokens, usage_source, estimated_cost_amount,
           actual_cost_amount, currency, latency_ms, finish_reason, redacted_prompt,
           redacted_completion, metadata, completed_at, idempotency_key, stream_status,
           billing_status)
         values
          ($1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, 'success', $11,
           $12, $13, $12,
           $13, $14, 'fake_provider', $15,
           $15, $16, $17, 'stop', '[redacted]',
           '[redacted]', $18::jsonb, now(), $19, $20,
           'settled')
         returning id, created_at`,
        [
          requestId,
          input.context.tenantId,
          input.context.projectId,
          input.context.tenantCustomerId,
          input.context.userId,
          input.context.apiKeyId,
          input.source,
          input.model,
          route?.provider_id ?? null,
          route?.id ?? null,
          input.stream,
          inputTokens,
          outputTokens,
          inputTokens + outputTokens,
          actualCost,
          pricing.currency,
          Date.now() - started,
          JSON.stringify({
            provider: "fake",
            response_content: content,
            estimated: false,
            model: input.model
          }),
          input.idempotencyKey,
          input.stream ? "completed" : "none"
        ]
      );
      await client.query(
        `insert into provider_request_attempts
          (request_log_id, tenant_id, provider_id, route_id, provider_model_code,
           attempt_no, status, latency_ms, metadata, completed_at)
         values ($1, $2, $3, $4, $5, 1, 'success', $6, $7::jsonb, now())`,
        [
          requestLog.rows[0].id,
          input.context.tenantId,
          route?.provider_id ?? null,
          route?.id ?? null,
          route?.provider_model_code ?? input.model,
          Date.now() - started,
          JSON.stringify({ adapter: "fake_provider" })
        ]
      );
      const ledgerId = await this.debitWallet(client, wallet, input.context, actualCost, pricing.currency, requestLog.rows[0].id);
      await client.query(
        `insert into billing_records
          (request_log_id, user_id, wallet_id, tenant_id, tenant_customer_id, model_id,
           price_version, amount, currency, billing_status, wallet_ledger_id, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'settled', $10, $11::jsonb)`,
        [
          requestLog.rows[0].id,
          input.context.userId,
          wallet.id,
          input.context.tenantId,
          input.context.tenantCustomerId,
          pricing.model_id,
          pricing.price_version,
          actualCost,
          pricing.currency,
          ledgerId,
          JSON.stringify({ source: input.source, model: input.model })
        ]
      );
      return {
        requestLogId: requestLog.rows[0].id,
        chargedAt: requestLog.rows[0].created_at
      };
    });

    return {
      requestId: result.requestLogId,
      content,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        actual_cost: actualCost,
        model: input.model,
        charged_at: result.chargedAt
      }
    };
  }

  private async contextFromUser(user: PublicRequestUser, query: Record<string, unknown>): Promise<GatewayContext> {
    const context = await this.publicService.resolveCheckoutContext({
      ...query,
      tenant_id: query.tenant_id ?? user.tenantId,
      project_id: query.project_id ?? user.projectId
    });
    const customerContext = await this.publicService.ensureCustomerContext(user.id, context);
    return {
      tenantId: context.tenant.id,
      projectId: context.project?.id ?? null,
      tenantCustomerId: customerContext.tenant_customer.id,
      userId: user.id,
      apiKeyId: null
    };
  }

  private parseMessages(value: unknown): ChatMessageInput[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException("messages must be an array");
    }
    const messages = value.map((item) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const role = String(record.role ?? "user") as ChatRole;
      if (!["system", "user", "assistant"].includes(role)) {
        throw new BadRequestException("message role must be system, user, or assistant");
      }
      const content = String(record.content ?? "").trim();
      if (!content) {
        throw new BadRequestException("message content is required");
      }
      return { role, content };
    });
    if (!messages.length) {
      throw new BadRequestException("messages cannot be empty");
    }
    return messages;
  }

  private async getPricing(tenantId: string, modelCode: string): Promise<ModelPricing> {
    const { rows } = await this.db.query<ModelPricing>(
      `select m.id as model_id,
              m.public_model_code,
              m.display_name,
              m.default_max_output_tokens,
              tmp.input_price_per_1k,
              tmp.output_price_per_1k,
              tmp.price_version,
              tmp.currency
         from tenant_model_authorizations tma
         join models m on m.id = tma.model_id
         left join lateral (
           select input_price_per_1k,
                  output_price_per_1k,
                  price_version,
                  currency
             from tenant_model_prices
            where tenant_id = tma.tenant_id
              and model_id = tma.model_id
              and status = 'active'
              and effective_from <= now()
              and (effective_to is null or effective_to > now())
            order by effective_from desc, created_at desc
            limit 1
         ) tmp on true
        where tma.tenant_id = $1
          and tma.status = 'active'
          and m.status = 'active'
          and m.public_model_code = $2
        limit 1`,
      [tenantId, modelCode]
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Model is not available for this tenant");
    }
    return {
      ...row,
      default_max_output_tokens:
        row.default_max_output_tokens === null ? null : Number(row.default_max_output_tokens),
      input_price_per_1k: Number(row.input_price_per_1k ?? 0),
      output_price_per_1k: Number(row.output_price_per_1k ?? 0),
      currency: row.currency ?? "CNY"
    };
  }

  private resolveOutputLimit(value: unknown, pricing: ModelPricing) {
    const requested = Number(value ?? 0);
    if (Number.isFinite(requested) && requested > 0) {
      return Math.min(Math.floor(requested), pricing.default_max_output_tokens ?? requested);
    }
    return pricing.default_max_output_tokens ?? 1024;
  }

  private estimateTokens(content: string) {
    return Math.max(Math.ceil(content.length / 3.6), 1);
  }

  private calculateCost(pricing: ModelPricing, inputTokens: number, outputTokens: number) {
    return Math.max(
      Math.ceil(
        (inputTokens * Number(pricing.input_price_per_1k ?? 0)) / 1000 +
          (outputTokens * Number(pricing.output_price_per_1k ?? 0)) / 1000
      ),
      1
    );
  }

  private async getAvailableBalance(context: GatewayContext) {
    const { rows } = await this.db.query<{ available: string }>(
      `select (cash_balance + bonus_balance + credit_limit)::text as available
         from wallets
        where tenant_id = $1
          and user_id = $2
          and currency = 'CNY'
          and status = 'active'
        limit 1`,
      [context.tenantId, context.userId]
    );
    return Number(rows[0]?.available ?? 0);
  }

  private async selectRoute(modelId: string) {
    const { rows } = await this.db.query<{
      id: string;
      provider_id: string;
      provider_model_code: string;
    }>(
      `select mr.id, mr.provider_id, mr.provider_model_code
         from model_routes mr
         join providers p on p.id = mr.provider_id
        where mr.model_id = $1
          and mr.enabled = true
          and p.status = 'active'
        order by mr.priority asc, mr.weight desc, mr.created_at asc
        limit 1`,
      [modelId]
    );
    return rows[0] ?? null;
  }

  private async findCachedCompletion(context: GatewayContext, idempotencyKey: string) {
    const { rows } = await this.db.query<{
      id: string;
      metadata: any;
      actual_prompt_tokens: number;
      actual_completion_tokens: number;
      total_tokens: number;
      actual_cost_amount: number;
      public_model_code: string;
      created_at: string;
    }>(
      `select id,
              metadata,
              actual_prompt_tokens,
              actual_completion_tokens,
              total_tokens,
              actual_cost_amount,
              public_model_code,
              created_at
         from request_logs
        where tenant_id = $1
          and user_id = $2
          and idempotency_key = $3
        limit 1`,
      [context.tenantId, context.userId, idempotencyKey]
    );
    const row = rows[0];
    if (!row?.metadata?.response_content) return null;
    return {
      requestId: row.id,
      content: String(row.metadata.response_content),
      usage: {
        input_tokens: Number(row.actual_prompt_tokens ?? 0),
        output_tokens: Number(row.actual_completion_tokens ?? 0),
        total_tokens: Number(row.total_tokens ?? 0),
        actual_cost: Number(row.actual_cost_amount ?? 0),
        model: row.public_model_code,
        charged_at: row.created_at
      }
    };
  }

  private async lockWallet(client: PoolClient, context: GatewayContext) {
    const { rows } = await client.query(
      `select *
         from wallets
        where tenant_id = $1
          and user_id = $2
          and currency = 'CNY'
          and status = 'active'
        for update`,
      [context.tenantId, context.userId]
    );
    if (!rows[0]) {
      throw new BadRequestException("Wallet not found");
    }
    return rows[0];
  }

  private async debitWallet(
    client: PoolClient,
    wallet: any,
    context: GatewayContext,
    amount: number,
    currency: string,
    requestLogId: string
  ) {
    let remaining = amount;
    let bonus = Number(wallet.bonus_balance);
    let cash = Number(wallet.cash_balance);
    let firstLedgerId: string | null = null;

    const bonusDebit = Math.min(bonus, remaining);
    if (bonusDebit > 0) {
      bonus -= bonusDebit;
      remaining -= bonusDebit;
      await client.query(`update wallets set bonus_balance = $2, updated_at = now() where id = $1`, [
        wallet.id,
        bonus
      ]);
      const ledger = await this.insertUsageLedger(client, {
        walletId: wallet.id,
        context,
        balanceType: "bonus",
        amount: bonusDebit,
        currency,
        balanceAfter: bonus,
        requestLogId,
        idempotencyKey: `usage:${requestLogId}:bonus`
      });
      firstLedgerId = firstLedgerId ?? ledger;
    }

    if (remaining > 0) {
      if (cash < remaining) {
        throw new HttpException("Insufficient wallet cash balance", 402);
      }
      cash -= remaining;
      await client.query(`update wallets set cash_balance = $2, updated_at = now() where id = $1`, [
        wallet.id,
        cash
      ]);
      const ledger = await this.insertUsageLedger(client, {
        walletId: wallet.id,
        context,
        balanceType: "cash",
        amount: remaining,
        currency,
        balanceAfter: cash,
        requestLogId,
        idempotencyKey: `usage:${requestLogId}:cash`
      });
      firstLedgerId = firstLedgerId ?? ledger;
    }

    return firstLedgerId;
  }

  private async insertUsageLedger(
    client: PoolClient,
    input: {
      walletId: string;
      context: GatewayContext;
      balanceType: "cash" | "bonus";
      amount: number;
      currency: string;
      balanceAfter: number;
      requestLogId: string;
      idempotencyKey: string;
    }
  ) {
    const { rows } = await client.query(
      `insert into wallet_ledger
        (wallet_id, user_id, tenant_id, tenant_customer_id, event_type, direction,
         balance_type, amount, currency, balance_after, related_type, related_id,
         idempotency_key, metadata)
       values ($1, $2, $3, $4, 'usage.charge', 'debit',
               $5, $6, $7, $8, 'request_log', $9, $10, '{}'::jsonb)
       on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
       returning id`,
      [
        input.walletId,
        input.context.userId,
        input.context.tenantId,
        input.context.tenantCustomerId,
        input.balanceType,
        input.amount,
        input.currency,
        input.balanceAfter,
        input.requestLogId,
        input.idempotencyKey
      ]
    );
    return rows[0].id as string;
  }

  private fakeCompletion(model: string, messages: ChatMessageInput[]) {
    const last = messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
    return [
      `这是 OneToken FakeProvider 的开发/测试回复，模型 ${model} 已收到你的请求。`,
      `问题摘要：${last.slice(0, 120) || "空消息"}`,
      "生产环境必须配置真实 Provider Adapter 和密钥后才能处理真实模型调用。"
    ].join("\n");
  }

  private async findChatSession(user: PublicRequestUser, id: string) {
    const { rows } = await this.db.query(
      `select *
         from chat_sessions
        where id = $1
          and user_id = $2
          and deleted_at is null`,
      [id, user.id]
    );
    if (!rows[0]) {
      throw new NotFoundException("Chat session not found");
    }
    return rows[0];
  }

  private async listMessages(sessionId: string) {
    const { rows } = await this.db.query(
      `select *
         from chat_messages
        where session_id = $1
        order by created_at asc`,
      [sessionId]
    );
    return rows;
  }

  private async insertChatMessage(input: {
    sessionId: string;
    context: GatewayContext;
    role: ChatRole;
    content: string;
    modelCode: string;
    requestLogId?: string;
    usage?: CompletionResult["usage"];
  }) {
    const { rows } = await this.db.query(
      `insert into chat_messages
        (session_id, tenant_id, project_id, tenant_customer_id, user_id, request_log_id,
         role, content, model_code, prompt_tokens, completion_tokens, total_tokens,
         cost_amount, billing_status)
       values ($1, $2, $3, $4, $5, $6,
               $7, $8, $9, $10, $11, $12,
               $13, $14)
       returning *`,
      [
        input.sessionId,
        input.context.tenantId,
        input.context.projectId,
        input.context.tenantCustomerId,
        input.context.userId,
        input.requestLogId ?? null,
        input.role,
        input.content,
        input.modelCode,
        input.usage?.input_tokens ?? null,
        input.usage?.output_tokens ?? null,
        input.usage?.total_tokens ?? null,
        input.usage?.actual_cost ?? null,
        input.usage ? "settled" : null
      ]
    );
    return rows[0];
  }

  private toChatSession(row: any, messages: any[]) {
    return {
      id: row.id,
      title: row.title ?? "新的对话",
      model: row.model_code,
      model_code: row.model_code,
      created_at: row.created_at,
      updated_at: row.updated_at,
      messages: messages.map((message) => this.toChatMessage(message))
    };
  }

  private toChatMessage(message: any) {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      created_at: message.created_at,
      usage:
        message.cost_amount === null || message.cost_amount === undefined
          ? null
          : {
              actual_cost: Number(message.cost_amount),
              input_tokens: Number(message.prompt_tokens ?? 0),
              output_tokens: Number(message.completion_tokens ?? 0),
              model: message.model_code,
              charged_at: message.created_at
            }
    };
  }
}
