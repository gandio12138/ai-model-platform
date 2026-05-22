import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAwsBedrockPriceCatalogFromOfferPayloads,
  canonicalAwsBedrockModelKey,
  resolveAwsBedrockModelContext,
  resolveAwsBedrockPricing
} from "./aws-bedrock-catalog.js";

function tokenProduct(input: {
  sku: string;
  model?: string;
  serviceName?: string;
  provider?: string;
  usageType: string;
  inferenceType?: string;
  unit?: "1K tokens" | "Units";
  usd: number;
}) {
  return {
    product: {
      attributes: {
        regionCode: "us-east-1",
        usagetype: input.usageType,
        ...(input.model ? { model: input.model } : {}),
        ...(input.serviceName ? { servicename: input.serviceName } : {}),
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.inferenceType ? { inferenceType: input.inferenceType } : {})
      }
    },
    terms: {
      offerTermCode: {
        priceDimensions: {
          dimension: {
            unit: input.unit ?? "1K tokens",
            description: `${input.usageType} token usage`,
            pricePerUnit: { USD: String(input.usd) }
          }
        }
      }
    }
  };
}

function priceCatalog(...items: ReturnType<typeof tokenProduct>[]) {
  const products: Record<string, unknown> = {};
  const terms: Record<string, unknown> = {};
  for (const [index, item] of items.entries()) {
    const sku = `sku_${index}`;
    products[sku] = item.product;
    terms[sku] = item.terms;
  }
  return buildAwsBedrockPriceCatalogFromOfferPayloads(
    "us-east-1",
    [
      {
        offerCode: "AmazonBedrockFoundationModels",
        payload: {
          publicationDate: "2026-05-22T00:00:00Z",
          products,
          terms: { OnDemand: terms }
        }
      }
    ],
    {
      currency: "CNY",
      sourceCurrency: "USD",
      usdToTargetRate: 7.1,
      markupMultiplier: 1.2,
      fxRateSource: "test",
      fxRateFetchedAt: "2026-05-22T00:00:00.000Z"
    }
  );
}

describe("AWS Bedrock price catalog parsing", () => {
  it("resolves Marketplace Claude models priced with Units and input_tokens usage types", () => {
    const catalog = priceCatalog(
      tokenProduct({
        sku: "claude-opus-47-input",
        provider: "Anthropic",
        model: "Claude Opus 4.7",
        usageType: "USE1-MP:USE1_input_tokens_standard-Units",
        unit: "Units",
        usd: 15
      }),
      tokenProduct({
        sku: "claude-opus-47-output",
        provider: "Anthropic",
        model: "Claude Opus 4.7",
        usageType: "USE1-MP:USE1_output_tokens_standard-Units",
        unit: "Units",
        usd: 75
      })
    );

    const pricing = resolveAwsBedrockPricing(catalog, {
      providerName: "Anthropic",
      displayName: "Claude Opus 4.7",
      modelId: "anthropic.claude-opus-4-7"
    });

    assert.equal(pricing?.sourceModelName, "Claude Opus 4.7");
    assert.equal(pricing?.inputUsdPer1k, 0.015);
    assert.equal(pricing?.outputUsdPer1k, 0.075);
  });

  it("resolves Cohere service names whose display name omits the provider", () => {
    const catalog = priceCatalog(
      tokenProduct({
        sku: "cohere-command-r-plus-input",
        serviceName: "Cohere Command R+ (Amazon Bedrock Edition)",
        usageType: "USE1-InputTokenCount",
        inferenceType: "Input tokens",
        usd: 0.003
      }),
      tokenProduct({
        sku: "cohere-command-r-plus-output",
        serviceName: "Cohere Command R+ (Amazon Bedrock Edition)",
        usageType: "USE1-OutputTokenCount",
        inferenceType: "Output tokens",
        usd: 0.015
      })
    );

    const pricing = resolveAwsBedrockPricing(catalog, {
      providerName: "Cohere",
      displayName: "Command R+",
      modelId: "cohere.command-r-plus-v1:0"
    });

    assert.equal(pricing?.sourceProviderName, "Cohere");
    assert.equal(pricing?.inputUsdPer1k, 0.003);
    assert.equal(pricing?.outputUsdPer1k, 0.015);
  });

  it("resolves Mistral AI models from model ids embedded in usageType", () => {
    const catalog = priceCatalog(
      tokenProduct({
        sku: "mistral-voxtral-input",
        provider: "Mistral",
        model: "Voxtral Mini 1.0",
        usageType: "USE1-mistral.voxtral-mini-3b-2507-mantle-input-tokens-standard",
        usd: 0.0001
      }),
      tokenProduct({
        sku: "mistral-voxtral-output",
        provider: "Mistral",
        model: "Voxtral Mini 1.0",
        usageType: "USE1-mistral.voxtral-mini-3b-2507-mantle-output-tokens-standard",
        usd: 0.0003
      })
    );

    const pricing = resolveAwsBedrockPricing(catalog, {
      providerName: "Mistral AI",
      displayName: "Voxtral Mini 3B 2507",
      modelId: "mistral.voxtral-mini-3b-2507"
    });

    assert.equal(pricing?.sourceModelName, "Voxtral Mini 1.0");
    assert.equal(pricing?.inputUsdPer1k, 0.0001);
    assert.equal(pricing?.outputUsdPer1k, 0.0003);
  });

  it("resolves legacy display names with version parentheticals", () => {
    const catalog = priceCatalog(
      tokenProduct({
        sku: "mistral-large-input",
        provider: "Mistral",
        model: "Mistral Large",
        usageType: "USE1-InputTokenCount",
        inferenceType: "Input tokens",
        usd: 0.004
      }),
      tokenProduct({
        sku: "mistral-large-output",
        provider: "Mistral",
        model: "Mistral Large",
        usageType: "USE1-OutputTokenCount",
        inferenceType: "Output tokens",
        usd: 0.012
      })
    );

    const pricing = resolveAwsBedrockPricing(catalog, {
      providerName: "Mistral AI",
      displayName: "Mistral Large (24.02)",
      modelId: "mistral.mistral-large-2402-v1:0"
    });

    assert.equal(pricing?.sourceModelName, "Mistral Large");
    assert.equal(pricing?.inputUsdPer1k, 0.004);
    assert.equal(pricing?.outputUsdPer1k, 0.012);
  });

  it("does not treat rerank models as chat models with default context", () => {
    const context = resolveAwsBedrockModelContext({
      providerName: "Cohere",
      displayName: "Rerank 3.5",
      modelId: "cohere.rerank-v3-5:0",
      outputModalities: ["TEXT"]
    });

    assert.equal(context.maxContextTokens, null);
    assert.equal(context.defaultMaxOutputTokens, null);
    assert.equal(context.contextSource, "admin_required");
  });

  it("normalizes AWS and Vertex Anthropic model ids to the same canonical key", () => {
    assert.equal(
      canonicalAwsBedrockModelKey({
        providerName: "Anthropic",
        displayName: "Claude Opus 4.7",
        modelId: "anthropic.claude-opus-4-7"
      }),
      "claude-opus-4-7"
    );
    assert.equal(
      canonicalAwsBedrockModelKey({
        providerName: "Anthropic",
        displayName: "Claude Opus 4.5",
        modelId: "anthropic.claude-opus-4-5-20251101-v1:0"
      }),
      "claude-opus-4-5"
    );
  });
});
