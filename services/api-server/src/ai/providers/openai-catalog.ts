import { ProviderPriceConversion, ProviderPriceCurrency } from "./fx-rate.js";
import { ProviderCredentialConfig } from "./types.js";

export interface OpenAiListedModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export interface OpenAiModelListResult {
  rows: OpenAiListedModel[];
  tokenSource: "provider_credential";
}

export interface OpenAiResolvedPricing {
  priceVersion: string;
  currency: ProviderPriceCurrency;
  sourceCurrency: "USD";
  sourceRegion: string;
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
  sourceProviderName: string;
  billingUnit?: "token_1m" | "token_1k" | "image" | "video_second" | "audio_second" | "unknown";
  unitUsdPrice?: number | null;
  unitPriceCents?: number | null;
  unitLabel?: string | null;
  priceDisplay?: string | null;
}

export interface OpenAiCatalogSyncItem {
  publicModelCode: string;
  providerModelCode: string;
  displayName: string;
  providerName: string;
  modelFamily: string;
  inputModalities: string[];
  outputModalities: string[];
  inferenceTypesSupported: string[];
  supportsStream: boolean;
  supportsTools: boolean;
  sourceModelId: string;
  invocationType: "openai_api";
  maxContextTokens: number | null;
  defaultMaxOutputTokens: number | null;
  pricing: OpenAiResolvedPricing | null;
  raw: Record<string, unknown>;
}

export interface OpenAiModelMetadata {
  id: string;
  displayName: string;
  inputUsdPer1m: number;
  outputUsdPer1m: number;
  cachedInputUsdPer1m?: number;
  maxContextTokens: number | null;
  defaultMaxOutputTokens: number | null;
  inputModalities: string[];
  outputModalities: string[];
  supportsStream?: boolean;
  supportsTools: boolean;
  category: "text_chat" | "embedding" | "image" | "video" | "audio";
  billingUnit?: OpenAiResolvedPricing["billingUnit"];
  unitUsdPrice?: number | null;
  unitLabel?: string | null;
  priceDisplay?: string | null;
  sourceUrl?: string;
  fetchedAt?: string;
}

export interface OpenAiMetadataFetchResult {
  modelId: string;
  metadata: OpenAiModelMetadata | null;
  sourceUrl: string | null;
  error?: string;
}

export async function fetchOpenAiModels(input: {
  credential?: ProviderCredentialConfig | null;
  baseUrl?: string | null;
  organization?: string | null;
  project?: string | null;
  timeoutMs?: number | null;
}): Promise<OpenAiModelListResult> {
  const apiKey = resolveOpenAiApiKey(input.credential);
  if (!apiKey) throw new Error("OpenAI API key is not configured");
  const url = `${normalizeOpenAiBaseUrl(input.baseUrl)}/models`;
  const response = await fetch(url, {
    headers: openAiHeaders(apiKey, input.organization, input.project),
    signal: AbortSignal.timeout(Number(input.timeoutMs ?? 30000))
  });
  const json = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || json.error) {
    throw new Error(`OpenAI models request failed: ${response.status} ${json.error?.message ?? response.statusText}`);
  }
  return {
    rows: Array.isArray(json.data) ? json.data.map((item: any) => ({ ...item, id: String(item.id ?? "") })).filter((item: OpenAiListedModel) => item.id) : [],
    tokenSource: "provider_credential"
  };
}

