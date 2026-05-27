import { Injectable } from "@nestjs/common";
import {
  anthropicHeaders,
  normalizeAnthropicBaseUrl,
  resolveAnthropicApiKey
} from "./anthropic-catalog.js";
import {
  ProviderAdapter,
  ProviderCompletionInput,
  ProviderCompletionResult,
  ProviderConfig,
  ProviderHealthCheckInput,
  ProviderHealthCheckResult,
  ProviderStreamChunk,
  ProviderTokenUsage
} from "./types.js";

@Injectable()
export class AnthropicProviderAdapter implements ProviderAdapter {
  readonly type = "anthropic";

  async complete(provider: ProviderConfig, input: ProviderCompletionInput): Promise<ProviderCompletionResult> {
    const started = Date.now();
    const response = await this.anthropicFetch(provider, "/messages", {
      method: "POST",
      body: JSON.stringify(this.buildMessagesBody(input, false))
    });
    const text = Array.isArray(response.content)
      ? response.content.map((item: any) => String(item.text ?? "")).join("")
      : "";
    return {
      content: text,
      finishReason: response.stop_reason ?? null,
      providerRequestId: response.id ?? response.__requestId ?? null,
      usage: this.toUsage(response.usage, input, text),
      metadata: { latency_ms: Date.now() - started }
    };
  }

  async *stream(provider: ProviderConfig, input: ProviderCompletionInput): AsyncIterable<ProviderStreamChunk> {
    const apiKey = this.resolveApiKey(provider);
    const response = await fetch(`${this.resolveBaseUrl(provider)}/messages`, {
      method: "POST",
      headers: this.resolveHeaders(provider, apiKey),
      body: JSON.stringify(this.buildMessagesBody(input, true)),
      signal: AbortSignal.timeout(Number(provider.timeoutMs ?? 120000))
    });
    if (!response.ok || !response.body) {
      const json = (await response.json().catch(() => ({}))) as any;
      throw new Error(`Anthropic stream request failed: ${response.status} ${json.error?.message ?? response.statusText}`);
    }
    const providerRequestId = response.headers.get("request-id") ?? response.headers.get("x-request-id") ?? null;
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let finishReason: string | null = null;
    let usage: ProviderTokenUsage | null = null;
    for await (const chunk of response.body as any as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice("data:".length).trim();
        if (!payload || payload === "[DONE]") continue;
        const json = JSON.parse(payload) as any;
        if (json.type === "content_block_delta") {
          const delta = String(json.delta?.text ?? "");
          if (delta) {
            content += delta;
            yield { delta, providerRequestId };
          }
        }
        if (json.type === "message_delta") {
          finishReason = json.delta?.stop_reason ?? finishReason;
          if (json.usage) usage = this.toUsage(json.usage, input, content);
        }
        if (json.type === "message_stop" && !usage) {
          usage = this.toUsage(null, input, content);
        }
      }
    }
    yield {
      done: true,
      finishReason,
      usage: usage ?? this.toUsage(null, input, content),
      providerRequestId
    };
  }

  async validateCredentials(input: ProviderHealthCheckInput): Promise<ProviderHealthCheckResult> {
    const started = Date.now();
    try {
      this.resolveApiKey(input.provider);
      const modelId = String(input.modelId ?? input.provider.metadata?.health_check_model_id ?? "").trim();
      if (!modelId) {
        await this.anthropicFetch(input.provider, "/models?limit=1", { method: "GET" });
        return {
          ok: true,
          providerType: this.type,
          region: this.resolveRegion(input.provider),
          credentialValid: true,
          regionAccessible: true,
          modelCallable: false,
          latencyMs: Date.now() - started,
          message: "Anthropic API Key 有效。填写模型 ID 后可验证真实调用。",
          checkedAt: new Date().toISOString()
        };
      }
      await this.complete(input.provider, {
        publicModelCode: modelId,
        providerModelCode: modelId,
        messages: [{ role: "user", content: "Respond with ok." }],
        maxTokens: 16,
        temperature: 0
      });
      return {
        ok: true,
        providerType: this.type,
        region: this.resolveRegion(input.provider),
        credentialValid: true,
        regionAccessible: true,
        modelCallable: true,
        latencyMs: Date.now() - started,
        message: "Anthropic Provider 连接测试通过。",
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
        message: "Anthropic Provider 连接测试失败。",
        errorCode: error instanceof Error ? error.name : "Error",
        errorMessage: redactErrorMessage(error),
        checkedAt: new Date().toISOString()
      };
    }
  }

  private async anthropicFetch(provider: ProviderConfig, path: string, init: RequestInit) {
    const apiKey = this.resolveApiKey(provider);
    const response = await fetch(`${this.resolveBaseUrl(provider)}${path}`, {
      ...init,
      headers: {
        ...this.resolveHeaders(provider, apiKey),
        ...(init.headers as Record<string, string> | undefined)
      },
      signal: init.signal ?? AbortSignal.timeout(Number(provider.timeoutMs ?? 60000))
    });
    const json = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || json.error) {
      throw new Error(`Anthropic request failed: ${response.status} ${json.error?.message ?? response.statusText}`);
    }
    json.__requestId = response.headers.get("request-id") ?? response.headers.get("x-request-id") ?? null;
    return json;
  }

  private buildMessagesBody(input: ProviderCompletionInput, stream: boolean) {
    const system = input.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n")
      .trim();
    const body: Record<string, unknown> = {
      model: input.providerModelCode,
      max_tokens: input.maxTokens,
      messages: input.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content
        })),
      stream
    };
    if (system) body.system = system;
    if (input.temperature !== undefined) body.temperature = input.temperature;
    if (input.topP !== undefined) body.top_p = input.topP;
    return body;
  }

  private toUsage(usage: any, input: ProviderCompletionInput, content: string): ProviderTokenUsage {
    const inputTokens = Number(usage?.input_tokens ?? estimateTokens(input.messages.map((message) => message.content).join("\n")));
    const outputTokens = Number(usage?.output_tokens ?? estimateTokens(content));
    return {
      inputTokens,
      outputTokens,
      totalTokens: Number(usage?.total_tokens ?? inputTokens + outputTokens),
      source: usage ? "anthropic" : "estimated",
      estimated: !usage
    };
  }

  private resolveApiKey(provider: ProviderConfig) {
    const apiKey = resolveAnthropicApiKey(provider.credential ?? null);
    if (!apiKey) throw new Error("Anthropic API key is not configured");
    return apiKey;
  }

  private resolveBaseUrl(provider: ProviderConfig) {
    return normalizeAnthropicBaseUrl(provider.credential?.endpointUrl ?? provider.endpoint);
  }

  private resolveHeaders(provider: ProviderConfig, apiKey: string) {
    return anthropicHeaders(apiKey, stringValue(provider.metadata?.anthropic_version ?? provider.credential?.metadata?.anthropic_version));
  }

  private resolveRegion(provider: ProviderConfig) {
    return String(provider.region ?? provider.metadata?.region ?? "global");
  }
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(String(text ?? "").length / 4));
}

function stringValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function redactErrorMessage(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/x-api-key\\s*[:=]\\s*[a-zA-Z0-9._-]+/gi, "x-api-key=[redacted]");
}
