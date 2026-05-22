export interface BedrockResolvedPricing {
  priceVersion: string;
  currency: "CNY";
  sourceCurrency: "USD";
  sourceRegion: string;
  publicationDate: string | null;
  usdToCnyRate: number;
  markupMultiplier: number;
  inputPricePer1mCents: number;
  outputPricePer1mCents: number;
  cacheReadPricePer1mCents: number;
  cacheWritePricePer1mCents: number;
  inputUsdPer1k: number;
  outputUsdPer1k: number;
  cacheReadUsdPer1k: number;
  cacheWriteUsdPer1k: number;
  sourceModelName: string;
  sourceProviderName: string;
}

export interface BedrockPriceEntry {
  modelName: string;
  providerName: string;
  sourceOfferCode: string;
  inputUsdPer1k?: number;
  outputUsdPer1k?: number;
  cacheReadUsdPer1k?: number;
  cacheWriteUsdPer1k?: number;
  inputPriceGlobal?: boolean;
  outputPriceGlobal?: boolean;
  cacheReadPriceGlobal?: boolean;
  cacheWritePriceGlobal?: boolean;
}

export interface BedrockPriceCatalog {
  region: string;
  publicationDate: string | null;
  priceVersion: string;
  usdToCnyRate: number;
  markupMultiplier: number;
  entries: Map<string, BedrockPriceEntry>;
}

export interface BedrockPriceOfferPayload {
  offerCode: string;
  payload: any;
}

export interface BedrockModelContext {
  maxContextTokens: number | null;
  defaultMaxOutputTokens: number | null;
  contextSource: "catalog_rule" | "admin_required";
}

const bedrockPriceOffers = ["AmazonBedrock", "AmazonBedrockService", "AmazonBedrockFoundationModels"];

export async function fetchAwsBedrockPriceCatalog(
  region: string,
  options: { usdToCnyRate: number; markupMultiplier: number }
): Promise<BedrockPriceCatalog> {
  const normalizedRegion = region || "us-east-1";
  const offers: BedrockPriceOfferPayload[] = [];
  for (const offerCode of bedrockPriceOffers) {
    const response = await fetch(
      `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${offerCode}/current/${encodeURIComponent(normalizedRegion)}/index.json`
    );
    if (!response.ok) {
      if (offerCode === "AmazonBedrock") {
        throw new Error(`AWS Bedrock price list unavailable: ${response.status} ${response.statusText}`);
      }
      continue;
    }
    offers.push({ offerCode, payload: (await response.json()) as any });
  }
  return buildAwsBedrockPriceCatalogFromOfferPayloads(normalizedRegion, offers, options);
}

