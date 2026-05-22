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
import { CryptoService } from "../common/crypto.service.js";
import { DatabaseService } from "../database/database.service.js";
import { PublicRequestUser } from "../public/public-auth.guard.js";
import { PublicService } from "../public/public.service.js";
import { ProviderAdapterRegistry } from "./providers/provider-adapter.registry.js";
import { ProviderAdapter, ProviderCompletionResult, ProviderCompletionInput, ProviderConfig } from "./providers/types.js";

type ChatRole = "system" | "user" | "assistant";

interface GatewayContext {
  tenantId: string;
  projectId: string | null;
  tenantCustomerId: string | null;
  userId: string;
  apiKeyId: string | null;
  modelWhitelist: string[];
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
  input_price_per_1m: number | null;
  output_price_per_1m: number | null;
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

interface ModelRouteConfig {
  id: string;
  provider_id: string;
  provider_model_code: string;
  credential_id: string | null;
  provider_type: string;
  provider_name: string | null;
  provider_region: string | null;
  provider_endpoint: string | null;
  provider_timeout_ms: number | null;
  provider_retry_count: number | null;
  provider_metadata: Record<string, unknown> | null;
  route_metadata: Record<string, unknown> | null;
  credential_type: string | null;
  auth_method: string | null;
  encrypted_secret: string | null;
  secret_last4: string | null;
  aws_region: string | null;
  endpoint_url: string | null;
  credential_metadata: Record<string, unknown> | null;
}

@Injectable()
export class AiGatewayService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PublicService) private readonly publicService: PublicService,
    @Inject(ProviderAdapterRegistry) private readonly providerAdapters: ProviderAdapterRegistry,
    @Inject(CryptoService) private readonly crypto: CryptoService
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
      apiKeyId: key.id,
      modelWhitelist: key.model_whitelist ?? []
    };
  }

  async listOpenAiModels(context: GatewayContext) {
    const models = (await this.listTenantModels(context.tenantId)).filter(
      (model) => !context.modelWhitelist.length || context.modelWhitelist.includes(model.public_model_code)
    );
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
      `with model_rows as (
         select m.id,
                m.public_model_code,
                m.display_name,
                m.model_family,
                coalesce(tma.max_context_tokens, m.max_context_tokens) as max_context_tokens,
                m.default_max_output_tokens,
                m.supports_stream,
                m.supports_tools,
                m.supports_json_mode,
                m.metadata,
                coalesce(m.metadata->>'canonical_model_key', m.public_model_code) as canonical_model_key,
                coalesce(tmp.input_price_per_1m, mp.input_price_per_1m, tmp.input_price_per_1k * 1000, mp.input_price_per_1k * 1000) as input_price_per_1m,
                coalesce(tmp.output_price_per_1m, mp.output_price_per_1m, tmp.output_price_per_1k * 1000, mp.output_price_per_1k * 1000) as output_price_per_1m,
                coalesce(tmp.price_version, mp.price_version) as price_version
           from models m
           join tenants tenant on tenant.id = $1
           left join tenant_model_authorizations tma
             on tma.model_id = m.id
            and tma.tenant_id = tenant.id
            and tma.status = 'active'
           left join lateral (
             select *
               from model_prices mp
              where mp.model_id = m.id
                and mp.status = 'active'
                and mp.effective_from <= now()
                and (mp.effective_to is null or mp.effective_to > now())
              order by effective_from desc, created_at desc
              limit 1
           ) mp on true
           left join lateral (
             select *
               from tenant_model_prices tmp
              where tmp.tenant_id = tenant.id
                and tmp.model_id = m.id
                and tmp.status = 'active'
                and tmp.effective_from <= now()
                and (tmp.effective_to is null or tmp.effective_to > now())
              order by effective_from desc, created_at desc
              limit 1
           ) tmp on true
          where m.status = 'active'
            and m.max_context_tokens is not null
            and coalesce(tmp.price_version, mp.price_version) is not null
       ),
       ranked as (
         select *,
                row_number() over (
                  partition by canonical_model_key
                  order by
                    case when metadata->>'public_preferred' = 'true' then 0 else 1 end,
                    input_price_per_1m asc,
                    output_price_per_1m asc,
                    display_name asc
                ) as model_rank
           from model_rows
       )
       select id,
              public_model_code,
              display_name,
              model_family,
              max_context_tokens,
              default_max_output_tokens,
              supports_stream,
              supports_tools,
              supports_json_mode
         from ranked
        where model_rank = 1
        order by model_family nulls last, display_name asc`,
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
    const estimatedOutputTokens = Math.min(Math.max(inputTokens * 2, 256), outputLimit);
    const estimatedCost = this.calculateCost(pricing, inputTokens, estimatedOutputTokens);
    const balance = await this.getAvailableBalance(context);
    const row = await this.db.query(
      `insert into chat_estimates
        (tenant_id, project_id, tenant_customer_id, user_id, model_code, prompt_tokens,
         max_output_tokens, estimated_cost_amount, currency, current_balance, enough_balance,
         metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
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
        balance >= estimatedCost,
        JSON.stringify({ estimated_output_tokens: estimatedOutputTokens })
      ]
    );
    return {
      id: row.rows[0].id,
      model,
      input_tokens: inputTokens,
      estimated_output_tokens: estimatedOutputTokens,
      output_token_limit: estimatedOutputTokens,
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
      apiKeyId: null,
      modelWhitelist: []
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
      temperature: body.temperature,
      topP: body.top_p,
      tools: body.tools,
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
    temperature?: unknown;
    topP?: unknown;
    tools?: unknown;
    idempotencyKey: string | null;
  }): Promise<CompletionResult> {
    if (!input.model) {
      throw new BadRequestException("model is required");
    }
    this.assertApiKeyModelAccess(input.context, input.model);

    if (input.idempotencyKey) {
      const cached = await this.findCachedCompletion(input.context, input.idempotencyKey);
      if (cached) return cached;
    }

    const pricing = await this.getPricing(input.context.tenantId, input.model);
    const outputLimit = this.resolveOutputLimit(input.maxTokens, pricing);
    const inputTokens = this.estimateTokens(input.messages.map((message) => message.content).join("\n"));
    const estimatedOutputTokens = Math.min(Math.max(inputTokens * 2, 256), outputLimit);
    const estimatedCost = this.calculateCost(pricing, inputTokens, estimatedOutputTokens);
    const balance = await this.getAvailableBalance(input.context);
    if (balance < estimatedCost) {
      throw new HttpException("Insufficient wallet balance", 402);
    }

    const route = await this.selectRoute(pricing.model_id);
    if (!route) {
      throw new HttpException("Provider route is not configured for this model", 503);
    }
    const providerConfig = this.buildProviderConfig(route);
    const adapter = this.providerAdapters.resolve(providerConfig.providerType);
    if (Array.isArray(input.tools) && input.tools.length > 0) {
      throw new BadRequestException("Tool calling is not supported by the configured provider adapter yet");
    }

    const requestId = `req_${randomUUID().replace(/-/g, "")}`;
    const started = Date.now();
    let providerResult: ProviderCompletionResult;
    const providerInput: ProviderCompletionInput = {
      publicModelCode: input.model,
      providerModelCode: route.provider_model_code,
      messages: input.messages,
      maxTokens: outputLimit,
      temperature: this.optionalNumber(input.temperature),
      topP: this.optionalNumber(input.topP),
      stream: input.stream
    };
    try {
      providerResult = input.stream
        ? await this.completeFromProviderStream(adapter, providerConfig, providerInput)
        : await adapter.complete(providerConfig, providerInput);
    } catch (error) {
      await this.recordProviderFailure({
        requestId,
        context: input.context,
        source: input.source,
        model: input.model,
        stream: input.stream,
        route,
        estimatedPromptTokens: inputTokens,
        estimatedCompletionTokens: estimatedOutputTokens,
        estimatedCost,
        currency: pricing.currency,
        started,
        idempotencyKey: input.idempotencyKey,
        error
      });
      throw new HttpException(`Provider unavailable: ${this.redactErrorMessage(error)}`, 503);
    }

    const content = providerResult.content;
    const outputTokens = providerResult.usage.outputTokens;
    const actualCost = this.calculateCost(pricing, providerResult.usage.inputTokens, outputTokens);
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
           $12, $13, $14,
           $15, $16, $17, $18,
           $19, $20, $21, $22, '[redacted]',
           '[redacted]', $23::jsonb, now(), $24, $25,
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
          estimatedOutputTokens,
          providerResult.usage.inputTokens,
          outputTokens,
          providerResult.usage.totalTokens,
          providerResult.usage.source,
          estimatedCost,
          actualCost,
          pricing.currency,
          Date.now() - started,
          providerResult.finishReason ?? "stop",
          JSON.stringify({
            provider_type: providerConfig.providerType,
            provider_model_code: route.provider_model_code,
            response_content_hash: createHash("sha256").update(content).digest("hex"),
            estimated: Boolean(providerResult.usage.estimated),
            model: input.model,
            provider_request_id: providerResult.providerRequestId ?? null
          }),
          input.idempotencyKey,
          input.stream ? "completed" : "none"
        ]
      );
      if (input.idempotencyKey) {
        await client.query(
          `insert into ai_completion_cache
            (request_log_id, tenant_id, user_id, idempotency_key, content_ciphertext, content_hash, metadata)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb)
           on conflict (tenant_id, user_id, idempotency_key) do nothing`,
          [
            requestLog.rows[0].id,
            input.context.tenantId,
            input.context.userId,
            input.idempotencyKey,
            this.crypto.encryptSecret(content),
            createHash("sha256").update(content).digest("hex"),
            JSON.stringify({
              source: input.source,
              model: input.model,
              provider_type: providerConfig.providerType
            })
          ]
        );
      }
      await client.query(
        `insert into provider_request_attempts
          (request_log_id, tenant_id, provider_id, route_id, provider_model_code,
           attempt_no, status, latency_ms, metadata, completed_at)
         values ($1, $2, $3, $4, $5, 1, 'success', $6, $7::jsonb, now())`,
        [
          requestLog.rows[0].id,
          input.context.tenantId,
          route.provider_id,
          route.id,
          route.provider_model_code,
          Date.now() - started,
          JSON.stringify({
            adapter: providerConfig.providerType,
            usage_source: providerResult.usage.source,
            provider_request_id: providerResult.providerRequestId ?? null
          })
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
          JSON.stringify({
            source: input.source,
            model: input.model,
            provider_type: providerConfig.providerType,
            provider_model_code: route.provider_model_code
          })
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
        input_tokens: providerResult.usage.inputTokens,
        output_tokens: outputTokens,
        total_tokens: providerResult.usage.totalTokens,
        actual_cost: actualCost,
        model: input.model,
        charged_at: result.chargedAt
      }
    };
  }

  private async completeFromProviderStream(
    adapter: ProviderAdapter,
    providerConfig: ProviderConfig,
    input: ProviderCompletionInput
  ): Promise<ProviderCompletionResult> {
    const chunks: string[] = [];
    let finalUsage: ProviderCompletionResult["usage"] | undefined;
    let finishReason: string | null = null;
    let providerRequestId: string | null = null;
    for await (const chunk of adapter.stream(providerConfig, input)) {
      if (chunk.delta) {
        chunks.push(chunk.delta);
      }
      if (chunk.usage) {
        finalUsage = chunk.usage;
      }
      if (chunk.finishReason) {
        finishReason = chunk.finishReason;
      }
      if (chunk.providerRequestId) {
        providerRequestId = chunk.providerRequestId;
      }
    }
    const content = chunks.join("");
    const fallbackInputTokens = this.estimateTokens(input.messages.map((message) => message.content).join("\n"));
    const fallbackOutputTokens = Math.min(this.estimateTokens(content), input.maxTokens);
    return {
      content,
      finishReason: finishReason ?? "stop",
      providerRequestId,
      usage:
        finalUsage ??
        {
          inputTokens: fallbackInputTokens,
          outputTokens: fallbackOutputTokens,
          totalTokens: fallbackInputTokens + fallbackOutputTokens,
          source: "estimated",
          estimated: true
        },
      metadata: { adapter: providerConfig.providerType, stream: true }
    };
  }

  private async recordProviderFailure(input: {
    requestId: string;
    context: GatewayContext;
    source: "app_chat" | "developer_api";
    model: string;
    stream: boolean;
    route: ModelRouteConfig;
    estimatedPromptTokens: number;
    estimatedCompletionTokens: number;
    estimatedCost: number;
    currency: string;
    started: number;
    idempotencyKey: string | null;
    error: unknown;
  }) {
    const latency = Date.now() - input.started;
    const errorCode = this.errorCode(input.error);
    const errorMessage = this.redactErrorMessage(input.error);
    const log = await this.db.query<{ id: string }>(
      `insert into request_logs
        (request_id, tenant_id, project_id, tenant_customer_id, user_id, api_key_id,
         source, public_model_code, provider_id, route_id, status, stream,
         estimated_prompt_tokens, estimated_completion_tokens, estimated_cost_amount,
         actual_cost_amount, currency, latency_ms, error_code, error_message,
         redacted_prompt, redacted_completion, metadata, completed_at, idempotency_key,
         stream_status, billing_status)
       values
        ($1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, 'failed', $11,
         $12, $13, $14,
         0, $15, $16, $17, $18,
         '[redacted]', '[redacted]', $19::jsonb, now(), $20,
         $21, 'not_billable')
       returning id`,
      [
        input.requestId,
        input.context.tenantId,
        input.context.projectId,
        input.context.tenantCustomerId,
        input.context.userId,
        input.context.apiKeyId,
        input.source,
        input.model,
        input.route.provider_id,
        input.route.id,
        input.stream,
        input.estimatedPromptTokens,
        input.estimatedCompletionTokens,
        input.estimatedCost,
        input.currency,
        latency,
        errorCode,
        errorMessage,
        JSON.stringify({
          provider_type: input.route.provider_type,
          provider_model_code: input.route.provider_model_code,
          billing_status: "not_billable"
        }),
        input.idempotencyKey,
        input.stream ? "failed" : "none"
      ]
    );
    await this.db.query(
      `insert into provider_request_attempts
        (request_log_id, tenant_id, provider_id, route_id, provider_model_code,
         attempt_no, status, latency_ms, error_code, error_message, metadata, completed_at)
       values ($1, $2, $3, $4, $5, 1, 'failed', $6, $7, $8, $9::jsonb, now())`,
      [
        log.rows[0].id,
        input.context.tenantId,
        input.route.provider_id,
        input.route.id,
        input.route.provider_model_code,
        latency,
        errorCode,
        errorMessage,
        JSON.stringify({ adapter: input.route.provider_type })
      ]
    );
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
      apiKeyId: null,
      modelWhitelist: []
    };
  }

  private assertApiKeyModelAccess(context: GatewayContext, modelCode: string) {
    if (!context.modelWhitelist.length) return;
    if (!context.modelWhitelist.includes(modelCode)) {
      throw new ForbiddenException("Model is not allowed by this API key");
    }
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
              coalesce(tmp.input_price_per_1k, mp.input_price_per_1k) as input_price_per_1k,
              coalesce(tmp.output_price_per_1k, mp.output_price_per_1k) as output_price_per_1k,
              coalesce(tmp.input_price_per_1m, mp.input_price_per_1m, tmp.input_price_per_1k * 1000, mp.input_price_per_1k * 1000) as input_price_per_1m,
              coalesce(tmp.output_price_per_1m, mp.output_price_per_1m, tmp.output_price_per_1k * 1000, mp.output_price_per_1k * 1000) as output_price_per_1m,
              coalesce(tmp.price_version, mp.price_version) as price_version,
              coalesce(tmp.currency, mp.currency) as currency
         from models m
         join tenants tenant on tenant.id = $1
         left join lateral (
           select input_price_per_1k,
                  output_price_per_1k,
                  input_price_per_1m,
                  output_price_per_1m,
                  price_version,
                  currency
             from tenant_model_prices
            where tenant_id = tenant.id
              and model_id = m.id
              and status = 'active'
              and effective_from <= now()
              and (effective_to is null or effective_to > now())
            order by effective_from desc, created_at desc
            limit 1
         ) tmp on true
         left join lateral (
           select input_price_per_1k,
                  output_price_per_1k,
                  input_price_per_1m,
                  output_price_per_1m,
                  price_version,
                  currency
             from model_prices
            where model_id = m.id
              and status = 'active'
              and effective_from <= now()
              and (effective_to is null or effective_to > now())
            order by effective_from desc, created_at desc
            limit 1
         ) mp on true
        where m.status = 'active'
          and m.max_context_tokens is not null
          and m.public_model_code = $2
        limit 1`,
      [tenantId, modelCode]
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Model is not available for this tenant");
    }
    if (!row.price_version) {
      throw new BadRequestException("Model pricing is not configured for this tenant");
    }
    return {
      ...row,
      default_max_output_tokens:
        row.default_max_output_tokens === null ? null : Number(row.default_max_output_tokens),
      input_price_per_1k: Number(row.input_price_per_1k ?? 0),
      output_price_per_1k: Number(row.output_price_per_1k ?? 0),
      input_price_per_1m: row.input_price_per_1m === null ? null : Number(row.input_price_per_1m ?? 0),
      output_price_per_1m: row.output_price_per_1m === null ? null : Number(row.output_price_per_1m ?? 0),
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
    const inputPer1m = pricing.input_price_per_1m ?? pricing.input_price_per_1k * 1000;
    const outputPer1m = pricing.output_price_per_1m ?? pricing.output_price_per_1k * 1000;
    return Math.max(
      Math.ceil((inputTokens * Number(inputPer1m ?? 0) + outputTokens * Number(outputPer1m ?? 0)) / 1_000_000),
      1
    );
  }

  private optionalNumber(value: unknown) {
    if (value === undefined || value === null || value === "") return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private errorCode(error: unknown) {
    return error instanceof Error ? error.name : "ProviderError";
  }

  private redactErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
      .replace(/(AWS4-HMAC-SHA256 Credential=)[^,\s]+/gi, "$1[redacted]")
      .replace(/(api[-_]?key[\"'\s:=]+)[^\"'\s,}]+/gi, "$1[redacted]")
      .replace(/(secret[_-]?access[_-]?key[\"'\s:=]+)[^\"'\s,}]+/gi, "$1[redacted]")
      .slice(0, 500);
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

  private async selectRoute(modelId: string): Promise<ModelRouteConfig | null> {
    const { rows } = await this.db.query<ModelRouteConfig>(
      `select mr.id,
              mr.provider_id,
              mr.provider_model_code,
              pc.id as credential_id,
              p.provider_type,
              p.name as provider_name,
              p.region as provider_region,
              p.base_url as provider_endpoint,
              p.timeout_ms as provider_timeout_ms,
              p.retry_count as provider_retry_count,
              p.metadata as provider_metadata,
              mr.metadata as route_metadata,
              pc.credential_type,
              pc.auth_method,
              pc.encrypted_secret,
              pc.secret_last4,
              pc.aws_region,
              pc.endpoint_url,
              pc.metadata as credential_metadata
         from model_routes mr
         join providers p on p.id = mr.provider_id
         left join lateral (
           select *
             from provider_credentials pc
            where pc.provider_id = p.id
              and pc.status = 'active'
              and (mr.credential_id is null or pc.id = mr.credential_id)
            order by case when mr.credential_id is not null and pc.id = mr.credential_id then 0 else 1 end,
                     pc.created_at desc
            limit 1
         ) pc on true
        where mr.model_id = $1
          and mr.enabled = true
          and p.status = 'active'
        order by mr.priority asc, mr.weight desc, mr.created_at asc
        limit 1`,
      [modelId]
    );
    return rows[0] ?? null;
  }

  private buildProviderConfig(route: ModelRouteConfig): ProviderConfig {
    const decryptedSecret = route.encrypted_secret ? this.crypto.decryptSecret(route.encrypted_secret) : null;
    return {
      id: route.provider_id,
      name: route.provider_name,
      providerType: route.provider_type,
      region: route.provider_region,
      endpoint: route.provider_endpoint,
      timeoutMs: route.provider_timeout_ms === null ? null : Number(route.provider_timeout_ms),
      retryCount: route.provider_retry_count === null ? null : Number(route.provider_retry_count),
      metadata: { ...(route.provider_metadata ?? {}), ...(route.route_metadata ?? {}) },
      credential: route.credential_id
        ? {
            id: route.credential_id,
            credentialType: route.credential_type,
            authMethod: route.auth_method,
            decryptedSecret,
            secretLast4: route.secret_last4,
            awsRegion: route.aws_region,
            endpointUrl: route.endpoint_url,
            metadata: route.credential_metadata ?? {}
          }
        : null
    };
  }

  private async findCachedCompletion(context: GatewayContext, idempotencyKey: string) {
    const { rows } = await this.db.query<{
      id: string;
      content_ciphertext: string;
      actual_prompt_tokens: number;
      actual_completion_tokens: number;
      total_tokens: number;
      actual_cost_amount: number;
      public_model_code: string;
      created_at: string;
    }>(
      `select rl.id,
              cache.content_ciphertext,
              actual_prompt_tokens,
              actual_completion_tokens,
              total_tokens,
              actual_cost_amount,
              public_model_code,
              created_at
         from ai_completion_cache cache
         join request_logs rl on rl.id = cache.request_log_id
        where cache.tenant_id = $1
          and cache.user_id = $2
          and cache.idempotency_key = $3
        limit 1`,
      [context.tenantId, context.userId, idempotencyKey]
    );
    const row = rows[0];
    if (!row?.content_ciphertext) return null;
    return {
      requestId: row.id,
      content: this.crypto.decryptSecret(row.content_ciphertext),
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
