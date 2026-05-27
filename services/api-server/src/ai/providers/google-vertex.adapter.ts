import { Injectable } from "@nestjs/common";
import { resolveGoogleVertexAccessToken } from "./google-vertex-auth.js";
import {
  ProviderAdapter,
  ProviderChatMessage,
  ProviderCompletionInput,
  ProviderCompletionResult,
  ProviderConfig,
  ProviderHealthCheckInput,
  ProviderHealthCheckResult,
  ProviderImageGenerationInput,
  ProviderImageGenerationResult,
  ProviderStreamChunk,
  ProviderTokenUsage,
  ProviderVideoGenerationInput,
  ProviderVideoGenerationResult
} from "./types.js";

@Injectable()
export class GoogleVertexProviderAdapter implements ProviderAdapter {
  readonly type = "google_vertex_ai";

  async complete(provider: ProviderConfig, input: ProviderCompletionInput): Promise<ProviderCompletionResult> {
    const runtime = this.resolveRuntime(provider, input.providerModelCode);
    if (runtime.publisher === "google") {
      return this.completeGemini(provider, input, runtime);
    }
    if (runtime.publisher === "anthropic") {
      return this.completeAnthropic(provider, input, runtime);
    }
    if (runtime.publisher === "mistralai") {
      return this.completeMistral(provider, input, runtime);
    }
    throw new Error(`Google Vertex runtime is not implemented for publisher: ${runtime.publisher}`);
  }

  async *stream(provider: ProviderConfig, input: ProviderCompletionInput): AsyncIterable<ProviderStreamChunk> {
    const result = await this.complete(provider, input);
    for (let i = 0; i < result.content.length; i += 24) {
      yield { delta: result.content.slice(i, i + 24), providerRequestId: result.providerRequestId };
    }
    yield {
      done: true,
      finishReason: result.finishReason,
      usage: result.usage,
      providerRequestId: result.providerRequestId
    };
  }

