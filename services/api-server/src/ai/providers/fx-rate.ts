export type ProviderPriceCurrency = "CNY" | "USD";

export interface ProviderPriceConversion {
  currency: ProviderPriceCurrency;
  sourceCurrency: "USD";
  usdToTargetRate: number;
  markupMultiplier: number;
  fxRateSource: string;
  fxRateFetchedAt: string | null;
}

export interface ResolveUsdPriceConversionOptions {
  targetCurrency?: string;
  explicitUsdToCnyRate?: string;
  markupMultiplier?: number;
  fallbackToUsd?: boolean;
  fetchImpl?: typeof fetch;
}

export async function resolveUsdPriceConversion(
  options: ResolveUsdPriceConversionOptions = {}
): Promise<ProviderPriceConversion> {
  const targetCurrency = normalizeTargetCurrency(options.targetCurrency);
  const markupMultiplier = positiveNumber(options.markupMultiplier, 1);
  if (targetCurrency === "USD") {
    return {
      currency: "USD",
      sourceCurrency: "USD",
      usdToTargetRate: 1,
      markupMultiplier,
      fxRateSource: "source_currency",
      fxRateFetchedAt: null
    };
  }

  const explicitRate = positiveNumber(Number(options.explicitUsdToCnyRate), 0);
  if (explicitRate > 0) {
    return {
      currency: "CNY",
      sourceCurrency: "USD",
      usdToTargetRate: explicitRate,
      markupMultiplier,
      fxRateSource: "env_override",
      fxRateFetchedAt: new Date().toISOString()
    };
  }

  try {
    const live = await fetchUsdCnyRate(options.fetchImpl ?? fetch);
    return {
      currency: "CNY",
      sourceCurrency: "USD",
      usdToTargetRate: live.rate,
      markupMultiplier,
      fxRateSource: live.source,
      fxRateFetchedAt: live.fetchedAt
    };
  } catch (error) {
    if (options.fallbackToUsd) {
      return {
        currency: "USD",
        sourceCurrency: "USD",
        usdToTargetRate: 1,
        markupMultiplier,
        fxRateSource: `fallback_usd:${error instanceof Error ? error.message : String(error)}`,
        fxRateFetchedAt: null
      };
    }
    throw error;
  }
}

export async function fetchUsdCnyRate(fetchImpl: typeof fetch = fetch) {
  const url = process.env.PRICE_FX_RATE_URL || "https://open.er-api.com/v6/latest/USD";
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    throw new Error(`USD/CNY exchange rate unavailable: ${response.status} ${response.statusText}`);
  }
  const json = (await response.json()) as any;
  const rate = Number(json.rates?.CNY ?? json.conversion_rates?.CNY);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("USD/CNY exchange rate response does not include a valid CNY rate");
  }
  return {
    rate,
    source: String(json.provider ?? json.documentation ?? new URL(url).hostname),
    fetchedAt: new Date().toISOString()
  };
}

function normalizeTargetCurrency(value: unknown): ProviderPriceCurrency {
  const normalized = String(value ?? "CNY").trim().toUpperCase();
  return normalized === "USD" ? "USD" : "CNY";
}

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