export function buildAwsBedrockPriceCatalogFromOfferPayloads(
  region: string,
  offers: BedrockPriceOfferPayload[],
  options: { usdToCnyRate: number; markupMultiplier: number }
): BedrockPriceCatalog {
  const normalizedRegion = region || "us-east-1";
  const entries = new Map<string, BedrockPriceEntry>();
  const publicationDates: string[] = [];
  for (const { offerCode, payload } of offers) {
    if (typeof payload.publicationDate === "string") {
      publicationDates.push(payload.publicationDate);
    }
    const products = payload.products && typeof payload.products === "object" ? payload.products : {};
    for (const [sku, product] of Object.entries<any>(products)) {
      const attributes = product?.attributes ?? {};
      if (String(attributes.regionCode ?? "") !== normalizedRegion) continue;
      const inferenceType = inferInferenceType(attributes);
      if (!inferenceType || isNonStandardBedrockPrice(inferenceType, attributes)) continue;
      const usdPer1k = readUsdPer1k(payload.terms?.OnDemand?.[sku], attributes);
      if (usdPer1k === null) continue;
      const modelName = resolvePriceListModelName(attributes);
      if (!modelName) continue;
      const providerName = String(attributes.provider ?? inferBedrockProviderName(modelName)).trim() || "AWS Bedrock";
      const globalPrice = isGlobalBedrockPrice(attributes);
      for (const alias of priceAliasNames(attributes, modelName)) {
        const key = priceKey(providerName, alias);
        const entry = entries.get(key) ?? { modelName, providerName, sourceOfferCode: offerCode };
        if (isCacheReadPrice(inferenceType)) {
          setBedrockTokenPrice(entry, "cacheReadUsdPer1k", "cacheReadPriceGlobal", usdPer1k, globalPrice);
        } else if (isCacheWritePrice(inferenceType)) {
          setBedrockTokenPrice(entry, "cacheWriteUsdPer1k", "cacheWritePriceGlobal", usdPer1k, globalPrice);
        } else if (inferenceType.includes("input")) {
          setBedrockTokenPrice(entry, "inputUsdPer1k", "inputPriceGlobal", usdPer1k, globalPrice);
        } else if (inferenceType.includes("output")) {
          setBedrockTokenPrice(entry, "outputUsdPer1k", "outputPriceGlobal", usdPer1k, globalPrice);
        }
        entries.set(key, entry);
      }
    }
  }
  publicationDates.sort();
  const publicationDate = publicationDates.at(-1) ?? null;
  const priceVersion = publicationDate
    ? `aws-bedrock-${normalizedRegion}-${publicationDate.slice(0, 10).replace(/-/g, "")}`
    : `aws-bedrock-${normalizedRegion}`;
  return {
    region: normalizedRegion,
    publicationDate,
    priceVersion,
    usdToCnyRate: options.usdToCnyRate,
    markupMultiplier: options.markupMultiplier,
    entries
  };
}

export function resolveAwsBedrockPricing(
  catalog: BedrockPriceCatalog,
  input: { providerName: string; displayName: string; modelId: string }
): BedrockResolvedPricing | null {
  for (const key of pricingCandidateKeys(input)) {
    const entry = catalog.entries.get(key);
    if (!entry?.inputUsdPer1k || !entry?.outputUsdPer1k) continue;
    return {
      priceVersion: catalog.priceVersion,
      currency: "CNY",
      sourceCurrency: "USD",
      sourceRegion: catalog.region,
      publicationDate: catalog.publicationDate,
      usdToCnyRate: catalog.usdToCnyRate,
      markupMultiplier: catalog.markupMultiplier,
      inputPricePer1mCents: usdPer1kToCnyCentsPer1m(entry.inputUsdPer1k, catalog),
      outputPricePer1mCents: usdPer1kToCnyCentsPer1m(entry.outputUsdPer1k, catalog),
      cacheReadPricePer1mCents: usdPer1kToCnyCentsPer1m(entry.cacheReadUsdPer1k ?? 0, catalog),
      cacheWritePricePer1mCents: usdPer1kToCnyCentsPer1m(entry.cacheWriteUsdPer1k ?? 0, catalog),
      inputUsdPer1k: entry.inputUsdPer1k,
      outputUsdPer1k: entry.outputUsdPer1k,
      cacheReadUsdPer1k: entry.cacheReadUsdPer1k ?? 0,
      cacheWriteUsdPer1k: entry.cacheWriteUsdPer1k ?? 0,
      sourceModelName: entry.modelName,
      sourceProviderName: entry.providerName
    };
  }
  return null;
}