  async validateCredentials(input: ProviderHealthCheckInput): Promise<ProviderHealthCheckResult> {
    const started = Date.now();
    try {
      const modelId = String(input.modelId ?? input.provider.metadata?.health_check_model_id ?? "").trim();
      await resolveGoogleVertexAccessToken(input.provider.credential ?? null);
      if (!modelId) {
        return {
          ok: true,
          providerType: this.type,
          region: this.resolveRegion(input.provider),
          credentialValid: true,
          regionAccessible: true,
          modelCallable: false,
          latencyMs: Date.now() - started,
          message: "Google Vertex AI 凭证有效。填写模型 ID 后可验证真实调用。",
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
        message: "Google Vertex AI 连接测试通过。",
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
        message: "Google Vertex AI 连接测试失败。",
        errorCode: errorName(error),
        errorMessage: redactErrorMessage(error),
        checkedAt: new Date().toISOString()
      };
    }
  }

  async generateImage(
    provider: ProviderConfig,
    input: ProviderImageGenerationInput
  ): Promise<ProviderImageGenerationResult> {
    const started = Date.now();
    const runtime = this.resolveRuntime(provider, input.providerModelCode);
    if (runtime.publisher !== "google") {
      throw new Error("Google Vertex image generation is only implemented for Google publisher models");
    }
    if (runtime.adapter === "gemini_generate_content") {
      const response = await this.vertexFetch(provider, runtime, "generateContent", {
        contents: [
          {
            role: "user",
            parts: [{ text: input.prompt }]
          }
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"]
        }
      });
      const images = extractGeminiImages(response).slice(0, input.n);
      if (!images.length) {
        throw new Error("Google Vertex image generation returned no image data");
      }
      return {
        images,
        providerRequestId: response.__requestId ?? null,
        usage: {
          inputTokens: Number(response.usageMetadata?.promptTokenCount ?? estimateTokens(input.prompt)),
          outputTokens: images.length,
          totalTokens: Number(response.usageMetadata?.totalTokenCount ?? estimateTokens(input.prompt) + images.length),
          source: response.usageMetadata ? "vertex_ai" : "estimated",
          estimated: !response.usageMetadata
        },
        metadata: { latency_ms: Date.now() - started, provider_runtime: runtime.adapter }
      };
    }

    if (runtime.adapter === "vertex_predict_image") {
      const response = await this.vertexFetch(provider, runtime, "predict", {
        instances: [{ prompt: input.prompt }],
        parameters: {
          sampleCount: input.n,
          aspectRatio: input.aspectRatio ?? aspectRatioFromSize(input.size),
          personGeneration: provider.metadata?.person_generation ?? "allow_adult"
        }
      });
      const images = extractPredictImages(response).slice(0, input.n);
      if (!images.length) {
        throw new Error("Google Vertex image prediction returned no image data");
      }
      return {
        images,
        providerRequestId: response.__requestId ?? null,
        usage: {
          inputTokens: estimateTokens(input.prompt),
          outputTokens: images.length,
          totalTokens: estimateTokens(input.prompt) + images.length,
          source: "estimated",
          estimated: true
        },
        metadata: { latency_ms: Date.now() - started, provider_runtime: runtime.adapter }
      };
    }

    throw new Error(`Google Vertex image runtime is not implemented: ${runtime.adapter}`);
  }

  async generateVideo(
    provider: ProviderConfig,
    input: ProviderVideoGenerationInput
  ): Promise<ProviderVideoGenerationResult> {
    const started = Date.now();
    const runtime = this.resolveRuntime(provider, input.providerModelCode);
    if (runtime.publisher !== "google" || runtime.adapter !== "vertex_predict_video") {
      throw new Error(`Google Vertex video runtime is not implemented: ${runtime.publisher}/${runtime.adapter}`);
    }
    const parameters: Record<string, unknown> = {
      sampleCount: input.n,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio ?? "16:9",
      personGeneration: provider.metadata?.person_generation ?? "allow_adult"
    };
    if (input.outputGcsUri) {
      parameters.storageUri = input.outputGcsUri;
    }
    const response = await this.vertexFetch(provider, runtime, "predictLongRunning", {
      instances: [{ prompt: input.prompt }],
      parameters
    });
    const operationName = String(response.name ?? "");
    if (!operationName) {
      throw new Error("Google Vertex video generation did not return an operation name");
    }
    return {
      operationName,
      status: "submitted",
      providerRequestId: response.__requestId ?? null,
      usage: {
        inputTokens: estimateTokens(input.prompt),
        outputTokens: input.n * input.durationSeconds,
        totalTokens: estimateTokens(input.prompt) + input.n * input.durationSeconds,
        source: "estimated",
        estimated: true
      },
      metadata: {
        latency_ms: Date.now() - started,
        provider_runtime: runtime.adapter,
        operation_name: operationName
      }
    };
  }

  private async completeGemini(
    provider: ProviderConfig,
    input: ProviderCompletionInput,
    runtime: VertexRuntime
  ): Promise<ProviderCompletionResult> {
    const started = Date.now();
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: input.maxTokens,
      temperature: input.temperature,
      topP: input.topP
    };
    const thinkingBudget = geminiThinkingBudget(provider, runtime.providerModelCode);
    if (thinkingBudget !== null) {
      generationConfig.thinkingConfig = { thinkingBudget };
    }
    const response = await this.vertexFetch(provider, runtime, "generateContent", {
      contents: input.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }]
        })),
      systemInstruction: systemInstruction(input.messages),
      generationConfig
    });
    const text = response.candidates?.[0]?.content?.parts
      ?.map((part: any) => part.text ?? "")
      .join("") ?? "";
    return {
      content: text,
      finishReason: response.candidates?.[0]?.finishReason ?? null,
      providerRequestId: response.__requestId ?? null,
      usage: {
        inputTokens: Number(response.usageMetadata?.promptTokenCount ?? estimateTokens(input.messages.map((item) => item.content).join("\n"))),
        outputTokens: Number(response.usageMetadata?.candidatesTokenCount ?? estimateTokens(text)),
        totalTokens: Number(response.usageMetadata?.totalTokenCount ?? 0) || estimateTokens(`${input.messages.map((item) => item.content).join("\n")}\n${text}`),
        source: response.usageMetadata ? "vertex_ai" : "estimated",
        estimated: !response.usageMetadata
      } as ProviderTokenUsage,
      metadata: { latency_ms: Date.now() - started, provider_runtime: runtime.publisher }
    };
  }

  private async completeAnthropic(
    provider: ProviderConfig,
    input: ProviderCompletionInput,
    runtime: VertexRuntime
  ): Promise<ProviderCompletionResult> {
    const started = Date.now();
    const response = await this.vertexFetch(provider, runtime, "rawPredict", {
      anthropic_version: "vertex-2023-10-16",
      system: input.messages.find((message) => message.role === "system")?.content,
      messages: input.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: message.role, content: message.content })),
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      top_p: input.topP
    });
    const text = Array.isArray(response.content)
      ? response.content.map((item: any) => item.text ?? "").join("")
      : String(response.completion ?? response.output ?? "");
    const inputTokens = Number(response.usage?.input_tokens ?? estimateTokens(input.messages.map((item) => item.content).join("\n")));
    const outputTokens = Number(response.usage?.output_tokens ?? estimateTokens(text));
    return {
      content: text,
      finishReason: response.stop_reason ?? null,
      providerRequestId: response.id ?? response.__requestId ?? null,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        source: response.usage ? "vertex_ai" : "estimated",
        estimated: !response.usage
      } as ProviderTokenUsage,
      metadata: { latency_ms: Date.now() - started, provider_runtime: runtime.publisher }
    };
  }

  private async completeMistral(
    provider: ProviderConfig,
    input: ProviderCompletionInput,
    runtime: VertexRuntime
  ): Promise<ProviderCompletionResult> {
    const started = Date.now();
    const response = await this.vertexFetch(provider, runtime, "rawPredict", {
      messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      top_p: input.topP
    });
    const choice = response.choices?.[0] ?? {};
    const text = String(choice.message?.content ?? choice.text ?? "");
    const inputTokens = Number(response.usage?.prompt_tokens ?? estimateTokens(input.messages.map((item) => item.content).join("\n")));
    const outputTokens = Number(response.usage?.completion_tokens ?? estimateTokens(text));
    return {
      content: text,
      finishReason: choice.finish_reason ?? null,
      providerRequestId: response.id ?? response.__requestId ?? null,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: Number(response.usage?.total_tokens ?? inputTokens + outputTokens),
        source: response.usage ? "vertex_ai" : "estimated",
        estimated: !response.usage
      } as ProviderTokenUsage,
      metadata: { latency_ms: Date.now() - started, provider_runtime: runtime.publisher }
    };
  }

  private async vertexFetch(
    provider: ProviderConfig,
    runtime: VertexRuntime,
    method: "generateContent" | "rawPredict" | "predict" | "predictLongRunning",
    body: Record<string, unknown>
  ) {
    const token = await resolveGoogleVertexAccessToken(provider.credential ?? null);
    const url = this.buildVertexUrl(provider, runtime, method);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        "content-type": "application/json",
        "x-goog-user-project": this.resolveProjectId(provider)
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Number(provider.timeoutMs ?? 60000))
    });
    const json = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || json.error) {
      throw new Error(`Google Vertex request failed: ${response.status} ${json.error?.message ?? response.statusText}`);
    }
    json.__requestId = response.headers.get("x-request-id") ?? response.headers.get("x-goog-request-id") ?? null;
    return json;
  }

  private buildVertexUrl(provider: ProviderConfig, runtime: VertexRuntime, method: string) {
    const projectId = this.resolveProjectId(provider);
    const location = runtime.location;
    const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
    const model = encodeURIComponent(runtime.providerModelCode);
    return `https://${host}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/${runtime.publisher}/models/${model}:${method}`;
  }

  private resolveRuntime(provider: ProviderConfig, providerModelCode: string): VertexRuntime {
    const metadata = provider.metadata ?? {};
    const publisher = String(metadata.publisher ?? metadata.vertex_publisher ?? inferPublisher(providerModelCode)).toLowerCase();
    const location = String(metadata.location ?? metadata.vertex_location ?? metadata.preferred_region ?? provider.region ?? "global");
    const adapter = String(metadata.runtime_adapter ?? inferRuntimeAdapter(publisher, providerModelCode)).toLowerCase();
    return { publisher, location, providerModelCode, adapter };
  }

  private resolveProjectId(provider: ProviderConfig) {
    const projectId = String(provider.metadata?.project_id ?? provider.metadata?.gcp_project_id ?? process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? "").trim();
    if (!projectId) throw new Error("Google Vertex GCP project id is not configured");
    return projectId;
  }

  private resolveRegion(provider: ProviderConfig) {
    return String(provider.metadata?.location ?? provider.metadata?.vertex_location ?? provider.region ?? "global");
  }
}

