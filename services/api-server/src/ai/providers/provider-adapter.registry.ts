import { HttpException, Injectable } from "@nestjs/common";
import { AwsBedrockProviderAdapter } from "./aws-bedrock.adapter.js";
import { FakeProviderAdapter } from "./fake-provider.adapter.js";
import { GoogleVertexProviderAdapter } from "./google-vertex.adapter.js";
import { ProviderAdapter } from "./types.js";

@Injectable()
export class ProviderAdapterRegistry {
  constructor(
    private readonly awsBedrock: AwsBedrockProviderAdapter,
    private readonly googleVertex: GoogleVertexProviderAdapter,
    private readonly fakeProvider: FakeProviderAdapter
  ) {}

  resolve(providerType: string): ProviderAdapter {
    const normalized = providerType.toLowerCase();
    if (normalized === "aws_bedrock") {
      return this.awsBedrock;
    }
    if (normalized === "google_vertex_ai" || normalized === "vertex_ai") {
      return this.googleVertex;
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