export function resolveAwsBedrockModelContext(input: {
  providerName: string;
  displayName: string;
  modelId: string;
  outputModalities: string[];
}): BedrockModelContext {
  const searchable = `${input.providerName} ${input.displayName} ${input.modelId}`.toLowerCase();
  const output = input.outputModalities.map((item) => item.toLowerCase());
  if (output.some((item) => item.includes("embedding"))) {
    return { maxContextTokens: null, defaultMaxOutputTokens: null, contextSource: "admin_required" };
  }
  if (/\b(rerank|reranker|rank)\b/.test(searchable)) {
    return { maxContextTokens: null, defaultMaxOutputTokens: null, contextSource: "admin_required" };
  }
  if (/claude/.test(searchable)) {
    return { maxContextTokens: 200000, defaultMaxOutputTokens: 4096, contextSource: "catalog_rule" };
  }
  if (/nova-(micro|lite|pro|premier)|nova (micro|lite|pro|premier)/.test(searchable)) {
    return { maxContextTokens: 300000, defaultMaxOutputTokens: 5000, contextSource: "catalog_rule" };
  }
  if (/titan.*text|amazon\.titan-text/.test(searchable)) {
    return { maxContextTokens: 8000, defaultMaxOutputTokens: 4096, contextSource: "catalog_rule" };
  }
  if (/llama|mistral|mixtral|ministral|cohere|command/.test(searchable)) {
    return { maxContextTokens: 128000, defaultMaxOutputTokens: 4096, contextSource: "catalog_rule" };
  }
  return { maxContextTokens: null, defaultMaxOutputTokens: null, contextSource: "admin_required" };
}

export function canonicalAwsBedrockModelKey(input: { providerName: string; displayName: string; modelId: string }) {
  const modelId = String(input.modelId ?? "").trim();
  const provider = String(input.providerName ?? "").trim().toLowerCase();
  const idWithoutScope = modelId
    .replace(/^(us|global)\./i, "")
    .replace(/:[0-9]+$/g, "");
  const idWithoutProvider = idWithoutScope.replace(/^[a-z0-9-]+\./i, "");
  const baseFromId = idWithoutProvider
    .replace(/-\d{8}-v\d+$/i, "")
    .replace(/-v\d+$/i, "")
    .replace(/-\d{6,8}$/i, "");
  const raw = baseFromId || input.displayName || modelId;
  const normalized = raw
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/^(amazon|anthropic|cohere|mistral(?: ai)?|meta(?: llama)?|ai21(?: labs)?|writer|deepseek|openai|z ai)\s+/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (!normalized) return modelId || String(input.displayName ?? "").trim();
  if (provider.includes("anthropic") || normalized.startsWith("claude-")) {
    return normalized.replace(/-20\d{6}(?:-v\d+)?$/i, "");
  }
  return normalized;
}

function readUsdPer1k(onDemandTerm: unknown, attributes: Record<string, unknown>) {
  if (!onDemandTerm || typeof onDemandTerm !== "object") return null;
  const usageType = String(attributes.usagetype ?? "").toLowerCase();
  for (const term of Object.values(onDemandTerm as Record<string, any>)) {
    const dimensions = term?.priceDimensions ?? {};
    for (const dimension of Object.values<any>(dimensions)) {
      const amount = Number(dimension?.pricePerUnit?.USD);
      if (!Number.isFinite(amount)) continue;
      if (dimension?.unit === "1K tokens") return amount;
      const description = String(dimension?.description ?? "").toLowerCase();
      if (dimension?.unit === "Units" && isMarketplaceTokenUsage(usageType, description)) {
        return amount / 1000;
      }
    }
  }
  return null;
}

function usdPer1kToCnyCentsPer1m(usdPer1k: number, catalog: BedrockPriceCatalog) {
  if (!Number.isFinite(usdPer1k) || usdPer1k <= 0) return 0;
  return Math.ceil(usdPer1k * 1000 * catalog.usdToCnyRate * catalog.markupMultiplier * 100);
}

function isNonStandardBedrockPrice(inferenceType: string, attributes: Record<string, unknown>) {
  const searchable = `${inferenceType} ${String(attributes.feature ?? "")} ${String(attributes.featuretype ?? "")} ${String(attributes.usagetype ?? "")}`.toLowerCase();
  return /\b(batch|flex|priority|provisioned|reserved|custom|long[-_ ]?context|tpm)\b/.test(searchable);
}

function isCacheReadPrice(inferenceType: string) {
  return inferenceType.includes("cache read") || inferenceType.includes("cached input");
}

function isCacheWritePrice(inferenceType: string) {
  return inferenceType.includes("cache write") || inferenceType.includes("cachewrite");
}

