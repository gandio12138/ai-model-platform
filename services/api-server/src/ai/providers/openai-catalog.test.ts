import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpenAiCatalogSyncItems,
  fetchOpenAiOfficialModelMetadata,
  parseOpenAiOfficialModelPage,
  resolveOpenAiCatalogEntry
} from "./openai-catalog.js";

const testConversion = {
  currency: "CNY" as const,
  sourceCurrency: "USD" as const,
  usdToTargetRate: 7.2,
  markupMultiplier: 1.5,
  fxRateSource: "test",
  fxRateFetchedAt: "2026-05-26T00:00:00.000Z"
};

const gpt55Html = `
<html>
<head><title>GPT-5.5 Model | OpenAI API</title><meta name="title" content="GPT-5.5 Model | OpenAI API"></head>
<body>
<div>GPT-5.5</div>
<div>1,050,000<!-- --> context window</div>
<div>128,000<!-- --> max output tokens</div>
<div>Pricing</div>
<div>Text tokens</div>
<div>Per 1M tokens</div>
<div>Input</div><div>$5.00</div>
<div>Cached input</div><div>$0.50</div>
<div>Output</div><div>$30.00</div>
<div>Modalities</div>
<div>Text</div><div>Input and output</div>
<div>Image</div><div>Input only</div>
<div>Features</div>
<div>Streaming</div><div>Supported</div>
<div>Function calling</div><div>Supported</div>
<div>Structured outputs</div><div>Supported</div>
</body>
</html>`;

const gpt55ProHtml = `
<html>
<head><title>GPT-5.5 pro Model | OpenAI API</title></head>
<body>
<div>1,050,000 context window</div>
<div>128,000 max output tokens</div>
<div>Pricing</div>
<div>Input</div><div>$30.00</div>
<div>Output</div><div>$180.00</div>
<div>Modalities</div><div>Text</div><div>Input and output</div><div>Image</div><div>Input only</div>
<div>Features</div>
<div>Streaming</div><div>Not supported</div>
<div>Function calling</div><div>Supported</div>
</body>
</html>`;

function metadataMap() {
  const gpt55 = parseOpenAiOfficialModelPage("gpt-5.5", gpt55Html, "https://developers.openai.com/api/docs/models/gpt-5.5");
  const gpt55Pro = parseOpenAiOfficialModelPage("gpt-5.5-pro", gpt55ProHtml, "https://developers.openai.com/api/docs/models/gpt-5.5-pro");
  assert.ok(gpt55);
  assert.ok(gpt55Pro);
  return new Map([
    ["gpt-5.5", gpt55],
    ["gpt-5.5-pro", gpt55Pro]
  ]);
}

describe("OpenAI API-key driven catalog sync", () => {
  it("parses official model page metadata without hardcoded model tables", () => {
    const metadata = parseOpenAiOfficialModelPage("gpt-5.5", gpt55Html, "https://developers.openai.com/api/docs/models/gpt-5.5");

    assert.equal(metadata?.displayName, "GPT-5.5");
    assert.equal(metadata?.maxContextTokens, 1050000);
    assert.equal(metadata?.defaultMaxOutputTokens, 128000);
    assert.equal(metadata?.inputUsdPer1m, 5);
    assert.equal(metadata?.cachedInputUsdPer1m, 0.5);
    assert.equal(metadata?.outputUsdPer1m, 30);
    assert.deepEqual(metadata?.inputModalities, ["TEXT", "IMAGE"]);
    assert.equal(metadata?.supportsStream, true);
    assert.equal(metadata?.supportsTools, true);
  });

  it("uses only the Provider /models response as the model source", () => {
    const items = buildOpenAiCatalogSyncItems(
      [{ id: "gpt-5.5", owned_by: "openai" }],
      { conversion: testConversion, priceVersion: "test-openai", metadataByModelId: metadataMap() }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["gpt-5.5"]);
    assert.equal(items[0].providerModelCode, "gpt-5.5");
    assert.equal(items[0].displayName, "GPT-5.5");
    assert.equal(items[0].pricing?.inputUsdPer1k, 0.005);
    assert.equal(items[0].pricing?.outputUsdPer1k, 0.03);
    assert.equal(items[0].pricing?.inputPricePer1mCents, 5400);
  });

  it("does not synthesize models that were not returned by the Provider API key", () => {
    const items = buildOpenAiCatalogSyncItems(
      [{ id: "gpt-5.5-pro", owned_by: "openai" }],
      { conversion: testConversion, priceVersion: "test-openai", metadataByModelId: metadataMap() }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["gpt-5.5-pro"]);
    assert.equal(items[0].supportsStream, false);
  });

  it("filters returned models when official metadata is unavailable", () => {
    const items = buildOpenAiCatalogSyncItems(
      [{ id: "gpt-5.5" }, { id: "unknown-private-model" }],
      { conversion: testConversion, priceVersion: "test-openai", metadataByModelId: metadataMap() }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["gpt-5.5"]);
  });

  it("matches snapshot aliases only through fetched base-model metadata", () => {
    assert.equal(resolveOpenAiCatalogEntry("gpt-5.5-2026-04-23", metadataMap())?.id, "gpt-5.5");
  });

  it("deduplicates dated snapshots to the canonical public model code", () => {
    const items = buildOpenAiCatalogSyncItems(
      [
        { id: "gpt-5.5-2026-04-23", owned_by: "openai" },
        { id: "gpt-5.5", owned_by: "openai" }
      ],
      { conversion: testConversion, priceVersion: "test-openai", metadataByModelId: metadataMap() }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["gpt-5.5"]);
    assert.equal(items[0].providerModelCode, "gpt-5.5");
  });

  it("uses the canonical public model code even if only a dated snapshot is listed", () => {
    const items = buildOpenAiCatalogSyncItems(
      [{ id: "gpt-5.5-2026-04-23", owned_by: "openai" }],
      { conversion: testConversion, priceVersion: "test-openai", metadataByModelId: metadataMap() }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["gpt-5.5"]);
    assert.equal(items[0].providerModelCode, "gpt-5.5-2026-04-23");
    assert.equal(items[0].displayName, "GPT-5.5");
  });

  it("fetches official metadata by the actual listed model id", async () => {
    const result = await fetchOpenAiOfficialModelMetadata({
      modelId: "gpt-5.5",
      fetchFn: async () => new Response(gpt55Html, { status: 200 })
    });

    assert.equal(result.modelId, "gpt-5.5");
    assert.equal(result.metadata?.displayName, "GPT-5.5");
  });
});
