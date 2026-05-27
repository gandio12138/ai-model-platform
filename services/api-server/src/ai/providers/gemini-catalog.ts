import { ProviderPriceConversion, ProviderPriceCurrency } from "./fx-rate.js";
import { ProviderCredentialConfig } from "./types.js";

export interface GeminiListedModel {
  name: string;
  baseModelId?: string;
  version?: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

export interface GeminiResolvedPricing {
  priceVersion: string;
  currency: ProviderPriceCurrency;
  sourceCurrency: "USD";
  sourceRegion: "global";
  publicationDate: string | null;
  usdToTargetRate: number;
  markupMultiplier: number;
  fxRateSource: string;
  fxRateFetchedAt: string | null;
  inputPricePer1mCents: number;
  outputPricePer1mCents: number;
  cacheReadPricePer1mCents: number;
  cacheWritePricePer1mCents: number;
  inputUsdPer1k: number;
  outputUsdPer1k: number;
  cacheReadUsdPer1k: number;
  cacheWriteUsdPer1k: number;
  sourceModelName: string;
  sourceProviderName: "Google";
  billingUnit?: "token_1m" | "image" | "video_second" | "audio_second" | "song" | "unknown";
  unitUsdPrice?: number | null;
  unitPriceCents?: number | null;
  unitLabel?: string | null;
  priceDisplay?: string | null;
}

export interface GeminiModelMetadata {
  id: string;
  displayName: string;
  inputUsdPer1m: number;
  outputUsdPer1m: number;
  cacheReadUsdPer1m: number;
  cacheWriteUsdPer1m: number;
  billingUnit: NonNullable<GeminiResolvedPricing["billingUnit"]>;
  unitUsdPrice: number | null;
  unitLabel: string | null;
  priceDisplay: string | null;
  sourceUrl: string;
  fetchedAt: string;
}

export interface GeminiCatalogSyncItem {
  publicModelCode: string;
  providerModelCode: string;
  displayName: string;
  providerName: "Google";
  modelFamily: "Gemini";
  inputModalities: string[];
  outputModalities: string[];
  inferenceTypesSupported: string[];
  supportsStream: boolean;
  supportsTools: boolean;
  sourceModelId: string;
  invocationType: "gemini_api";
  maxContextTokens: number | null;
  defaultMaxOutputTokens: number | null;
  pricing: GeminiResolvedPricing | null;
  raw: Record<string, unknown>;
}

export async function fetchGeminiModels(input: {
  credential?: ProviderCredentialConfig | null;
  baseUrl?: string | null;
  timeoutMs?: number | null;
  fetchFn?: typeof fetch;
}) {
  const apiKey = resolveGeminiApiKey(input.credential);
  if (!apiKey) throw new Error("Gemini API key is not configured");
  const fetchFn = input.fetchFn ?? fetch;
  const rows: GeminiListedModel[] = [];
  let pageToken = "";
  const timeoutMs = Number(input.timeoutMs ?? 30000);
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`${normalizeGeminiBaseUrl(input.baseUrl)}/models`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetchFn(url, {
      headers: geminiHeaders(apiKey),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const json = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || json.error) {
      throw new Error(`Gemini models request failed: ${response.status} ${json.error?.message ?? response.statusText}`);
    }
    for (const model of json.models ?? []) {
      const name = String(model.name ?? "").replace(/^models\//u, "").trim();
      if (!name) continue;
      rows.push({
        ...model,
        name,
        baseModelId: model.baseModelId ? String(model.baseModelId).replace(/^models\//u, "") : undefined,
        supportedGenerationMethods: Array.isArray(model.supportedGenerationMethods)
          ? model.supportedGenerationMethods.map(String)
          : []
      });
    }
    pageToken = String(json.nextPageToken ?? "");
    if (!pageToken) break;
  }
  return {
    rows: [...new Map(rows.map((row) => [row.name, row])).values()],
    tokenSource: "provider_credential" as const
  };
}

export function buildGeminiCatalogSyncItems(
  models: GeminiListedModel[],
  options: {
    conversion: ProviderPriceConversion;
    priceVersion?: string;
    metadataByModelId: Map<string, GeminiModelMetadata>;
  }
): GeminiCatalogSyncItem[] {
  const items: GeminiCatalogSyncItem[] = [];
  const selected = new Map<string, { model: GeminiListedModel; metadata: GeminiModelMetadata }>();
  for (const model of [...new Map(models.map((item) => [item.name, item])).values()].sort((left, right) => left.name.localeCompare(right.name))) {
    const metadata = resolveGeminiCatalogEntry(model, options.metadataByModelId);
    if (!metadata) continue;
    const maxContextTokens = numberOrNull(model.inputTokenLimit);
    const defaultMaxOutputTokens = numberOrNull(model.outputTokenLimit);
    if (!maxContextTokens || !defaultMaxOutputTokens) continue;
    const publicModelCode = canonicalGeminiPublicModelCode(model.name);
    const current = selected.get(publicModelCode);
    if (!current || shouldPreferGeminiListedModel(model.name, current.model.name)) {
      selected.set(publicModelCode, { model, metadata });
    }
  }

  for (const [publicModelCode, { model, metadata }] of [...selected.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const maxContextTokens = numberOrNull(model.inputTokenLimit);
    const defaultMaxOutputTokens = numberOrNull(model.outputTokenLimit);
    if (!maxContextTokens || !defaultMaxOutputTokens) continue;
    const category = geminiModelCategory(model);
    const pricing = resolveGeminiPricing(metadata, options);
    items.push({
      publicModelCode,
      providerModelCode: model.name,
      displayName: metadata.displayName || model.displayName || displayNameFromGeminiModelId(publicModelCode),
      providerName: "Google",
      modelFamily: "Gemini",
      inputModalities: geminiInputModalities(category),
      outputModalities: geminiOutputModalities(category),
      inferenceTypesSupported: model.supportedGenerationMethods ?? [],
      supportsStream: category === "text_chat" && (model.supportedGenerationMethods ?? []).includes("streamGenerateContent"),
      supportsTools: false,
      sourceModelId: model.name,
      invocationType: "gemini_api",
      maxContextTokens,
      defaultMaxOutputTokens,
      pricing,
      raw: {
        source: "gemini",
        source_model_id: model.name,
        canonical_model_key: publicModelCode,
        model_company: "Google",
        model_category: category,
        provider_name: "Google",
        base_model_id: model.baseModelId ?? null,
        version: model.version ?? null,
        supported_generation_methods: model.supportedGenerationMethods ?? [],
        context_source: "gemini_models_api",
        price_source: "gemini_official_pricing_docs",
        metadata_source_url: metadata.sourceUrl,
        metadata_fetched_at: metadata.fetchedAt,
        tools_status: "unverified"
      }
    });
  }
  return items;
}

export async function fetchGeminiOfficialPricingCatalog(input: {
  pricingUrl?: string | null;
  timeoutMs?: number | null;
  fetchFn?: typeof fetch;
} = {}) {
  const sourceUrl = normalizeGeminiPricingUrl(input.pricingUrl);
  const fetchFn = input.fetchFn ?? fetch;
  const response = await fetchFn(sourceUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "OneTokenModelSync/1.0 (+https://xufongnian.xyz)"
    },
    signal: AbortSignal.timeout(Number(input.timeoutMs ?? 30000))
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`Gemini pricing request failed: ${response.status} ${response.statusText}`);
  const entries = parseGeminiOfficialPricingPage(html, sourceUrl);
  if (!entries.length) {
    throw new Error("Gemini pricing metadata parse returned 0 entries");
  }
  return buildGeminiMetadataMap(entries);
}

export function parseGeminiOfficialPricingPage(html: string, sourceUrl = "https://ai.google.dev/gemini-api/docs/pricing") {
  const fetchedAt = new Date().toISOString();
  const entries: GeminiModelMetadata[] = [];
  const sections = String(html ?? "").split(/<div class="models-section">/giu).slice(1);
  for (const section of sections) {
    const id = /<code[^>]*>([^<]+)<\/code>/iu.exec(section)?.[1]?.trim();
    if (!id) continue;
    const displayName = /<h2[^>]*>([^<]+)<\/h2>/iu.exec(section)?.[1]?.trim() || displayNameFromGeminiModelId(id);
    const standardBlock = firstStandardPricingBlock(section);
    const inputUsdPer1m = parsePaidTierPrice(standardBlock, /Input price/iu);
    const outputUsdPer1m = parsePaidTierPrice(standardBlock, /Output price/iu);
    const cacheReadUsdPer1m = parsePaidTierPrice(standardBlock, /Context caching price/iu) ?? 0;
    const unit = parseUnitPrice(standardBlock);
    if (inputUsdPer1m === null && outputUsdPer1m === null && !unit) continue;
    entries.push({
      id,
      displayName,
      inputUsdPer1m: inputUsdPer1m ?? 0,
      outputUsdPer1m: outputUsdPer1m ?? 0,
      cacheReadUsdPer1m,
      cacheWriteUsdPer1m: 0,
      billingUnit: unit?.billingUnit ?? "token_1m",
      unitUsdPrice: unit?.unitUsdPrice ?? null,
      unitLabel: unit?.unitLabel ?? null,
      priceDisplay: unit?.priceDisplay ?? priceDisplay(inputUsdPer1m ?? 0, outputUsdPer1m ?? 0),
      sourceUrl,
      fetchedAt
    });
  }
  return entries;
}

export function buildGeminiMetadataMap(entries: GeminiModelMetadata[]) {
  const map = new Map<string, GeminiModelMetadata>();
  for (const entry of entries) {
    map.set(entry.id, entry);
    map.set(canonicalGeminiPublicModelCode(entry.id), entry);
  }
  return map;
}

export function resolveGeminiCatalogEntry(model: GeminiListedModel, metadataByModelId: Map<string, GeminiModelMetadata>) {
  const revisionless = stripGeminiNumericRevision(model.name);
  return metadataByModelId.get(model.name) ??
    metadataByModelId.get(canonicalGeminiPublicModelCode(model.name)) ??
    (revisionless ? metadataByModelId.get(revisionless) : null) ??
    (model.baseModelId ? metadataByModelId.get(model.baseModelId) : null) ??
    null;
}

export function resolveGeminiApiKey(credential?: ProviderCredentialConfig | null) {
  const secret = String(credential?.decryptedSecret ?? "").trim();
  if (!secret) return "";
  if (!secret.startsWith("{")) return secret;
  try {
    const parsed = JSON.parse(secret) as Record<string, unknown>;
    return String(parsed.api_key ?? parsed.apiKey ?? parsed.key ?? parsed.token ?? parsed.gemini_api_key ?? "").trim();
  } catch {
    return secret;
  }
}

export function normalizeGeminiBaseUrl(baseUrl?: string | null) {
  const value = String(baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").trim().replace(/\/+$/u, "");
  if (!value) return "https://generativelanguage.googleapis.com/v1beta";
  return /\/v1(?:beta)?$/u.test(value) ? value : `${value}/v1beta`;
}

export function geminiHeaders(apiKey: string) {
  return {
    "x-goog-api-key": apiKey,
    "content-type": "application/json"
  };
}

function resolveGeminiPricing(
  entry: GeminiModelMetadata,
  options: { conversion: ProviderPriceConversion; priceVersion?: string }
): GeminiResolvedPricing {
  return {
    priceVersion: options.priceVersion ?? `gemini-official-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
    currency: options.conversion.currency,
    sourceCurrency: "USD",
    sourceRegion: "global",
    publicationDate: null,
    usdToTargetRate: options.conversion.usdToTargetRate,
    markupMultiplier: options.conversion.markupMultiplier,
    fxRateSource: options.conversion.fxRateSource,
    fxRateFetchedAt: options.conversion.fxRateFetchedAt,
    inputPricePer1mCents: usdPer1mToTargetCentsPer1m(entry.inputUsdPer1m, options.conversion),
    outputPricePer1mCents: usdPer1mToTargetCentsPer1m(entry.outputUsdPer1m, options.conversion),
    cacheReadPricePer1mCents: usdPer1mToTargetCentsPer1m(entry.cacheReadUsdPer1m, options.conversion),
    cacheWritePricePer1mCents: usdPer1mToTargetCentsPer1m(entry.cacheWriteUsdPer1m, options.conversion),
    inputUsdPer1k: entry.inputUsdPer1m / 1000,
    outputUsdPer1k: entry.outputUsdPer1m / 1000,
    cacheReadUsdPer1k: entry.cacheReadUsdPer1m / 1000,
    cacheWriteUsdPer1k: entry.cacheWriteUsdPer1m / 1000,
    sourceModelName: entry.displayName,
    sourceProviderName: "Google",
    billingUnit: entry.billingUnit,
    unitUsdPrice: entry.unitUsdPrice,
    unitPriceCents: entry.unitUsdPrice ? usdUnitToTargetCents(entry.unitUsdPrice, options.conversion) : null,
    unitLabel: entry.unitLabel,
    priceDisplay: entry.priceDisplay
  };
}

function firstStandardPricingBlock(section: string) {
  const start = section.search(/<h3[^>]*>\s*Standard\s*<\/h3>/iu);
  const scoped = start >= 0 ? section.slice(start) : section;
  const table = /<table class="pricing-table">[\s\S]*?<\/table>/iu.exec(scoped)?.[0] ?? "";
  return table || scoped.slice(0, 8000);
}

function parsePaidTierPrice(block: string, label: RegExp) {
  const row = findTableRow(block, label);
  if (!row) return null;
  const cells = parseTableCells(row);
  const paidTier = cells[cells.length - 1] ?? "";
  return parseUsdPrice(paidTier);
}

function parseUnitPrice(block: string) {
  const text = htmlToPlainText(block);
  const image = /\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*image/iu.exec(text) ?? /equivalent to\s*\$([0-9]+(?:\.[0-9]+)?)\s*per image/iu.exec(text);
  if (image?.[1]) return { billingUnit: "image" as const, unitUsdPrice: Number(image[1]), unitLabel: "image", priceDisplay: `$${image[1]} / image` };
  const second = /\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*second/iu.exec(text);
  if (second?.[1]) return { billingUnit: "video_second" as const, unitUsdPrice: Number(second[1]), unitLabel: "second", priceDisplay: `$${second[1]} / second` };
  const song = /\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*(song|clip)/iu.exec(text);
  if (song?.[1]) return { billingUnit: "song" as const, unitUsdPrice: Number(song[1]), unitLabel: song[2], priceDisplay: `$${song[1]} / ${song[2]}` };
  return null;
}

function findTableRow(block: string, label: RegExp) {
  return (block.match(/<tr[\s\S]*?<\/tr>/giu) ?? []).find((row) => label.test(htmlToPlainText(row))) ?? "";
}

function parseTableCells(row: string) {
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/giu)].map((match) => htmlToPlainText(match[1]));
}

function parseUsdPrice(value: string) {
  const match = /\$([0-9]+(?:\.[0-9]+)?)/u.exec(value);
  if (!match?.[1]) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

function priceDisplay(input: number, output: number) {
  if (input > 0 && output > 0) return `Input $${input}/1M tokens, output $${output}/1M tokens`;
  if (input > 0) return `Input $${input}/1M tokens`;
  if (output > 0) return `Output $${output}/1M tokens`;
  return null;
}

function geminiModelCategory(model: GeminiListedModel) {
  const id = model.name.toLowerCase();
  const methods = new Set((model.supportedGenerationMethods ?? []).map((item) => item.toLowerCase()));
  if (methods.has("embedcontent") || /embedding|embed/.test(id)) return "embedding";
  if (/veo|video/.test(id)) return "video";
  if (/imagen|imagegeneration|image/.test(id)) return "image";
  if (/audio|tts|speech|lyria|music/.test(id)) return "audio";
  return "text_chat";
}

function geminiInputModalities(category: string) {
  if (category === "image") return ["TEXT", "IMAGE"];
  if (category === "video") return ["TEXT", "IMAGE", "VIDEO"];
  if (category === "audio") return ["TEXT", "AUDIO"];
  if (category === "embedding") return ["TEXT"];
  return ["TEXT", "IMAGE", "AUDIO", "VIDEO"];
}

function geminiOutputModalities(category: string) {
  if (category === "image") return ["IMAGE"];
  if (category === "video") return ["VIDEO"];
  if (category === "audio") return ["AUDIO"];
  if (category === "embedding") return ["EMBEDDING"];
  return ["TEXT"];
}

export function canonicalGeminiPublicModelCode(modelId: string) {
  const normalized = String(modelId ?? "")
    .trim()
    .replace(/^models\//u, "")
    .replace(/-(?:preview|exp)(?:-\d{2}-\d{2}|-\d{2}-\d{4}|-\d{4}-\d{2})$/u, "")
    .replace(/-(?:preview|exp)$/u, "");
  return stripGeminiNumericRevision(normalized) || normalized;
}

function displayNameFromGeminiModelId(modelId: string) {
  return String(modelId ?? "")
    .replace(/^models\//u, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.replace(/\b\w/g, (char) => char.toUpperCase()))
    .join(" ")
    .replace(/\bAi\b/g, "AI")
    .replace(/\bTts\b/g, "TTS")
    .replace(/\bGemini\s+(\d+)\s+(\d+)\b/u, "Gemini $1.$2");
}

function stripGeminiNumericRevision(modelId: string) {
  const normalized = String(modelId ?? "").trim().replace(/^models\//u, "");
  if (!/^gemini-\d/u.test(normalized)) return "";
  return normalized.replace(/-\d{3}$/u, "");
}

function shouldPreferGeminiListedModel(candidateModelId: string, currentModelId: string) {
  const candidate = geminiListedModelPreference(candidateModelId);
  const current = geminiListedModelPreference(currentModelId);
  if (candidate.score !== current.score) return candidate.score > current.score;
  if (candidate.revision !== current.revision) return candidate.revision > current.revision;
  return candidateModelId.localeCompare(currentModelId) > 0;
}

function geminiListedModelPreference(modelId: string) {
  const normalized = String(modelId ?? "").toLowerCase();
  if (!/(?:^|-)preview(?:-|$)|(?:^|-)exp(?:-|$)|(?:^|-)latest$/u.test(normalized)) {
    return { score: 100, revision: 0 };
  }
  const monthYear = /-(?:preview|exp)-(\d{2})-(\d{4})$/u.exec(normalized);
  if (monthYear) return { score: 50, revision: Number(`${monthYear[2]}${monthYear[1]}`) };
  const monthShortYear = /-(?:preview|exp)-(\d{2})-(\d{2})$/u.exec(normalized);
  if (monthShortYear) return { score: 50, revision: Number(`20${monthShortYear[2]}${monthShortYear[1]}`) };
  const yearMonth = /-(?:preview|exp)-(\d{4})-(\d{2})$/u.exec(normalized);
  if (yearMonth) return { score: 50, revision: Number(`${yearMonth[1]}${yearMonth[2]}`) };
  return { score: 10, revision: 0 };
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function usdPer1mToTargetCentsPer1m(usdPer1m: number, conversion: ProviderPriceConversion) {
  if (!Number.isFinite(usdPer1m) || usdPer1m <= 0) return 0;
  return Math.ceil(usdPer1m * conversion.usdToTargetRate * conversion.markupMultiplier * 100);
}

function usdUnitToTargetCents(usdPrice: number, conversion: ProviderPriceConversion) {
  if (!Number.isFinite(usdPrice) || usdPrice <= 0) return 0;
  return Math.ceil(usdPrice * conversion.usdToTargetRate * conversion.markupMultiplier * 100);
}

function htmlToPlainText(html: string) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/giu, "\n")
    .replace(/<style[\s\S]*?<\/style>/giu, "\n")
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/(div|p|li|h[1-6]|section|article|tr|td|th|span|strong|a)>/giu, "\n")
    .replace(/<[^>]+>/gu, "\n")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/\n{2,}/gu, "\n")
    .trim();
}

function normalizeGeminiPricingUrl(pricingUrl?: string | null) {
  const raw = String(pricingUrl ?? "https://ai.google.dev/gemini-api/docs/pricing?hl=en").trim();
  const url = new URL(raw || "https://ai.google.dev/gemini-api/docs/pricing?hl=en");
  if (!url.searchParams.get("hl")) url.searchParams.set("hl", "en");
  return url.toString();
}