function inferInferenceType(attributes: Record<string, unknown>) {
  const explicit = String(attributes.inferenceType ?? "").toLowerCase();
  if (explicit) return explicit;
  const usageType = String(attributes.usagetype ?? "").toLowerCase();
  const normalizedUsageType = usageType.replace(/[^a-z]/g, "");
  if (normalizedUsageType.includes("cachereadtokens") || normalizedUsageType.includes("cachereadinputtokencount")) {
    return "cache read input tokens";
  }
  if (normalizedUsageType.includes("cachewritetokens") || normalizedUsageType.includes("cachewrite")) {
    return "cache write input tokens";
  }
  if (normalizedUsageType.includes("inputtokens") || normalizedUsageType.includes("inputtokencount")) {
    return "input tokens";
  }
  if (normalizedUsageType.includes("outputtokens") || normalizedUsageType.includes("responsetokens") || normalizedUsageType.includes("outputtokencount")) {
    return "output tokens";
  }
  if (usageType.includes("cachereadinputtokencount")) return "cache read input tokens";
  if (usageType.includes("cachewrite")) return "cache write input tokens";
  if (usageType.includes("inputtokencount")) return "input tokens";
  if (usageType.includes("outputtokencount")) return "output tokens";
  const feature = String(attributes.feature ?? "").toLowerCase();
  if (feature.includes("on-demand inference")) return explicit;
  return "";
}

function setBedrockTokenPrice(
  entry: BedrockPriceEntry,
  priceKeyName: "inputUsdPer1k" | "outputUsdPer1k" | "cacheReadUsdPer1k" | "cacheWriteUsdPer1k",
  globalKeyName: "inputPriceGlobal" | "outputPriceGlobal" | "cacheReadPriceGlobal" | "cacheWritePriceGlobal",
  usdPer1k: number,
  isGlobal: boolean
) {
  const current = entry[priceKeyName];
  const currentIsGlobal = entry[globalKeyName] === true;
  if (current === undefined || (currentIsGlobal && !isGlobal)) {
    entry[priceKeyName] = usdPer1k;
    entry[globalKeyName] = isGlobal;
  }
}

function isMarketplaceTokenUsage(usageType: string, description: string) {
  const value = `${usageType} ${description}`.toLowerCase();
  return (
    value.includes("tokencount") ||
    value.includes("input_tokens") ||
    value.includes("output_tokens") ||
    value.includes("response tokens") ||
    value.includes("input tokens") ||
    value.includes("cache read tokens") ||
    value.includes("cache write tokens") ||
    value.includes("million input tokens") ||
    value.includes("million response tokens")
  );
}

function isGlobalBedrockPrice(attributes: Record<string, unknown>) {
  const usageType = String(attributes.usagetype ?? "").toLowerCase();
  return usageType.includes("_global") || usageType.includes("-global");
}

function priceAliasNames(attributes: Record<string, unknown>, modelName: string) {
  const aliases = new Set<string>();
  const add = (value: unknown) => {
    const alias = String(value ?? "").trim();
    if (!alias) return;
    aliases.add(alias);
    const stripped = stripKnownProviderPrefix(alias);
    if (stripped && stripped !== alias) aliases.add(stripped);
  };
  add(modelName);
  for (const alias of modelAliasesFromUsageType(attributes.usagetype)) {
    add(alias);
  }
  return [...aliases];
}

function stripKnownProviderPrefix(value: string) {
  return value
    .replace(/^(amazon|anthropic|cohere|mistral(?: ai)?|meta(?: llama)?|ai21(?: labs)?|writer|deepseek|openai|z ai)\s+/i, "")
    .trim();
}

function modelAliasesFromUsageType(value: unknown) {
  const usageType = String(value ?? "");
  const aliases: string[] = [];
  for (const rawSegment of usageType.split(":")) {
    let segment = rawSegment.trim();
    if (!segment) continue;
    segment = segment.replace(/^use\d+[a-z]*[-_]/i, "");
    segment = segment.replace(/_+/g, "-");
    segment = segment.replace(/-(?:mantle-)?(?:input|output|cache|cached|million|reserved|provisioned|customization).*$/i, "");
    segment = segment.replace(/-mantle$/i, "");
    if (!isUsageModelAlias(segment)) continue;
    aliases.push(segment);
  }
  return aliases;
}

