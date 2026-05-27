import { HttpException, Injectable } from "@nestjs/common";
import { AnthropicProviderAdapter } from "./anthropic.adapter.js";
import { AwsBedrockProviderAdapter } from "./aws-bedrock.adapter.js";
import { FakeProviderAdapter } from "./fake-provider.adapter.js";
import { GeminiProviderAdapter } from "./gemini.adapter.js";
import { GoogleVertexProviderAdapter } from "./google-vertex.adapter.js";
import { OpenAiProviderAdapter } from "./openai.adapter.js";
import { normalizeAiProviderType } from "./provider-type.js";
import { ProviderAdapter } from "./types.js";

@Injectable()
export class ProviderAdapterRegistry {
  constructor(
    private readonly awsBedrock: AwsBedrockProviderAdapter,
    private readonly googleVertex: GoogleVertexProviderAdapter,
    private readonly openAi: OpenAiProviderAdapter,
    private readonly anthropic: AnthropicProviderAdapter,
    private readonly gemini: GeminiProviderAdapter,
    private readonly fakeProvider: FakeProviderAdapter
  ) {}

  resolve(providerType: string): ProviderAdapter {
    const normalized = normalizeAiProviderType(providerType);
    if (normalized === "aws_bedrock") {
      return this.awsBedrock;
    }
    if (normalized === "google_vertex_ai") {
      return this.googleVertex;
    }
    if (normalized === "openai") {
      return this.openAi;
    }
    if (normalized === "anthropic") {
      return this.anthropic;
    }
    if (normalized === "gemini") {
      return this.gemini;
    }
    if (this.isFakeProviderAllowed()) {
      return this.fakeProvider;
    }
    throw new HttpException(`No production provider adapter is configured for provider type: ${providerType}`, 503);
  }

  isFakeProviderAllowed() {
    return process.env.NODE_ENV !== "production" && process.env.ENABLE_FAKE_PROVIDER !== "false";
  }
}
