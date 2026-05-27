import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGoogleVertexCatalogSyncItems,
  resolveGoogleVertexModelContext,
  resolveGoogleVertexPricing,
  resolveVertexModelCategory,
  validateGoogleVertexRuntimeModels
} from "./google-vertex-catalog.js";

const testConversion = {
  currency: "CNY" as const,
  sourceCurrency: "USD" as const,
  usdToTargetRate: 7.3,
  markupMultiplier: 1.2,
  fxRateSource: "test",
  fxRateFetchedAt: "2026-05-22T00:00:00.000Z"
};

describe("Google Vertex model catalog parsing", () => {
  it("publishes dynamically discovered Anthropic models with pricing and context", () => {
    const items = buildGoogleVertexCatalogSyncItems(
      [
        {
          region: "global",
          publisher: "anthropic",
          name: "publishers/anthropic/models/claude-opus-4-7",
          versionId: "default",
          launchStage: "GA",
          supportedActions: { openGenerationAiStudio: {}, requestAccess: {} }
        }
      ],
      { conversion: testConversion, priceVersion: "test-vertex" }
    );

    assert.equal(items.length, 1);
    assert.equal(items[0].publicModelCode, "claude-opus-4-7");
    assert.equal(items[0].providerModelCode, "claude-opus-4-7");
    assert.equal(items[0].maxContextTokens, 200000);
    assert.equal(items[0].pricing?.inputUsdPer1k, 0.005);
    assert.equal(items[0].pricing?.outputUsdPer1k, 0.025);
    assert.equal(items[0].raw.source, "google_vertex_ai");
    assert.equal(items[0].raw.model_company, "Anthropic");
  });

  it("uses Vertex versionId instead of hard-coded Claude versions", () => {
    const items = buildGoogleVertexCatalogSyncItems(
      [
        {
          region: "global",
          publisher: "anthropic",
          name: "publishers/anthropic/models/claude-sonnet-4-5",
          versionId: "20259999",
          launchStage: "GA",
          supportedActions: { openGenerationAiStudio: {}, requestAccess: {} }
        }
      ],
      { conversion: testConversion, priceVersion: "test-vertex" }
    );

    assert.equal(items.length, 1);
    assert.equal(items[0].providerModelCode, "claude-sonnet-4-5@20259999");
  });

  it("filters deploy-only or unpriced models and keeps priced contextless models", () => {
    const items = buildGoogleVertexCatalogSyncItems(
      [
        {
          region: "us-central1",
          publisher: "qwen",
          name: "publishers/qwen/models/qwq",
          versionId: "qwq-32b",
          supportedActions: { deploy: {} }
        },
        {
          region: "global",
          publisher: "xai",
          name: "publishers/xai/models/grok-4.20-reasoning",
          versionId: "001",
          supportedActions: {}
        },
        {
          region: "global",
          publisher: "google",
          name: "publishers/google/models/gemini-2.5-flash",
          versionId: "default",
          supportedActions: { openGenerationAiStudio: {} }
        },
        {
          region: "global",
          publisher: "google",
          name: "publishers/google/models/text-embedding-005",
          versionId: "default",
          supportedActions: { openGenerationAiStudio: {} }
        }
      ],
      { conversion: testConversion, priceVersion: "test-vertex" }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["gemini-2.5-flash", "text-embedding-005"]);
    assert.equal(items[1].maxContextTokens, null);
    assert.equal(items[1].raw.model_category, "embedding");
  });

  it("resolves Gemini price and context from catalog rules", () => {
    const price = resolveGoogleVertexPricing("google", "gemini-2.5-pro", {
      region: "global",
      conversion: testConversion,
      priceVersion: "test-vertex"
    });
    const context = resolveGoogleVertexModelContext("google", "gemini-2.5-pro");

    assert.equal(price?.inputUsdPer1k, 0.00125);
    assert.equal(price?.outputUsdPer1k, 0.01);
    assert.equal(context.maxContextTokens, 1048576);
    assert.equal(context.defaultMaxOutputTokens, 65536);
  });

  it("keeps Gemini image and video models in the priced catalog", () => {
    const items = buildGoogleVertexCatalogSyncItems(
      [
        {
          region: "global",
          publisher: "google",
          name: "publishers/google/models/gemini-2.5-flash-image-preview",
          versionId: "default",
          supportedActions: { openGenerationAiStudio: {} }
        },
        {
          region: "global",
          publisher: "google",
          name: "publishers/google/models/gemini-2.5-flash-video-preview",
          versionId: "default",
          supportedActions: { openGenerationAiStudio: {} }
        }
      ],
      { conversion: testConversion, priceVersion: "test-vertex" }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), [
      "gemini-2.5-flash-image-preview",
      "gemini-2.5-flash-video-preview"
    ]);
    assert.equal(items[0].raw.model_category, "image");
    assert.deepEqual(items[0].outputModalities, ["IMAGE"]);
    assert.equal(items[0].raw.runtime_adapter, "gemini_generate_content");
    assert.equal(items[1].raw.model_category, "video");
    assert.deepEqual(items[1].outputModalities, ["VIDEO"]);
    assert.equal(items[1].raw.runtime_adapter, "gemini_generate_content");
  });

  it("classifies Gemini media variants before generic media rules", () => {
    assert.equal(
      resolveVertexModelCategory({
        publisher: "google",
        name: "publishers/google/models/gemini-2.5-flash-image-preview"
      }),
      "image"
    );
    assert.equal(
      resolveVertexModelCategory({
        publisher: "google",
        name: "publishers/google/models/gemini-2.5-flash-video-preview"
      }),
      "video"
    );
  });

  it("classifies Vertex Claude quota errors as quota-limited instead of unavailable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            message:
              "Quota exceeded for aiplatform.googleapis.com/global_online_prediction_requests_per_base_model with base model: anthropic-claude-sonnet-4-5."
          }
        }),
        { status: 429, headers: { "content-type": "application/json" } }
      );
    try {
      const result = await validateGoogleVertexRuntimeModels({
        projectId: "test-project",
        credential: {
          credentialType: "vertex_access_token",
          authMethod: "access_token",
          decryptedSecret: "test-token"
        },
        items: [
          {
            publicModelCode: "claude-sonnet-4-5",
            providerModelCode: "claude-sonnet-4-5@20250929",
            displayName: "Claude Sonnet 4.5",
            providerName: "Anthropic",
            modelFamily: "Anthropic",
            inputModalities: ["TEXT"],
            outputModalities: ["TEXT"],
            inferenceTypesSupported: ["MANAGED_API"],
            supportsStream: true,
            supportsTools: false,
            sourceModelId: "claude-sonnet-4-5",
            invocationType: "vertex_managed_api",
            maxContextTokens: 200000,
            defaultMaxOutputTokens: 8192,
            pricing: null,
            raw: {
              publisher: "anthropic",
              preferred_region: "global",
              runtime_adapter: "anthropic_raw_predict",
              model_category: "text_chat"
            }
          }
        ]
      });
      assert.equal(result.get("claude-sonnet-4-5@20250929")?.status, "quota_limited");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
