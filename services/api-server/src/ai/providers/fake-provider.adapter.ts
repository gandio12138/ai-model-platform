import { Injectable } from "@nestjs/common";
import {
  ProviderAdapter,
  ProviderCompletionInput,
  ProviderCompletionResult,
  ProviderConfig,
  ProviderHealthCheckInput,
  ProviderHealthCheckResult,
  ProviderStreamChunk
} from "./types.js";

@Injectable()
export class FakeProviderAdapter implements ProviderAdapter {
  readonly type = "fake_provider";

  async complete(_provider: ProviderConfig, input: ProviderCompletionInput): Promise<ProviderCompletionResult> {
    const content = this.fakeCompletion(input.publicModelCode, input.messages);
    const inputTokens = estimateTokens(input.messages.map((message) => message.content).join("\n"));
    const outputTokens = Math.min(estimateTokens(content), input.maxTokens);
    return {
      content,
      finishReason: "stop",
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        source: "fake_provider"
      },
      metadata: {
        adapter: "fake_provider"
      }
    };
  }

  async *stream(provider: ProviderConfig, input: ProviderCompletionInput): AsyncIterable<ProviderStreamChunk> {
    const result = await this.complete(provider, input);
    for (let i = 0; i < result.content.length; i += 24) {
      yield { delta: result.content.slice(i, i + 24) };
    }
    yield {
      done: true,
      finishReason: result.finishReason,
      usage: result.usage,
      providerRequestId: result.providerRequestId
    };
  }

  async validateCredentials(input: ProviderHealthCheckInput): Promise<ProviderHealthCheckResult> {
    return {
      ok: true,
      providerType: input.provider.providerType,
      region: input.provider.region ?? null,
      credentialValid: true,
      regionAccessible: true,
      modelCallable: true,
      latencyMs: 0,
      message: "Fake provider is available for development and test only.",
      checkedAt: new Date().toISOString()
    };
  }

  private fakeCompletion(model: string, messages: ProviderCompletionInput["messages"]) {
    const last = messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
    return [
      `这是 OneToken 开发/测试环境的模型回复，模型 ${model} 已收到你的请求。`,
      `问题摘要：${last.slice(0, 120) || "空消息"}`,
      "生产环境必须配置真实 Provider Adapter 和密钥后才能处理真实模型调用。"
    ].join("\n");
  }
}

function estimateTokens(content: string) {
  return Math.max(Math.ceil(content.length / 3.6), 1);
}
