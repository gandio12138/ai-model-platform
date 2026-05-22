import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveUsdPriceConversion } from "./fx-rate.js";

describe("provider price FX conversion", () => {
  it("uses a live USD/CNY response instead of a hard-coded default", async () => {
    const conversion = await resolveUsdPriceConversion({
      markupMultiplier: 1.15,
      fetchImpl: async () =>
        new Response(JSON.stringify({ rates: { CNY: 7.2154 }, provider: "unit-test-fx" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    });

    assert.equal(conversion.currency, "CNY");
    assert.equal(conversion.usdToTargetRate, 7.2154);
    assert.equal(conversion.markupMultiplier, 1.15);
    assert.equal(conversion.fxRateSource, "unit-test-fx");
  });

  it("can fall back to USD display pricing when CNY rate cannot be resolved", async () => {
    const conversion = await resolveUsdPriceConversion({
      fallbackToUsd: true,
      fetchImpl: async () => new Response("{}", { status: 502, statusText: "Bad Gateway" })
    });

    assert.equal(conversion.currency, "USD");
    assert.equal(conversion.usdToTargetRate, 1);
    assert.match(conversion.fxRateSource, /^fallback_usd:/);
  });
});
