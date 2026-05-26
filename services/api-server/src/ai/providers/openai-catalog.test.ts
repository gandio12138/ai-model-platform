import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpenAiCatalogSyncItems,
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

describe("OpenAI official catalog sync", () => {
  it("uses the listed OpenAI model id as public and provider model code", () => {
    const items = buildOpenAiCatalogSyncItems(
      [{ id: "gpt-4.1", owned_by: "openai" }],
      { conversion: testConversion, priceVersion: "test-openai" }
    );

    assert.equal(items.length, 1);
    assert.equal(items[0].publicModelCode, "gpt-4.1");
    assert.equal(items[0].providerModelCode, "gpt-4.1");
    assert.equal(items[0].displayName, "GPT-4.1");
    assert.equal(items[0].maxContextTokens, 1047576);
    assert.equal(items[0].defaultMaxOutputTokens, 32768);
    assert.equal(items[0].pricing?.inputUsdPer1k, 0.002);
    assert.equal(items[0].pricing?.outputUsdPer1k, 0.008);
    assert.equal(items[0].pricing?.inputPricePer1mCents, 2160);
    assert.equal(items[0].raw.source, "openai");
  });

  it("matches official snapshot aliases by a generic dated suffix rule", () => {
    assert.equal(resolveOpenAiCatalogEntry("gpt-4.1-2025-04-14")?.id, "gpt-4.1");
    const items = buildOpenAiCatalogSyncItems(
      [{ id: "gpt-5-2025-08-07", owned_by: "openai" }],
      { conversion: testConversion, priceVersion: "test-openai" }
    );

    assert.equal(items.length, 1);
    assert.equal(items[0].publicModelCode, "gpt-5-2025-08-07");
    assert.equal(items[0].providerModelCode, "gpt-5-2025-08-07");
    assert.equal(items[0].maxContextTokens, 400000);
  });

  it("filters models that do not have official chat pricing and context metadata", () => {
    const items = buildOpenAiCatalogSyncItems(
      [
        { id: "whisper-1" },
        { id: "text-embedding-3-small" },
        { id: "gpt-4o-mini" }
      ],
      { conversion: testConversion, priceVersion: "test-openai" }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["gpt-4o-mini"]);
  });
});
