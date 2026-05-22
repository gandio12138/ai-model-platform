import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGoogleVertexCatalogSyncItems,
  resolveGoogleVertexModelContext,
  resolveGoogleVertexPricing
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

  it("filters deploy-only models and models without price or context", () => {
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
        }
      ],
      { conversion: testConversion, priceVersion: "test-vertex" }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["gemini-2.5-flash"]);
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
});
