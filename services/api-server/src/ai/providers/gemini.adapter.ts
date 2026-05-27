import { Injectable } from "@nestjs/common";
import {
  geminiHeaders,
  normalizeGeminiBaseUrl,
  resolveGeminiApiKey
} from "./gemini-catalog.js";
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
export class GeminiProviderAdapter implements ProviderAdapter {
  readonly type = "gemini";

  async complete(provider: ProviderConfig, input: ProviderCompletionInput): Promise<ProviderCompletionResult> {
    const started = Date.now();
    const response = await this.geminiFetch(provider, this.modelActionPath(input.providerModelCode, "generateContent"), {
      method: "POST",
      body: JSON.stringify(this.buildGenerateContentBody(input))
    });
    const text = textFromGeminiResponse(response);
    return {
      content: text,
      finishReason: response.candidates?.[0]?.finishReason ?? null,
      providerRequestId: response.responseId ?? response.__requestId ?? null,
      usage: this.toUsage(response.usageMetadata, input, text),
      metadata: { latency_ms: Date.now() - started }
    };
  }

  async *stream(provider: ProviderConfig, input: ProviderCompletionInput): AsyncIterable<ProviderStreamChunk> {
    const apiKey = this.resolveApiKey(provider);
    const response = await fetch(
      `${this.resolveBaseUrl(provider)}${this.modelActionPath(input.providerModelCode, "streamGenerateContent")}?alt=sse`,
      {
        method: "POST",
        headers: this.resolveHeaders(apiKey),
        body: JSON.stringify(this.buildGenerateContentBody(input)),
        signal: AbortSignal.timeout(Number(provider.timeoutMs ?? 120000))
      }
    );
    if (!response.ok || !response.body) {
      const json = (await response.json().catch(() => ({}))) as any;
      throw new Error(`Gemini stream request failed: ${response.status} ${json.error?.message ?? response.statusText}`);
    }
    const providerRequestId = response.headers.get("x-request-id") ?? null;
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
        const delta = textFromGeminiResponse(json);
        if (delta) {
          content += delta;
          yield { delta, providerRequestId: json.responseId ?? providerRequestId };
        }
        if (json.candidates?.[0]?.finishReason) finishReason = String(json.candidates[0].finishReason);
        if (json.usageMetadata) usage = this.toUsage(json.usageMetadata, input, content);
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
        await this.geminiFetch(input.provider, "/models?pageSize=1", { method: "GET" });
        return {
          ok: true,
          providerType: this.type,
          region: this.resolveRegion(input.provider),
          credentialValid: true,
          regionAccessible: true,
          modelCallable: false,
          latencyMs: Date.now() - started,
          message: "Gemini API Key 有效。填写模型 ID 后可验证真实调用。",
          checkedAt: new Date().toISOString()
        };
      }
      await this.complete(input.provider, {
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
        region: this.resolveRegion(input.provider),
        credentialValid: true,
        regionAccessible: true,
        modelCallable: true,
        latencyMs: Date.now() - started,
        message: "Gemini Provider 连接测试通过。",
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
        message: "Gemini Provider 连接测试失败。",
        errorCode: error instanceof Error ? error.name : "Error",
        errorMessage: redactErrorMessage(error),
        checkedAt: new Date().toISOString()
      };
    }
  }

  private async geminiFetch(provider: ProviderConfig, path: string, init: RequestInit) {
    const apiKey = this.resolveApiKey(provider);
    const response = await fetch(`${this.resolveBaseUrl(provider)}${path}`, {
      ...init,
      headers: {
        ...this.resolveHeaders(apiKey),
        ...(init.headers as Record<string, string> | undefined)
      },
      signal: init.signal ?? AbortSignal.timeout(Number(provider.timeoutMs ?? 60000))
    });
    const json = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || json.error) {
      throw new Error(`Gemini request failed: ${response.status} ${json.error?.message ?? response.statusText}`);
    }
    json.__requestId = response.headers.get("x-request-id") ?? null;
    return json;
  }

  private buildGenerateContentBody(input: ProviderCompletionInput) {
    if ((input as any).tools?.length) {
      throw new Error("Gemini tool calling is not implemented in this provider adapter");
    }
    const systemText = input.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n")
      .trim();
    const body: Record<string, unknown> = {
      contents: input.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }]
        })),
      generationConfig: {
        maxOutputTokens: input.maxTokens,
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.topP !== undefined ? { topP: input.topP } : {})
      }
    };
    if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
    return body;
  }

  private modelActionPath(modelId: string, action: "generateContent" | "streamGenerateContent") {
    return `/models/${encodeURIComponent(String(modelId ?? "").replace(/^models\//u, "").trim())}:${action}`;
  }

  private toUsage(usage: any, input: ProviderCompletionInput, content: string): ProviderTokenUsage {
    const inputTokens = Number(usage?.promptTokenCount ?? estimateTokens(input.messages.map((message) => message.content).join("\n")));
    const outputTokens = Number(usage?.candidatesTokenCount ?? estimateTokens(content));
    return {
      inputTokens,
      outputTokens,
      totalTokens: Number(usage?.totalTokenCount ?? inputTokens + outputTokens),
      source: usage ? "gemini" : "estimated",
      estimated: !usage
    };
  }

  private resolveApiKey(provider: ProviderConfig) {
    const apiKey = resolveGeminiApiKey(provider.credential ?? null);
    if (!apiKey) throw new Error("Gemini API key is not configured");
    return apiKey;
  }

  private resolveBaseUrl(provider: ProviderConfig) {
    return normalizeGeminiBaseUrl(provider.credential?.endpointUrl ?? provider.endpoint);
  }

  private resolveHeaders(apiKey: string) {
    return geminiHeaders(apiKey);
  }

  private resolveRegion(provider: ProviderConfig) {
    return String(provider.region ?? provider.metadata?.region ?? "global");
  }
}

function textFromGeminiResponse(response: any) {
  const parts = response?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.map((part) => String(part.text ?? "")).join("") : "";
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(String(text ?? "").length / 4));
}

function redactErrorMessage(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/AIza[0-9A-Za-z_-]+/g, "[redacted]")
    .replace(/x-goog-api-key\s*[:=]\s*[a-zA-Z0-9._-]+/gi, "x-goog-api-key=[redacted]");
}