interface VertexRuntime {
  publisher: string;
  location: string;
  providerModelCode: string;
  adapter: string;
}

function systemInstruction(messages: ProviderChatMessage[]) {
  const text = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  return text ? { role: "system", parts: [{ text }] } : undefined;
}

function inferPublisher(providerModelCode: string) {
  const code = providerModelCode.toLowerCase();
  if (code.startsWith("claude-")) return "anthropic";
  if (code.startsWith("mistral-") || code.startsWith("codestral-")) return "mistralai";
  return "google";
}

function inferRuntimeAdapter(publisher: string, providerModelCode: string) {
  const code = providerModelCode.toLowerCase();
  if (publisher === "google" && (/imagen|imagegeneration|image-|virtual-try-on/.test(code))) return "vertex_predict_image";
  if (publisher === "google" && (/veo|video/.test(code))) return "vertex_predict_video";
  if (publisher === "google") return "gemini_generate_content";
  if (publisher === "anthropic" || publisher === "mistralai") return "rawPredict";
  return "unsupported";
}

function geminiThinkingBudget(provider: ProviderConfig, providerModelCode: string) {
  const configured = provider.metadata?.thinking_budget ?? provider.metadata?.gemini_thinking_budget;
  if (configured !== undefined && configured !== null && configured !== "") {
    const value = Number(configured);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function extractGeminiImages(response: any): ProviderImageGenerationResult["images"] {
  const parts = response.candidates?.flatMap((candidate: any) => candidate.content?.parts ?? []) ?? [];
  return parts
    .map((part: any) => ({
      b64Json: part.inlineData?.data ?? part.inline_data?.data ?? null,
      mimeType: part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? part.inline_data?.mimeType ?? "image/png",
      revisedPrompt: part.text ?? null
    }))
    .filter((item: any) => item.b64Json);
}

function extractPredictImages(response: any): ProviderImageGenerationResult["images"] {
  const predictions = Array.isArray(response.predictions) ? response.predictions : [];
  return predictions
    .map((prediction: any) => ({
      b64Json: prediction.bytesBase64Encoded ?? prediction.image?.bytesBase64Encoded ?? null,
      url: prediction.gcsUri ?? prediction.image?.gcsUri ?? null,
      mimeType: prediction.mimeType ?? prediction.image?.mimeType ?? "image/png",
      revisedPrompt: prediction.prompt ?? prediction.revisedPrompt ?? null
    }))
    .filter((item: any) => item.b64Json || item.url);
}

function aspectRatioFromSize(size?: string | null) {
  if (!size) return "1:1";
  const match = /^(\d+)x(\d+)$/u.exec(size.trim());
  if (!match) return size;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return "1:1";
  if (Math.abs(width / height - 1) < 0.05) return "1:1";
  return width > height ? "16:9" : "9:16";
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "Error";
}

function redactErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer ***")
    .replace(/ya29\.[A-Za-z0-9._~+/=-]+/g, "ya29.***")
    .replace(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/g, "-----BEGIN PRIVATE KEY-----***-----END PRIVATE KEY-----");
}
