import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGeminiCatalogSyncItems,
  canonicalGeminiPublicModelCode,
  fetchGeminiModels,
  parseGeminiOfficialPricingPage
} from "./gemini-catalog.js";

const testConversion = {
  currency: "CNY" as const,
  sourceCurrency: "USD" as const,
  usdToTargetRate: 7.2,
  markupMultiplier: 1.5,
  fxRateSource: "test",
  fxRateFetchedAt: "2026-05-27T00:00:00.000Z"
};

const pricingHtml = `
<div class="models-section">
  <h2 id="gemini-2.5-pro">Gemini 2.5 Pro</h2>
  <code>gemini-2.5-pro</code>
  <h3>Standard</h3>
  <table class="pricing-table">
    <tr><td>Input price</td><td>Free</td><td>$1.25, prompts <= 200k tokens<br>$2.50, prompts > 200k tokens</td></tr>
    <tr><td>Output price</td><td>Free</td><td>$10.00, prompts <= 200k tokens<br>$15.00, prompts > 200k tokens</td></tr>
    <tr><td>Context caching price</td><td>Free</td><td>$0.125, prompts <= 200k tokens</td></tr>
  </table>
</div>
<div class="models-section">
  <h2 id="imagen-4.0-generate-001">Imagen 4 Generate</h2>
  <code>imagen-4.0-generate-001</code>
  <h3>Standard</h3>
  <table class="pricing-table">
    <tr><td>Image output</td><td>$0.04 / image</td></tr>
  </table>
</div>`;

describe("Gemini API-key driven catalog sync", () => {
  it("fetches only models returned by the Gemini API key", async () => {
    const result = await fetchGeminiModels({
      credential: { decryptedSecret: "AIza-test-key" },
      fetchFn: async (url, init) => {
        assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], "AIza-test-key");
        assert.match(String(url), /\/models\?pageSize=1000/u);
        return new Response(JSON.stringify({
          models: [
            {
              name: "models/gemini-2.5-pro",
              displayName: "Gemini 2.5 Pro",
              inputTokenLimit: 1048576,
              outputTokenLimit: 65536,
              supportedGenerationMethods: ["generateContent", "streamGenerateContent"]
            },
            {
              name: "models/private-gemini-test",
              displayName: "Private Gemini Test",
              inputTokenLimit: 8192,
              outputTokenLimit: 1024,
              supportedGenerationMethods: ["generateContent"]
            }
          ]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });

    assert.deepEqual(result.rows.map((model) => model.name), ["gemini-2.5-pro", "private-gemini-test"]);
    assert.equal(result.tokenSource, "provider_credential");
  });

  it("parses official Gemini pricing without a hardcoded model table", () => {
    const entries = parseGeminiOfficialPricingPage(pricingHtml, "https://ai.google.dev/gemini-api/docs/pricing");

    assert.equal(entries.length, 2);
    assert.equal(entries[0].id, "gemini-2.5-pro");
    assert.equal(entries[0].displayName, "Gemini 2.5 Pro");
    assert.equal(entries[0].inputUsdPer1m, 1.25);
    assert.equal(entries[0].outputUsdPer1m, 10);
    assert.equal(entries[0].cacheReadUsdPer1m, 0.125);
    assert.equal(entries[1].billingUnit, "image");
    assert.equal(entries[1].unitUsdPrice, 0.04);
  });

  it("uses Provider models.list as source and skips models missing official price metadata", () => {
    const metadataByModelId = new Map(
      parseGeminiOfficialPricingPage(pricingHtml).map((entry) => [entry.id, entry])
    );
    const items = buildGeminiCatalogSyncItems(
      [
        {
          name: "gemini-2.5-pro",
          displayName: "Gemini 2.5 Pro",
          inputTokenLimit: 1048576,
          outputTokenLimit: 65536,
          supportedGenerationMethods: ["generateContent", "streamGenerateContent"]
        },
        {
          name: "private-gemini-test",
          displayName: "Private Gemini Test",
          inputTokenLimit: 8192,
          outputTokenLimit: 1024,
          supportedGenerationMethods: ["generateContent"]
        }
      ],
      { conversion: testConversion, priceVersion: "test-gemini", metadataByModelId }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["gemini-2.5-pro"]);
    assert.equal(items[0].providerModelCode, "gemini-2.5-pro");
    assert.equal(items[0].maxContextTokens, 1048576);
    assert.equal(items[0].defaultMaxOutputTokens, 65536);
    assert.equal(items[0].pricing?.inputUsdPer1k, 0.00125);
    assert.equal(items[0].pricing?.outputUsdPer1k, 0.01);
    assert.equal(items[0].pricing?.inputPricePer1mCents, 1350);
  });

  it("does not write customer-facing entries when context fields are missing", () => {
    const metadataByModelId = new Map(
      parseGeminiOfficialPricingPage(pricingHtml).map((entry) => [entry.id, entry])
    );
    const items = buildGeminiCatalogSyncItems(
      [
        {
          name: "gemini-2.5-pro",
          displayName: "Gemini 2.5 Pro",
          supportedGenerationMethods: ["generateContent"]
        }
      ],
      { conversion: testConversion, priceVersion: "test-gemini", metadataByModelId }
    );

    assert.equal(items.length, 0);
  });

  it("matches preview snapshots through generic canonical names", () => {
    assert.equal(canonicalGeminiPublicModelCode("models/gemini-2.5-pro-preview-03-25"), "gemini-2.5-pro");
    assert.equal(canonicalGeminiPublicModelCode("gemini-2.5-flash-lite-preview-09-2025"), "gemini-2.5-flash-lite");
    assert.equal(canonicalGeminiPublicModelCode("gemini-2.0-flash-001"), "gemini-2.0-flash");
    assert.equal(canonicalGeminiPublicModelCode("gemini-embedding-001"), "gemini-embedding-001");
  });

  it("deduplicates preview snapshots before writing public model codes", () => {
    const metadataByModelId = new Map(
      parseGeminiOfficialPricingPage(`
        <div class="models-section">
          <h2 id="gemini-2.5-flash-native-audio">Gemini 2.5 Flash Native Audio</h2>
          <code>gemini-2.5-flash-native-audio</code>
          <h3>Standard</h3>
          <table class="pricing-table">
            <tr><td>Input price</td><td>Free</td><td>$0.50</td></tr>
            <tr><td>Output price</td><td>Free</td><td>$2.00</td></tr>
          </table>
        </div>
      `).map((entry) => [entry.id, entry])
    );
    const items = buildGeminiCatalogSyncItems(
      [
        {
          name: "gemini-2.5-flash-native-audio-preview-09-2025",
          inputTokenLimit: 131072,
          outputTokenLimit: 8192,
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "gemini-2.5-flash-native-audio-preview-12-2025",
          inputTokenLimit: 131072,
          outputTokenLimit: 8192,
          supportedGenerationMethods: ["generateContent"]
        }
      ],
      { conversion: testConversion, priceVersion: "test-gemini", metadataByModelId }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["gemini-2.5-flash-native-audio"]);
    assert.equal(items[0].providerModelCode, "gemini-2.5-flash-native-audio-preview-12-2025");
  });
});
