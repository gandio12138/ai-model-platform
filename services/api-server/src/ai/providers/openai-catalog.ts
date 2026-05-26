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

interface OpenAiCatalogEntry {
  id: string;
  displayName: string;
  inputUsdPer1m: number;
  outputUsdPer1m: number;
  cachedInputUsdPer1m?: number;
  maxContextTokens: number;
  defaultMaxOutputTokens: number;
  inputModalities: string[];
  outputModalities: string[];
  supportsTools: boolean;
  category: "text_chat";
}

// OpenAI's /models endpoint lists accessible model IDs but does not include price
// or context metadata. Keep this table scoped to official API docs/pricing entries.
const officialOpenAiCatalog: OpenAiCatalogEntry[] = [
  {
    id: "gpt-5.2",
    displayName: "GPT-5.2",
    inputUsdPer1m: 1.75,
    cachedInputUsdPer1m: 0.175,
    outputUsdPer1m: 14,
    maxContextTokens: 400000,
    defaultMaxOutputTokens: 128000,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-5.1",
    displayName: "GPT-5.1",
    inputUsdPer1m: 1.25,
    cachedInputUsdPer1m: 0.125,
    outputUsdPer1m: 10,
    maxContextTokens: 400000,
    defaultMaxOutputTokens: 128000,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-5",
    displayName: "GPT-5",
    inputUsdPer1m: 1.25,
    cachedInputUsdPer1m: 0.125,
    outputUsdPer1m: 10,
    maxContextTokens: 400000,
    defaultMaxOutputTokens: 128000,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-5-mini",
    displayName: "GPT-5 Mini",
    inputUsdPer1m: 0.25,
    cachedInputUsdPer1m: 0.025,
    outputUsdPer1m: 2,
    maxContextTokens: 400000,
    defaultMaxOutputTokens: 128000,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-5-nano",
    displayName: "GPT-5 Nano",
    inputUsdPer1m: 0.05,
    cachedInputUsdPer1m: 0.005,
    outputUsdPer1m: 0.4,
    maxContextTokens: 400000,
    defaultMaxOutputTokens: 128000,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-5.2-chat-latest",
    displayName: "GPT-5.2 Chat",
    inputUsdPer1m: 1.75,
    cachedInputUsdPer1m: 0.175,
    outputUsdPer1m: 14,
    maxContextTokens: 128000,
    defaultMaxOutputTokens: 16384,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-5.1-chat-latest",
    displayName: "GPT-5.1 Chat",
    inputUsdPer1m: 1.25,
    cachedInputUsdPer1m: 0.125,
    outputUsdPer1m: 10,
    maxContextTokens: 128000,
    defaultMaxOutputTokens: 16384,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-5-chat-latest",
    displayName: "GPT-5 Chat",
    inputUsdPer1m: 1.25,
    cachedInputUsdPer1m: 0.125,
    outputUsdPer1m: 10,
    maxContextTokens: 128000,
    defaultMaxOutputTokens: 16384,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-4.1",
    displayName: "GPT-4.1",
    inputUsdPer1m: 2,
    cachedInputUsdPer1m: 0.5,
    outputUsdPer1m: 8,
    maxContextTokens: 1047576,
    defaultMaxOutputTokens: 32768,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-4.1-mini",
    displayName: "GPT-4.1 Mini",
    inputUsdPer1m: 0.4,
    cachedInputUsdPer1m: 0.1,
    outputUsdPer1m: 1.6,
    maxContextTokens: 1047576,
    defaultMaxOutputTokens: 32768,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-4.1-nano",
    displayName: "GPT-4.1 Nano",
    inputUsdPer1m: 0.1,
    cachedInputUsdPer1m: 0.025,
    outputUsdPer1m: 0.4,
    maxContextTokens: 1047576,
    defaultMaxOutputTokens: 32768,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-4o",
    displayName: "GPT-4o",
    inputUsdPer1m: 2.5,
    cachedInputUsdPer1m: 1.25,
    outputUsdPer1m: 10,
    maxContextTokens: 128000,
    defaultMaxOutputTokens: 16384,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  },
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    inputUsdPer1m: 0.15,
    cachedInputUsdPer1m: 0.075,
    outputUsdPer1m: 0.6,
    maxContextTokens: 128000,
    defaultMaxOutputTokens: 16384,
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    supportsTools: true,
    category: "text_chat"
  }
];

const catalogById = new Map(officialOpenAiCatalog.map((entry) => [entry.id, entry]));

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
  }
): OpenAiCatalogSyncItem[] {
  const unique = [...new Map(models.map((model) => [model.id, model])).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
  const items: OpenAiCatalogSyncItem[] = [];
  for (const model of unique) {
    const entry = resolveOpenAiCatalogEntry(model.id);
    if (!entry) continue;
    const pricing = resolveOpenAiPricing(entry, options);
    items.push({
      publicModelCode: model.id,
      providerModelCode: model.id,
      displayName: displayNameForOpenAiModel(model.id, entry),
      providerName: "OpenAI",
      modelFamily: "OpenAI",
      inputModalities: entry.inputModalities,
      outputModalities: entry.outputModalities,
      inferenceTypesSupported: ["OPENAI_API"],
      supportsStream: true,
      supportsTools: entry.supportsTools,
      sourceModelId: model.id,
      invocationType: "openai_api",
      maxContextTokens: entry.maxContextTokens,
      defaultMaxOutputTokens: entry.defaultMaxOutputTokens,
      pricing,
      raw: {
        source: "openai",
        source_model_id: model.id,
        canonical_model_key: model.id,
        model_company: "OpenAI",
        model_category: entry.category,
        provider_name: "OpenAI",
        owned_by: model.owned_by ?? null,
        created: model.created ?? null,
        context_source: "openai_official_model_docs",
        price_source: "openai_official_pricing",
        tools_status: entry.supportsTools ? "supported" : "unsupported"
      }
    });
  }
  return items;
}

export function resolveOpenAiCatalogEntry(modelId: string) {
  const normalized = String(modelId ?? "").trim();
  if (!normalized) return null;
  const exact = catalogById.get(normalized);
  if (exact) return exact;
  const dateAlias = normalized.replace(/-\d{4}-\d{2}-\d{2}$/u, "");
  return catalogById.get(dateAlias) ?? null;
}

function resolveOpenAiPricing(
  entry: OpenAiCatalogEntry,
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
    sourceProviderName: "OpenAI"
  };
}

function usdPer1mToTargetCentsPer1m(usdPer1m: number, conversion: ProviderPriceConversion) {
  if (!Number.isFinite(usdPer1m) || usdPer1m <= 0) return 0;
  return Math.ceil(usdPer1m * conversion.usdToTargetRate * conversion.markupMultiplier * 100);
}

function displayNameForOpenAiModel(modelId: string, entry: OpenAiCatalogEntry) {
  if (modelId === entry.id) return entry.displayName;
  return modelId
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bGpt\b/g, "GPT")
    .replace(/\bMini\b/g, "Mini")
    .replace(/\bNano\b/g, "Nano");
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
