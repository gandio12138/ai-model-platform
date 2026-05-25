import { Injectable } from "@nestjs/common";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand
} from "@aws-sdk/client-bedrock-runtime";
import {
  ProviderAdapter,
  ProviderChatMessage,
  ProviderCompletionInput,
  ProviderCompletionResult,
  ProviderConfig,
  ProviderHealthCheckInput,
  ProviderHealthCheckResult,
  ProviderStreamChunk,
  ProviderTokenUsage,
  ProviderToolValidationInput,
  ProviderToolValidationResult
} from "./types.js";

type BedrockAuthMode = "bedrock_api_key" | "iam_access_key" | "iam_role" | "assume_role";
type BedrockResolvedAuth =
  | { mode: "bedrock_api_key"; secret: string }
  | { mode: "iam_access_key"; accessKeyId: string; secretAccessKey: string }
  | { mode: "iam_role" }
  | { mode: "assume_role" };

@Injectable()
export class AwsBedrockProviderAdapter implements ProviderAdapter {
  readonly type = "aws_bedrock";

  async complete(provider: ProviderConfig, input: ProviderCompletionInput): Promise<ProviderCompletionResult> {
    const auth = this.resolveAuth(provider);
    if (auth.mode === "assume_role") {
      throw new Error("AWS Bedrock assume_role authentication is not implemented yet");
    }
    const started = Date.now();
    if (auth.mode === "bedrock_api_key") {
      return this.completeWithApiKey(provider, input, auth.secret, started);
    }
    return this.completeWithSdk(provider, input, auth, started);
  }

  async *stream(provider: ProviderConfig, input: ProviderCompletionInput): AsyncIterable<ProviderStreamChunk> {
    const auth = this.resolveAuth(provider);
    if (auth.mode === "assume_role") {
      throw new Error("AWS Bedrock assume_role authentication is not implemented yet");
    }
    if (auth.mode === "bedrock_api_key") {
      const result = await this.completeWithApiKey(provider, input, auth.secret, Date.now());
      for (let i = 0; i < result.content.length; i += 24) {
        yield { delta: result.content.slice(i, i + 24), providerRequestId: result.providerRequestId };
      }
      yield {
        done: true,
        finishReason: result.finishReason,
        usage: result.usage,
        providerRequestId: result.providerRequestId
      };
      return;
    }

    const client = this.createClient(provider, auth);
    const command = new ConverseStreamCommand(this.buildConverseRequest(input) as any);
    const response = await client.send(command);
    let usage: ProviderTokenUsage | undefined;
    let finishReason: string | null = null;
    let providerRequestId: string | null = response.$metadata.requestId ?? null;
    for await (const event of response.stream ?? []) {
      const chunk = event as any;
      const text = chunk.contentBlockDelta?.delta?.text;
      if (text) {
        yield { delta: text, providerRequestId };
      }
      const eventUsage = chunk.metadata?.usage;
      if (eventUsage) {
        usage = this.usageFromBedrock(eventUsage, input, "");
      }
      if (chunk.messageStop?.stopReason) {
        finishReason = String(chunk.messageStop.stopReason);
      }
      const exception = this.findStreamException(chunk);
      if (exception) {
        throw new Error(exception);
      }
    }
    yield { done: true, finishReason, usage, providerRequestId };
  }

  async validateCredentials(input: ProviderHealthCheckInput): Promise<ProviderHealthCheckResult> {
    const started = Date.now();
    try {
      const provider = input.provider;
      const modelId = String(input.modelId ?? provider.metadata?.health_check_model_id ?? "").trim();
      if (!modelId) {
        this.resolveAuth(provider);
        return {
          ok: true,
          providerType: this.type,
          region: this.resolveRegion(provider),
          credentialValid: true,
          regionAccessible: true,
          modelCallable: false,
          latencyMs: Date.now() - started,
          message: "凭证格式有效。填写模型 ID 后可验证模型是否可调用。",
          checkedAt: new Date().toISOString()
        };
      }
      await this.complete(provider, {
        publicModelCode: modelId,
        providerModelCode: modelId,
        messages: [{ role: "user", content: "Respond with ok." }],
        maxTokens: 16,
        temperature: 0,
        topP: 1
      });
      return {
        ok: true,
        providerType: this.type,
        region: this.resolveRegion(provider),
        credentialValid: true,
        regionAccessible: true,
        modelCallable: true,
        latencyMs: Date.now() - started,
        message: "AWS Bedrock 连接测试通过。",
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        ok: false,
        providerType: this.type,
        region: this.resolveRegion(input.provider),
        credentialValid: false,
        regionAccessible: false,
        modelCallable: false,
        latencyMs: Date.now() - started,
        message: "AWS Bedrock 连接测试失败。",
        errorCode: errorName(error),
        errorMessage: redactErrorMessage(error),
        checkedAt: new Date().toISOString()
      };
    }
  }