function isUsageModelAlias(value: string) {
  const normalized = value.toLowerCase();
  if (!normalized || normalized === "mp") return false;
  if (/^(input|output|cache|cached|token|tokencount|unit|units)/.test(normalized)) return false;
  return normalized.includes(".") || normalized.split("-").length >= 3;
}

function resolvePriceListModelName(attributes: Record<string, unknown>) {
  const model = String(attributes.model ?? "").trim();
  if (model) return model;
  return String(attributes.servicename ?? "")
    .replace(/\s*\(Amazon Bedrock Edition\)\s*$/i, "")
    .replace(/^(Amazon Bedrock|AWS Bedrock)\s*[-:]\s*/i, "")
    .trim();
}

function pricingCandidateKeys(input: { providerName: string; displayName: string; modelId: string }) {
  const names = new Set<string>([
    input.displayName,
    input.displayName.replace(/\s*\([^)]*\)\s*/g, " ").trim(),
    input.modelId,
    modelIdToName(input.modelId),
    modelIdToBaseName(input.modelId),
    input.displayName.replace(/^Amazon\s+/i, ""),
    input.displayName.replace(/^Anthropic\s+/i, ""),
    input.displayName.replace(/^Meta\s+/i, "")
  ]);
  const providers = new Set<string>([
    input.providerName,
    inferBedrockProviderName(input.displayName),
    inferBedrockProviderName(input.modelId)
  ]);
  const keys: string[] = [];
  for (const provider of providers) {
    for (const name of names) {
      if (!provider || !name) continue;
      keys.push(priceKey(provider, name));
    }
  }
  return [...new Set(keys)];
}

function priceKey(provider: string, model: string) {
  return `${normalizeProvider(provider)}:${normalizeModelName(model)}`;
}

function normalizeProvider(value: string) {
  return value
    .toLowerCase()
    .replace(/^amazon\s+web\s+services$/, "amazon")
    .replace(/^aws$/, "amazon")
    .replace(/^mistral\s+ai$/, "mistral")
    .replace(/^meta\s+llama$/, "meta")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeModelName(value: string) {
  return value
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/^([a-z0-9]+)\./, "")
    .replace(/[:_./-]+/g, " ")
    .replace(/\bv\d+\b/g, "")
    .replace(/\b20\d{6}\b/g, "")
    .replace(/\b\d{8}\b/g, "")
    .replace(/\b(us|global)\b/g, "")
    .replace(/\b(instruct|preview)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function modelIdToName(modelId: string) {
  return modelId
    .replace(/^(us|global)\./, "")
    .replace(/^[a-z]+\./, "")
    .replace(/:[^:]+$/, "")
    .replace(/-/g, " ");
}

function modelIdToBaseName(modelId: string) {
  return modelIdToName(modelId)
    .replace(/\bv\d+\b/gi, "")
    .replace(/\b20\d{2}(?:\d{2})?(?:\d{2})?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferBedrockProviderName(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("anthropic") || normalized.includes("claude")) return "Anthropic";
  if (normalized.includes("amazon") || normalized.includes("nova") || normalized.includes("titan")) return "Amazon";
  if (normalized.includes("meta") || normalized.includes("llama")) return "Meta";
  if (normalized.includes("mistral") || normalized.includes("mixtral") || normalized.includes("ministral")) return "Mistral";
  if (normalized.includes("cohere") || normalized.includes("command")) return "Cohere";
  if (normalized.includes("ai21") || normalized.includes("jamba")) return "AI21 Labs";
  if (normalized.includes("openai") || normalized.includes("gpt")) return "OpenAI";
  if (normalized.includes("deepseek")) return "DeepSeek";
  if (normalized.includes("zai") || normalized.includes("glm")) return "Z AI";
  if (normalized.includes("writer") || normalized.includes("palmyra")) return "Writer";
  return "";
}