export function buildOpenAiCatalogSyncItems(
  models: OpenAiListedModel[],
  options: {
    conversion: ProviderPriceConversion;
    priceVersion?: string;
    metadataByModelId: Map<string, OpenAiModelMetadata>;
  }
): OpenAiCatalogSyncItem[] {
  const unique = [...new Map(models.map((model) => [model.id, model])).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
  const selected = new Map<string, { model: OpenAiListedModel; entry: OpenAiModelMetadata }>();
  for (const model of unique) {
    const entry = resolveOpenAiCatalogEntry(model.id, options.metadataByModelId);
    if (!entry) continue;
    const canonicalModelId = canonicalOpenAiModelId(model.id);
    const current = selected.get(canonicalModelId);
    if (!current || shouldPreferOpenAiListedModel(model.id, current.model.id)) {
      selected.set(canonicalModelId, { model, entry });
    }
  }
  const items: OpenAiCatalogSyncItem[] = [];
  for (const [canonicalModelId, { model, entry }] of [...selected.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const pricing = resolveOpenAiPricing(entry, options);
    items.push({
      publicModelCode: canonicalModelId,
      providerModelCode: model.id,
      displayName: displayNameForOpenAiModel(canonicalModelId, entry),
      providerName: "OpenAI",
      modelFamily: "OpenAI",
      inputModalities: entry.inputModalities,
      outputModalities: entry.outputModalities,
      inferenceTypesSupported: ["OPENAI_API"],
      supportsStream: entry.supportsStream ?? true,
      supportsTools: entry.supportsTools,
      sourceModelId: model.id,
      invocationType: "openai_api",
      maxContextTokens: entry.maxContextTokens,
      defaultMaxOutputTokens: entry.defaultMaxOutputTokens,
      pricing,
      raw: {
        source: "openai",
        source_model_id: model.id,
        canonical_model_key: canonicalModelId,
        model_company: "OpenAI",
        model_category: entry.category,
        provider_name: "OpenAI",
        owned_by: model.owned_by ?? null,
        created: model.created ?? null,
        context_source: entry.sourceUrl ? "openai_official_model_docs" : "openai_metadata",
        price_source: entry.sourceUrl ? "openai_official_model_docs" : "openai_metadata",
        metadata_source_url: entry.sourceUrl ?? null,
        metadata_fetched_at: entry.fetchedAt ?? null,
        tools_status: entry.supportsTools ? "supported" : "unsupported"
      }
    });
  }
  return items;
}

export async function fetchOpenAiOfficialModelMetadata(input: {
  modelId: string;
  docsBaseUrl?: string | null;
  timeoutMs?: number | null;
  fetchFn?: typeof fetch;
}): Promise<OpenAiMetadataFetchResult> {
  const modelId = String(input.modelId ?? "").trim();
  const sourceUrl = modelId ? `${String(input.docsBaseUrl ?? "https://developers.openai.com/api/docs/models").replace(/\/+$/u, "")}/${encodeURIComponent(modelId)}` : null;
  if (!modelId || !sourceUrl) {
    return { modelId, metadata: null, sourceUrl, error: "missing_model_id" };
  }
  const fetchFn = input.fetchFn ?? fetch;
  const timeoutMs = Number(input.timeoutMs ?? 30000);
  const fetchOne = async (candidateModelId: string) => {
    const candidateUrl = `${String(input.docsBaseUrl ?? "https://developers.openai.com/api/docs/models").replace(/\/+$/u, "")}/${encodeURIComponent(candidateModelId)}`;
    const response = await fetchFn(candidateUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "OneTokenModelSync/1.0 (+https://xufongnian.xyz)"
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    const html = await response.text();
    if (!response.ok || /Page not found|not found/i.test(html)) {
      return { metadata: null, sourceUrl: candidateUrl, error: `metadata_http_${response.status}` };
    }
    return {
      metadata: parseOpenAiOfficialModelPage(candidateModelId, html, candidateUrl),
      sourceUrl: candidateUrl,
      error: undefined
    };
  };
  try {
    const primary = await fetchOne(modelId);
    if (primary.metadata) return { modelId, metadata: primary.metadata, sourceUrl: primary.sourceUrl };
    const alias = modelId.replace(/-\d{4}-\d{2}-\d{2}$/u, "");
    if (alias && alias !== modelId) {
      const fallback = await fetchOne(alias);
      if (fallback.metadata) {
        return {
          modelId,
          metadata: { ...fallback.metadata, id: alias },
          sourceUrl: fallback.sourceUrl
        };
      }
      return { modelId, metadata: null, sourceUrl: fallback.sourceUrl, error: fallback.error ?? "metadata_parse_failed" };
    }
    return { modelId, metadata: null, sourceUrl: primary.sourceUrl, error: primary.error ?? "metadata_parse_failed" };
  } catch (error) {
    return {
      modelId,
      metadata: null,
      sourceUrl,
      error: error instanceof Error ? error.message : "metadata_fetch_failed"
    };
  }
}

export function parseOpenAiOfficialModelPage(
  modelId: string,
  html: string,
  sourceUrl?: string | null
): OpenAiModelMetadata | null {
  const text = htmlToPlainText(html);
  const displayName =
    matchMetaTitle(html) ??
    firstNonEmptyLine(text) ??
    displayNameFromModelId(modelId);
  const category = openAiModelCategory(modelId);
  const contextTokens = parseTokenCount(text, /([\d,]+)\s+context window/iu);
  const outputTokens = parseTokenCount(text, /([\d,]+)\s+max output tokens/iu);
  const inputPrice = parseUsdPriceAfterLabel(text, "Input");
  const cachedInputPrice = parseUsdPriceAfterLabel(text, "Cached input");
  const outputPrice = parseUsdPriceAfterLabel(text, "Output");
  if ((category === "text_chat" && (!contextTokens || !outputTokens || outputPrice === null)) || inputPrice === null) {
    return null;
  }
  const supportsStream = category === "text_chat" && parseFeatureStatus(text, "Streaming") !== "not_supported";
  const supportsTools = category === "text_chat" && parseFeatureStatus(text, "Function calling") === "supported";
  const hasImageInput = /Image\s+Input only/iu.test(text);
  return {
    id: modelId,
    displayName,
    inputUsdPer1m: inputPrice,
    cachedInputUsdPer1m: cachedInputPrice ?? undefined,
    outputUsdPer1m: outputPrice ?? 0,
    maxContextTokens: contextTokens,
    defaultMaxOutputTokens: outputTokens,
    inputModalities: openAiInputModalities(category, hasImageInput),
    outputModalities: openAiOutputModalities(category),
    supportsStream,
    supportsTools,
    category,
    billingUnit: "token_1m",
    priceDisplay: outputPrice === null
      ? `Input $${inputPrice}/1M tokens`
      : `Input $${inputPrice}/1M tokens, output $${outputPrice}/1M tokens`,
    sourceUrl: sourceUrl ?? undefined,
    fetchedAt: new Date().toISOString()
  };
}

function openAiModelCategory(modelId: string): OpenAiModelMetadata["category"] {
  const normalized = modelId.toLowerCase();
  if (/embedding/.test(normalized)) return "embedding";
  if (/sora|video/.test(normalized)) return "video";
  if (/image|dall-e/.test(normalized)) return "image";
  if (/audio|transcribe|tts|realtime|speech|whisper/.test(normalized)) return "audio";
  return "text_chat";
}

function openAiInputModalities(category: OpenAiModelMetadata["category"], hasImageInput: boolean) {
  if (category === "image") return ["TEXT", "IMAGE"];
  if (category === "video") return ["TEXT", "IMAGE"];
  if (category === "audio") return ["TEXT", "AUDIO"];
  if (category === "embedding") return ["TEXT"];
  return hasImageInput ? ["TEXT", "IMAGE"] : ["TEXT"];
}

function openAiOutputModalities(category: OpenAiModelMetadata["category"]) {
  if (category === "image") return ["IMAGE"];
  if (category === "video") return ["VIDEO"];
  if (category === "audio") return ["AUDIO"];
  if (category === "embedding") return ["EMBEDDING"];
  return ["TEXT"];
}

export function resolveOpenAiCatalogEntry(modelId: string, metadataByModelId: Map<string, OpenAiModelMetadata>) {
  const normalized = String(modelId ?? "").trim();
  if (!normalized) return null;
  const exact = metadataByModelId.get(normalized);
  if (exact) return exact;
  const dateAlias = canonicalOpenAiModelId(normalized);
  return metadataByModelId.get(dateAlias) ?? null;
}

export function canonicalOpenAiModelId(modelId: string) {
  return String(modelId ?? "").trim().replace(/-\d{4}-\d{2}-\d{2}$/u, "");
}

function shouldPreferOpenAiListedModel(candidateId: string, currentId: string) {
  const candidateCanonical = canonicalOpenAiModelId(candidateId);
  const currentCanonical = canonicalOpenAiModelId(currentId);
  const candidateIsBase = candidateId === candidateCanonical;
  const currentIsBase = currentId === currentCanonical;
  if (candidateIsBase !== currentIsBase) return candidateIsBase;
  return candidateId.localeCompare(currentId) > 0;
}

function resolveOpenAiPricing(
  entry: OpenAiModelMetadata,
  options: { conversion: ProviderPriceConversion; priceVersion?: string }
): OpenAiResolvedPricing {
  return {
    priceVersion: options.priceVersion ?? `openai-official-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
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
    cacheReadPricePer1mCents: usdPer1mToTargetCentsPer1m(entry.cachedInputUsdPer1m ?? 0, options.conversion),
    cacheWritePricePer1mCents: 0,
    inputUsdPer1k: entry.inputUsdPer1m / 1000,
    outputUsdPer1k: entry.outputUsdPer1m / 1000,
    cacheReadUsdPer1k: (entry.cachedInputUsdPer1m ?? 0) / 1000,
    cacheWriteUsdPer1k: 0,
    sourceModelName: entry.displayName,
    sourceProviderName: "OpenAI",
    billingUnit: entry.billingUnit ?? "token_1m",
    unitUsdPrice: entry.unitUsdPrice ?? null,
    unitPriceCents: entry.unitUsdPrice
      ? usdUnitToTargetCents(entry.unitUsdPrice, options.conversion)
      : null,
    unitLabel: entry.unitLabel ?? null,
    priceDisplay: entry.priceDisplay ?? null
  };
}

function usdPer1mToTargetCentsPer1m(usdPer1m: number, conversion: ProviderPriceConversion) {
  if (!Number.isFinite(usdPer1m) || usdPer1m <= 0) return 0;
  return Math.ceil(usdPer1m * conversion.usdToTargetRate * conversion.markupMultiplier * 100);
}

function usdUnitToTargetCents(usdPrice: number, conversion: ProviderPriceConversion) {
  if (!Number.isFinite(usdPrice) || usdPrice <= 0) return 0;
  return Math.ceil(usdPrice * conversion.usdToTargetRate * conversion.markupMultiplier * 100);
}

function displayNameForOpenAiModel(modelId: string, entry: OpenAiModelMetadata) {
  if (modelId === entry.id) return entry.displayName;
  return displayNameFromModelId(modelId);
}

function htmlToPlainText(html: string) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/giu, "\n")
    .replace(/<style[\s\S]*?<\/style>/giu, "\n")
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/(div|p|li|h[1-6]|section|article|tr|td|th)>/giu, "\n")
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

function matchMetaTitle(html: string) {
  const title = /<meta\s+name=["']title["']\s+content=["']([^"']+)["']/iu.exec(html)?.[1] ??
    /<title>([^<]+)<\/title>/iu.exec(html)?.[1] ??
    "";
  return title.replace(/\s*Model\s*\|\s*OpenAI API\s*$/iu, "").trim() || null;
}

function firstNonEmptyLine(text: string) {
  return text.split(/\n/u).map((line) => line.trim()).find(Boolean) ?? null;
}

function parseTokenCount(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/,/gu, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseUsdPriceAfterLabel(text: string, label: string) {
  const lines = text.split(/\n/u).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.toLowerCase() !== label.toLowerCase()) continue;
    for (const candidate of lines.slice(index + 1, index + 8)) {
      const parsed = parseUsdPrice(candidate);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function parseUsdPrice(text: string) {
  const match = /\$([0-9]+(?:\.[0-9]+)?)/u.exec(text);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseFeatureStatus(text: string, label: string): "supported" | "not_supported" | "unknown" {
  const lines = text.split(/\n/u).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => /^Features$/iu.test(line));
  const scoped = start >= 0 ? lines.slice(start, start + 80) : lines;
  const index = scoped.findIndex((line) => line.toLowerCase() === label.toLowerCase());
  if (index < 0) return "unknown";
  const next = scoped.slice(index + 1, index + 4).join(" ");
  if (/Not supported/iu.test(next)) return "not_supported";
  if (/Supported/iu.test(next)) return "supported";
  return "unknown";
}

function displayNameFromModelId(modelId: string) {
  const parts = String(modelId ?? "").split("-").filter(Boolean);
  if (parts[0]?.toLowerCase() === "gpt" && parts[1]) {
    return [`GPT-${parts[1]}`, ...parts.slice(2).map(titleWord)].join(" ");
  }
  return parts
    .map(titleWord)
    .join(" ")
    .replace(/\bGpt\b/g, "GPT")
    .replace(/\bMini\b/g, "Mini")
    .replace(/\bNano\b/g, "Nano")
    .replace(/\bPro\b/g, "Pro")
    .replace(/\bCodex\b/g, "Codex");
}

function titleWord(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveOpenAiApiKey(credential?: ProviderCredentialConfig | null) {
  const secret = String(credential?.decryptedSecret ?? "").trim();
  if (!secret) return "";
  if (!secret.startsWith("{")) return secret;
  try {
    const parsed = JSON.parse(secret) as Record<string, unknown>;
    return String(parsed.api_key ?? parsed.apiKey ?? parsed.key ?? parsed.token ?? "").trim();
  } catch {
    return secret;
  }
}

export function normalizeOpenAiBaseUrl(baseUrl?: string | null) {
  return String(baseUrl ?? "https://api.openai.com/v1").trim().replace(/\/+$/u, "") || "https://api.openai.com/v1";
}

export function openAiHeaders(apiKey: string, organization?: string | null, project?: string | null) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json"
  };
  if (organization) headers["OpenAI-Organization"] = organization;
  if (project) headers["OpenAI-Project"] = project;
  return headers;
}