  async validateToolUse(input: ProviderToolValidationInput): Promise<ProviderToolValidationResult> {
    const started = Date.now();
    const provider = input.provider;
    const auth = this.resolveAuth(provider);
    if (auth.mode === "assume_role") {
      return this.toolValidationResult("unverified", started, "AWS Bedrock assume_role authentication is not implemented yet");
    }
    try {
      const response = auth.mode === "bedrock_api_key"
        ? await this.validateToolUseWithApiKey(provider, input.providerModelCode, auth.secret)
        : await this.validateToolUseWithSdk(provider, input.providerModelCode, auth);
      const content = response.output?.message?.content ?? [];
      const hasToolUse = Array.isArray(content) && content.some((block: any) => block?.toolUse || block?.tool_use);
      if (!hasToolUse) {
        return {
          ok: false,
          status: "unverified",
          providerType: this.type,
          providerRequestId: response.$metadata?.requestId ?? null,
          latencyMs: Date.now() - started,
          message: "模型接受了工具配置，但没有返回工具调用结果，保持待验证。",
          checkedAt: new Date().toISOString()
        };
      }
      return {
        ok: true,
        status: "supported",
        providerType: this.type,
        providerRequestId: response.$metadata?.requestId ?? null,
        latencyMs: Date.now() - started,
        message: "Tools 验证通过，模型返回了 toolUse。",
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      const errorMessage = redactErrorMessage(error);
      const unsupported = this.isToolUnsupportedError(error);
      return {
        ok: false,
        status: unsupported ? "unsupported" : "unverified",
        providerType: this.type,
        latencyMs: Date.now() - started,
        message: unsupported ? "模型或当前 Bedrock 调用方式不支持 Tools。" : "Tools 验证失败，保持待验证。",
        errorCode: errorName(error),
        errorMessage,
        checkedAt: new Date().toISOString()
      };
    }
  }

  private async completeWithSdk(
    provider: ProviderConfig,
    input: ProviderCompletionInput,
    auth: Extract<BedrockResolvedAuth, { mode: "iam_access_key" | "iam_role" }>,
    started: number
  ): Promise<ProviderCompletionResult> {
    const client = this.createClient(provider, auth);
    const response = await client.send(new ConverseCommand(this.buildConverseRequest(input) as any));
    const content = this.textFromContent(response.output?.message?.content ?? []);
    return {
      content,
      finishReason: response.stopReason ?? "stop",
      providerRequestId: response.$metadata.requestId ?? null,
      usage: this.usageFromBedrock(response.usage, input, content),
      metadata: {
        adapter: this.type,
        auth_mode: auth.mode,
        latency_ms: Date.now() - started,
        metrics: response.metrics ?? null
      }
    };
  }

  private async completeWithApiKey(
    provider: ProviderConfig,
    input: ProviderCompletionInput,
    apiKey: string,
    started: number
  ): Promise<ProviderCompletionResult> {
    const endpoint = this.resolveRuntimeEndpoint(provider);
    const controller = new AbortController();
    const timeoutMs = Number(provider.timeoutMs ?? 60000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${endpoint}/model/${encodeURIComponent(input.providerModelCode)}/converse`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify(this.buildConverseHttpBody(input)),
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Bedrock Runtime ${response.status}: ${text.slice(0, 400)}`);
      }
      const payload = JSON.parse(text || "{}") as any;
      const content = this.textFromContent(payload.output?.message?.content ?? []);
      return {
        content,
        finishReason: payload.stopReason ?? "stop",
        providerRequestId: response.headers.get("x-amzn-requestid"),
        usage: this.usageFromBedrock(payload.usage, input, content),
        metadata: {
          adapter: this.type,
          auth_mode: "bedrock_api_key",
          latency_ms: Date.now() - started,
          metrics: payload.metrics ?? null
        }
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private createClient(
    provider: ProviderConfig,
    auth: Extract<BedrockResolvedAuth, { mode: "iam_access_key" | "iam_role" }>
  ) {
    const credentials =
      auth.mode === "iam_access_key"
        ? {
            accessKeyId: auth.accessKeyId,
            secretAccessKey: auth.secretAccessKey
          }
        : undefined;
    return new BedrockRuntimeClient({
      region: this.resolveRegion(provider),
      endpoint: this.resolveRuntimeEndpoint(provider),
      maxAttempts: Math.max(Number(provider.retryCount ?? 2) + 1, 1),
      requestHandler: undefined,
      credentials
    });
  }

  private buildConverseRequest(input: ProviderCompletionInput) {
    const normalized = this.normalizeMessages(input.messages);
    return {
      modelId: input.providerModelCode,
      messages: normalized.messages,
      ...(normalized.system.length ? { system: normalized.system } : {}),
      inferenceConfig: {
        maxTokens: input.maxTokens,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        ...(input.topP === undefined ? {} : { topP: input.topP })
      }
    };
  }

  private async validateToolUseWithSdk(
    provider: ProviderConfig,
    modelId: string,
    auth: Extract<BedrockResolvedAuth, { mode: "iam_access_key" | "iam_role" }>
  ) {
    const client = this.createClient(provider, auth);
    return client.send(new ConverseCommand(this.buildToolValidationRequest(modelId) as any));
  }

  private async validateToolUseWithApiKey(provider: ProviderConfig, modelId: string, apiKey: string) {
    const endpoint = this.resolveRuntimeEndpoint(provider);
    const controller = new AbortController();
    const timeoutMs = Number(provider.timeoutMs ?? 60000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${endpoint}/model/${encodeURIComponent(modelId)}/converse`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify(this.buildToolValidationHttpBody(modelId)),
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Bedrock Runtime ${response.status}: ${text.slice(0, 400)}`);
      }
      return {
        ...(JSON.parse(text || "{}") as any),
        $metadata: { requestId: response.headers.get("x-amzn-requestid") }
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildToolValidationHttpBody(modelId: string) {
    const body = { ...this.buildToolValidationRequest(modelId) } as Record<string, unknown>;
    delete body.modelId;
    return body;
  }

  private buildToolValidationRequest(modelId: string) {
    return {
      modelId,
      messages: [
        {
          role: "user",
          content: [
            {
              text: "请调用 otoken_tool_probe 工具返回 status=ok。不要直接回答文本。"
            }
          ]
        }
      ],
      inferenceConfig: {
        maxTokens: 64,
        temperature: 0,
        topP: 1
      },
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: "otoken_tool_probe",
              description: "oToken 管理后台用于验证模型是否支持 tool use 的轻量探针。",
              inputSchema: {
                json: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                      description: "固定返回 ok"
                    }
                  },
                  required: ["status"]
                }
              }
            }
          }
        ],
        toolChoice: {
          tool: {
            name: "otoken_tool_probe"
          }
        }
      }
    };
  }

  private toolValidationResult(status: ProviderToolValidationResult["status"], started: number, message: string): ProviderToolValidationResult {
    return {
      ok: status === "supported",
      status,
      providerType: this.type,
      latencyMs: Date.now() - started,
      message,
      checkedAt: new Date().toISOString()
    };
  }

  private isToolUnsupportedError(error: unknown) {
    const name = errorName(error).toLowerCase();
    const message = redactErrorMessage(error).toLowerCase();
    return (
      name.includes("validation") &&
      (message.includes("tool") || message.includes("toolconfig") || message.includes("tool use"))
    ) || (
      (message.includes("tool") || message.includes("toolconfig") || message.includes("tool use")) &&
      (message.includes("not support") || message.includes("unsupported") || message.includes("invalid"))
    );
  }

  private buildConverseHttpBody(input: ProviderCompletionInput) {
    const body = { ...this.buildConverseRequest(input) } as Record<string, unknown>;
    delete body.modelId;
    return body;
  }

  private normalizeMessages(messages: ProviderChatMessage[]) {
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => ({ text: message.content }));
    const nonSystem = messages.filter((message) => message.role !== "system");
    return {
      system,
      messages: nonSystem.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: [{ text: message.content }]
      }))
    };
  }

  private textFromContent(content: any[]) {
    return content
      .map((block) => {
        if (typeof block?.text === "string") return block.text;
        if (typeof block?.json === "string") return block.json;
        return "";
      })
      .join("");
  }

  private usageFromBedrock(usage: any, input: ProviderCompletionInput, content: string): ProviderTokenUsage {
    const inputTokens = Number(usage?.inputTokens ?? usage?.input_tokens ?? 0);
    const outputTokens = Number(usage?.outputTokens ?? usage?.output_tokens ?? 0);
    const totalTokens = Number(usage?.totalTokens ?? usage?.total_tokens ?? inputTokens + outputTokens);
    if (inputTokens > 0 || outputTokens > 0 || totalTokens > 0) {
      return {
        inputTokens,
        outputTokens,
        totalTokens: totalTokens || inputTokens + outputTokens,
        source: "bedrock"
      };
    }
    const estimatedInput = estimateTokens(input.messages.map((message) => message.content).join("\n"));
    const estimatedOutput = Math.min(estimateTokens(content), input.maxTokens);
    return {
      inputTokens: estimatedInput,
      outputTokens: estimatedOutput,
      totalTokens: estimatedInput + estimatedOutput,
      source: "estimated",
      estimated: true
    };
  }

  private resolveAuth(provider: ProviderConfig): BedrockResolvedAuth {
    const credential = provider.credential;
    const providerAuthMode = String(
      provider.metadata?.auth_mode ?? provider.metadata?.authMode ?? ""
    ).toLowerCase();
    const credentialType = String(credential?.credentialType ?? "").toLowerCase();
    const authMethod = String((credential?.authMethod ?? credentialType) || providerAuthMode || "iam_role").toLowerCase();
    const mode = this.normalizeAuthMode(authMethod, credentialType);
    if (mode === "assume_role") {
      return { mode };
    }
    if (mode === "iam_role") {
      return { mode };
    }
    if (!credential?.decryptedSecret) {
      throw new Error("AWS Bedrock credential is not configured");
    }
    if (mode === "iam_access_key") {
      const secret = parseCredentialSecret(credential.decryptedSecret);
      if (!secret.accessKeyId || !secret.secretAccessKey) {
        throw new Error("AWS access key credential must include access_key_id and secret_access_key");
      }
      return {
        mode,
        accessKeyId: secret.accessKeyId,
        secretAccessKey: secret.secretAccessKey
      };
    }
    return { mode, secret: credential.decryptedSecret };
  }

  private normalizeAuthMode(authMethod: string, credentialType: string): BedrockAuthMode {
    if (authMethod === "iam_role" || credentialType === "iam_role") return "iam_role";
    if (authMethod === "iam_access_key" || credentialType === "iam_access_key") return "iam_access_key";
    if (authMethod === "assume_role" || credentialType === "assume_role") return "assume_role";
    return "bedrock_api_key";
  }

  private resolveRegion(provider: ProviderConfig) {
    return String(provider.credential?.awsRegion ?? provider.region ?? "us-east-1");
  }

  private resolveRuntimeEndpoint(provider: ProviderConfig) {
    const region = this.resolveRegion(provider);
    const configured = String(provider.credential?.endpointUrl ?? provider.endpoint ?? "").trim();
    const endpoint = configured || `https://bedrock-runtime.${region}.amazonaws.com`;
    return endpoint
      .replace(/\/$/, "")
      .replace("://bedrock.", "://bedrock-runtime.")
      .replace(`bedrock.${region}.amazonaws.com`, `bedrock-runtime.${region}.amazonaws.com`);
  }

  private findStreamException(event: any) {
    const keys = Object.keys(event ?? {});
    const exceptionKey = keys.find((key) => key.toLowerCase().endsWith("exception"));
    if (!exceptionKey) return null;
    const value = event[exceptionKey];
    return `${exceptionKey}: ${value?.message ?? JSON.stringify(value)}`;
  }
}

function parseCredentialSecret(secret: string) {
  const trimmed = secret.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      accessKeyId: String(parsed.access_key_id ?? parsed.aws_access_key_id ?? parsed.accessKeyId ?? ""),
      secretAccessKey: String(parsed.secret_access_key ?? parsed.aws_secret_access_key ?? parsed.secretAccessKey ?? "")
    };
  }
  const [accessKeyId, ...rest] = trimmed.split(":");
  return {
    accessKeyId,
    secretAccessKey: rest.join(":")
  };
}

function estimateTokens(content: string) {
  return Math.max(Math.ceil(content.length / 3.6), 1);
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "ProviderError";
}

function redactErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/(AWS4-HMAC-SHA256 Credential=)[^,\s]+/gi, "$1[redacted]")
    .replace(/(api[-_]?key[\"'\s:=]+)[^\"'\s,}]+/gi, "$1[redacted]")
    .slice(0, 500);
}
