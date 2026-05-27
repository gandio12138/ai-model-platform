import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAnthropicCatalogSyncItems,
  buildAnthropicMetadataMap,
  fetchAnthropicModels,
  parseAnthropicOfficialModelOverview,
  resolveAnthropicCatalogEntry
} from "./anthropic-catalog.js";

const testConversion = {
  currency: "CNY" as const,
  sourceCurrency: "USD" as const,
  usdToTargetRate: 7.2,
  markupMultiplier: 1.5,
  fxRateSource: "test",
  fxRateFetchedAt: "2026-05-27T00:00:00.000Z"
};

const overviewHtml = `
<table>
  <thead>
    <tr>
      <th></th>
      <th>Claude Opus 4.7</th>
      <th>Claude Sonnet 4.6</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Claude API ID</strong></td>
      <td><span>claude-opus-4-7</span></td>
      <td><span>claude-sonnet-4-6</span></td>
    </tr>
    <tr>
      <td><strong>Claude API alias</strong></td>
      <td><span>claude-opus-4-7</span></td>
      <td><span>claude-sonnet-4-6</span></td>
    </tr>
    <tr>
      <td><strong>Pricing</strong></td>
      <td>$5 / input MTok<br/>$25 / output MTok</td>
      <td>$3 / input MTok<br/>$15 / output MTok</td>
    </tr>
    <tr>
      <td><strong>Context window</strong></td>
      <td>1M tokens</td>
      <td>1M tokens</td>
    </tr>
    <tr>
      <td><strong>Max output</strong></td>
      <td>128k tokens</td>
      <td>64k tokens</td>
    </tr>
  </tbody>
</table>`;

function metadataMap() {
  return buildAnthropicMetadataMap(
    parseAnthropicOfficialModelOverview(overviewHtml, "https://docs.anthropic.com/en/docs/about-claude/models/overview")
  );
}

describe("Anthropic API-key driven catalog sync", () => {
  it("fetches only models returned by the Anthropic API key", async () => {
    const result = await fetchAnthropicModels({
      credential: { decryptedSecret: "sk-ant-test" },
      fetchFn: async (url, init) => {
        assert.equal((init?.headers as Record<string, string>)["x-api-key"], "sk-ant-test");
        assert.match(String(url), /\/models\?limit=1000/u);
        return new Response(JSON.stringify({
          data: [
            { id: "claude-sonnet-4-6", type: "model" },
            { id: "unknown-private-claude", type: "model" }
          ],
          has_more: false,
          last_id: null,
          first_id: "claude-sonnet-4-6"
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });

    assert.deepEqual(result.rows.map((model) => model.id), ["claude-sonnet-4-6", "unknown-private-claude"]);
    assert.equal(result.tokenSource, "provider_credential");
  });

  it("parses official model docs for price and context metadata", () => {
    const entries = parseAnthropicOfficialModelOverview(overviewHtml, "https://docs.anthropic.com/en/docs/about-claude/models/overview");

    assert.equal(entries.length, 2);
    assert.equal(entries[0].id, "claude-opus-4-7");
    assert.equal(entries[0].displayName, "Claude Opus 4.7");
    assert.equal(entries[0].inputUsdPer1m, 5);
    assert.equal(entries[0].outputUsdPer1m, 25);
    assert.equal(entries[0].maxContextTokens, 1_000_000);
    assert.equal(entries[0].defaultMaxOutputTokens, 128_000);
  });

  it("uses only the Provider /models response as the model source", () => {
    const items = buildAnthropicCatalogSyncItems(
      [{ id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" }],
      { conversion: testConversion, priceVersion: "test-anthropic", metadataByModelId: metadataMap() }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["claude-sonnet-4-6"]);
    assert.equal(items[0].providerModelCode, "claude-sonnet-4-6");
    assert.equal(items[0].pricing?.inputUsdPer1k, 0.003);
    assert.equal(items[0].pricing?.outputUsdPer1k, 0.015);
    assert.equal(items[0].pricing?.inputPricePer1mCents, 3241);
  });

  it("does not write returned models when official metadata is unavailable", () => {
    const items = buildAnthropicCatalogSyncItems(
      [{ id: "claude-sonnet-4-6" }, { id: "unknown-private-claude" }],
      { conversion: testConversion, priceVersion: "test-anthropic", metadataByModelId: metadataMap() }
    );

    assert.deepEqual(items.map((item) => item.publicModelCode), ["claude-sonnet-4-6"]);
  });

  it("resolves aliases only from fetched official metadata", () => {
    assert.equal(resolveAnthropicCatalogEntry("claude-opus-4-7", metadataMap())?.displayName, "Claude Opus 4.7");
  });
});
