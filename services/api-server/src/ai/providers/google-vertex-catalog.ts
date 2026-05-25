import { resolveGoogleVertexAccessToken } from "./google-vertex-auth.js";
import { ProviderPriceConversion, ProviderPriceCurrency } from "./fx-rate.js";
import { ProviderCredentialConfig } from "./types.js";

export type VertexModelCategory = "text_chat" | "embedding" | "image" | "video" | "audio" | "deploy_only";

export interface VertexResolvedPricing {
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

export interface VertexModelContext {
  maxContextTokens: number | null;
  defaultMaxOutputTokens: number | null;
  contextSource: "catalog_rule" | "admin_required";
}

export interface VertexPublisherModel {
  region: string;
  publisher: string;
  name: string;
  displayName?: string;
  versionId?: string;
  launchStage?: string;
  supportedActions?: Record<string, unknown>;
}

export interface VertexCatalogSyncItem {
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
  invocationType: "vertex_managed_api";
  maxContextTokens: number | null;
  defaultMaxOutputTokens: number | null;
  pricing: VertexResolvedPricing | null;
  raw: Record<string, unknown>;
}

export interface VertexRuntimeValidationResult {
  providerModelCode: string;
  status: "verified" | "unavailable" | "not_checked";
  httpStatus?: number;
  totalTokens?: number | null;
  errorMessage?: string | null;
  checkedAt: string;
}

interface VertexUsdPer1mPrice {
  inputUsdPer1m: number;
  outputUsdPer1m: number;
  cacheReadUsdPer1m?: number;
  cacheWriteUsdPer1m?: number;
}

export const defaultVertexPublishers = ["google", "anthropic", "mistralai", "xai", "meta"];
export const defaultVertexRegions = ["global", "us-central1", "us-east5"];

export async function fetchGoogleVertexPublisherModels(input: {
  projectId: string;
  publishers?: string[];
  regions?: string[];
  credential?: ProviderCredentialConfig | null;
}) {
  if (!input.projectId) throw new Error("GCP project id is required for Vertex model sync");
  const token = await resolveGoogleVertexAccessToken(input.credential ?? null);
  const publishers = input.publishers?.length ? input.publishers : defaultVertexPublishers;
  const regions = input.regions?.length ? input.regions : defaultVertexRegions;
  const rows: VertexPublisherModel[] = [];
  const errors: Array<{ region: string; publisher: string; message: string }> = [];
  for (const region of regions) {
    const base = region === "global"
      ? "https://aiplatform.googleapis.com/v1beta1"
      : `https://${region}-aiplatform.googleapis.com/v1beta1`;
    for (const publisher of publishers) {
      let pageToken = "";
      do {
        const url = new URL(`${base}/publishers/${encodeURIComponent(publisher)}/models`);
        url.searchParams.set("pageSize", "200");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        let response: Response;
        try {
          response = await fetch(url, {
            headers: {
              authorization: `Bearer ${token.accessToken}`,
              "x-goog-user-project": input.projectId
            },
            signal: AbortSignal.timeout(20000)
          });
        } catch (error) {
          errors.push({
            region,
            publisher,
            message: error instanceof Error ? error.message : String(error)
          });
          break;
        }
        const json = (await response.json().catch(() => ({}))) as any;
        if (!response.ok || json.error) {
          errors.push({
            region,
            publisher,
            message: String(json.error?.message ?? `${response.status} ${response.statusText}`)
          });
          break;
        }
        for (const model of json.publisherModels ?? []) {
          rows.push({ region, publisher, ...model });
        }
        pageToken = String(json.nextPageToken ?? "");
      } while (pageToken);
    }
  }
  return { rows, errors, tokenSource: token.source };
}

export async function validateGoogleVertexRuntimeModels(input: {
  projectId: string;
  credential?: ProviderCredentialConfig | null;
  items: VertexCatalogSyncItem[];
  maxModels?: number;
}) {
  const token = await resolveGoogleVertexAccessToken(input.credential ?? null);
  const maxModels = Math.max(0, Number(input.maxModels ?? input.items.length));
  const results = new Map<string, VertexRuntimeValidationResult>();
  const checkedAt = new Date().toISOString();
  for (const item of input.items.slice(0, maxModels)) {
    const publisher = String(item.raw.publisher ?? "").toLowerCase();
    const runtimeAdapter = String(item.raw.runtime_adapter ?? "");
    if (publisher !== "google" || runtimeAdapter !== "gemini_generate_content") {
      results.set(item.providerModelCode, {
        providerModelCode: item.providerModelCode,
        status: "not_checked",
        checkedAt
      });
      continue;
    }
    const location = String(item.raw.preferred_region ?? "global");
    const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${encodeURIComponent(input.projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(item.providerModelCode)}:countTokens`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          "x-goog-user-project": input.projectId,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ok" }] }]
        }),
        signal: AbortSignal.timeout(15000)
      });
      const json = (await response.json().catch(() => ({}))) as any;
      results.set(item.providerModelCode, {
        providerModelCode: item.providerModelCode,
        status: response.ok && !json.error ? "verified" : "unavailable",
        httpStatus: response.status,
        totalTokens: json.totalTokens ?? null,
        errorMessage: json.error?.message ? String(json.error.message).slice(0, 500) : null,
        checkedAt
      });
    } catch (error) {
      results.set(item.providerModelCode, {
        providerModelCode: item.providerModelCode,
        status: "unavailable",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        checkedAt
      });
    }
  }
  return results;
}

export function buildGoogleVertexCatalogSyncItems(
  models: VertexPublisherModel[],
  options: {
    conversion: ProviderPriceConversion;
    priceVersion?: string;
    includeUnsupportedRuntime?: boolean;
  }
): VertexCatalogSyncItem[] {
  const unique = dedupePublisherModels(models);
  const items: VertexCatalogSyncItem[] = [];
  for (const model of unique) {
    const modelId = extractVertexModelId(model.name);
    const category = resolveVertexModelCategory(model);
    const runtime = resolveVertexRuntime(model.publisher, modelId, model.versionId);
    const context = resolveGoogleVertexModelContext(model.publisher, modelId, category);
    const pricing = resolveGoogleVertexPricing(model.publisher, modelId, {
      region: preferredPriceRegion(model),
      conversion: options.conversion,
      priceVersion: options.priceVersion
    });
    if (category !== "text_chat") continue;
    if (!runtime.supported && !options.includeUnsupportedRuntime) continue;
    if (!pricing || !context.maxContextTokens) continue;
    items.push({
      publicModelCode: canonicalVertexPublicModelCode(model.publisher, modelId),
      providerModelCode: runtime.providerModelCode,
      displayName: displayNameForVertexModel(model.publisher, modelId, model.displayName),
      providerName: vertexProviderDisplayName(model.publisher),
      modelFamily: vertexProviderDisplayName(model.publisher),
      inputModalities: ["TEXT"],
      outputModalities: ["TEXT"],
      inferenceTypesSupported: ["MANAGED_API"],
      supportsStream: true,
      supportsTools: runtime.supportsTools,
      sourceModelId: modelId,
      invocationType: "vertex_managed_api",
      maxContextTokens: context.maxContextTokens,
      defaultMaxOutputTokens: context.defaultMaxOutputTokens,
      pricing,
      raw: {
        source: "google_vertex_ai",
        source_model_id: modelId,
        canonical_model_key: canonicalVertexPublicModelCode(model.publisher, modelId),
        model_company: vertexProviderDisplayName(model.publisher),
        model_category: category,
        provider_name: vertexProviderDisplayName(model.publisher),
        publisher: model.publisher,
        regions: model.regions,
        preferred_region: preferredRegion(model),
        version_id: model.versionId ?? null,
        launch_stage: model.launchStage ?? null,
        supported_actions: model.supportedActions ? Object.keys(model.supportedActions) : [],
        context_source: context.contextSource,
        runtime_adapter: runtime.adapter,
        tools_status: "unverified"
      }
    });
  }
  return items;
}

function dedupePublisherModels(models: VertexPublisherModel[]) {
  const map = new Map<string, VertexPublisherModel & { regions: string[] }>();
  for (const model of models) {
    const modelId = extractVertexModelId(model.name);
    if (!modelId) continue;
    const key = `${model.publisher}:${modelId}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...model, regions: [model.region] });
    } else if (!current.regions.includes(model.region)) {
      current.regions.push(model.region);
      if (regionRank(model.region) < regionRank(current.region)) {
        current.region = model.region;
      }
    }
  }
  return [...map.values()].sort((left, right) =>
    `${left.publisher}:${extractVertexModelId(left.name)}`.localeCompare(`${right.publisher}:${extractVertexModelId(right.name)}`)
  );
}

export function extractVertexModelId(name: string) {
  return String(name ?? "").split("/").pop() ?? "";
}

export function canonicalVertexPublicModelCode(publisher: string, modelId: string) {
  if (publisher === "google") return modelId;
  return modelId;
}

function preferredRegion(model: VertexPublisherModel & { regions?: string[] }) {
  const regions = model.regions?.length ? model.regions : [model.region];
  return [...regions].sort((left, right) => regionRank(left) - regionRank(right))[0] ?? model.region ?? "global";
}

function preferredPriceRegion(model: VertexPublisherModel & { regions?: string[] }) {
  const region = preferredRegion(model);
  return region === "global" ? "global" : region;
}

function regionRank(region: string) {
  if (region === "global") return 0;
  if (region === "us-central1") return 1;
  if (region === "us-east5") return 2;
  return 10;
}

function resolveVertexRuntime(publisher: string, modelId: string, versionId?: string) {
  const normalized = modelId.toLowerCase();
  if (publisher === "google" && normalized.startsWith("gemini-")) {
    return { supported: true, adapter: "gemini_generate_content", providerModelCode: modelId, supportsTools: false };
  }
  if (publisher === "anthropic" && normalized.startsWith("claude-")) {
    return { supported: true, adapter: "anthropic_raw_predict", providerModelCode: withPublisherModelVersion(modelId, versionId), supportsTools: false };
  }
  if (publisher === "mistralai" && /mistral-(small|medium)|codestral/.test(normalized)) {
    return { supported: true, adapter: "mistral_raw_predict", providerModelCode: modelId, supportsTools: false };
  }
  return { supported: false, adapter: "unsupported", providerModelCode: modelId, supportsTools: false };
}

function withPublisherModelVersion(modelId: string, versionId?: string) {
  const version = String(versionId ?? "").trim();
  return version && version !== "default" ? `${modelId}@${version}` : modelId;
}

export function resolveVertexModelCategory(model: Pick<VertexPublisherModel, "publisher" | "name" | "supportedActions">): VertexModelCategory {
  const modelId = extractVertexModelId(model.name).toLowerCase();
  const actionKeys = Object.keys(model.supportedActions ?? {});
  if (actionKeys.includes("deploy") || actionKeys.includes("multiDeployVertex")) return "deploy_only";
  if (/embedding|text-embedding/.test(modelId)) return "embedding";
  if (/imagen|imagegeneration|image-|virtual-try-on/.test(modelId)) return "image";
  if (/veo|video/.test(modelId)) return "video";
  if (/chirp|lyria|audio|tts/.test(modelId)) return "audio";
  if (model.publisher === "google" && modelId.startsWith("gemini-")) {
    if (/embedding|image|tts|audio|live/.test(modelId)) return /embedding/.test(modelId) ? "embedding" : "audio";
    return "text_chat";
  }
  if (["anthropic", "mistralai", "xai"].includes(model.publisher)) return "text_chat";
  if (model.publisher === "meta" && /llama.*maas/.test(modelId)) return "text_chat";
  return "deploy_only";
}

export function resolveGoogleVertexModelContext(
  publisher: string,
  modelId: string,
  category: VertexModelCategory = "text_chat"
): VertexModelContext {
  if (category !== "text_chat") {
    return { maxContextTokens: null, defaultMaxOutputTokens: null, contextSource: "admin_required" };
  }
  const normalized = modelId.toLowerCase();
  if (publisher === "anthropic" && normalized.startsWith("claude-")) {
    return { maxContextTokens: 200000, defaultMaxOutputTokens: 8192, contextSource: "catalog_rule" };
  }
  if (publisher === "google" && normalized.startsWith("gemini-")) {
    if (/gemini-1\.5/.test(normalized)) return { maxContextTokens: 2000000, defaultMaxOutputTokens: 8192, contextSource: "catalog_rule" };
    if (/gemini-2\.0/.test(normalized)) return { maxContextTokens: 1048576, defaultMaxOutputTokens: 8192, contextSource: "catalog_rule" };
    return { maxContextTokens: 1048576, defaultMaxOutputTokens: 65536, contextSource: "catalog_rule" };
  }
  if (publisher === "mistralai") {
    return { maxContextTokens: 128000, defaultMaxOutputTokens: 8192, contextSource: "catalog_rule" };
  }
  return { maxContextTokens: null, defaultMaxOutputTokens: null, contextSource: "admin_required" };
}

export function resolveGoogleVertexPricing(
  publisher: string,
  modelId: string,
  options: { region: string; conversion: ProviderPriceConversion; priceVersion?: string }
): VertexResolvedPricing | null {
  const price = vertexUsdPer1mPrice(publisher, modelId, options.region);
  if (!price) return null;
  return {
    priceVersion: options.priceVersion ?? `google-vertex-${options.region}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
    currency: options.conversion.currency,
    sourceCurrency: "USD",
    sourceRegion: options.region,
    publicationDate: null,
    usdToTargetRate: options.conversion.usdToTargetRate,
    markupMultiplier: options.conversion.markupMultiplier,
    fxRateSource: options.conversion.fxRateSource,
    fxRateFetchedAt: options.conversion.fxRateFetchedAt,
    inputPricePer1mCents: usdPer1mToTargetCentsPer1m(price.inputUsdPer1m, options.conversion),
    outputPricePer1mCents: usdPer1mToTargetCentsPer1m(price.outputUsdPer1m, options.conversion),
    cacheReadPricePer1mCents: usdPer1mToTargetCentsPer1m(price.cacheReadUsdPer1m ?? 0, options.conversion),
    cacheWritePricePer1mCents: usdPer1mToTargetCentsPer1m(price.cacheWriteUsdPer1m ?? 0, options.conversion),
    inputUsdPer1k: price.inputUsdPer1m / 1000,
    outputUsdPer1k: price.outputUsdPer1m / 1000,
    cacheReadUsdPer1k: (price.cacheReadUsdPer1m ?? 0) / 1000,
    cacheWriteUsdPer1k: (price.cacheWriteUsdPer1m ?? 0) / 1000,
    sourceModelName: displayNameForVertexModel(publisher, modelId),
    sourceProviderName: vertexProviderDisplayName(publisher)
  };
}

function vertexUsdPer1mPrice(publisher: string, modelId: string, region: string): VertexUsdPer1mPrice | null {
  const normalized = modelId.toLowerCase();
  if (publisher === "google") return googleGeminiUsdPer1m(normalized);
  if (publisher === "anthropic") return anthropicUsdPer1m(normalized, region);
  if (publisher === "mistralai") return mistralUsdPer1m(normalized);
  return null;
}

function googleGeminiUsdPer1m(modelId: string): VertexUsdPer1mPrice | null {
  if (/gemini-3\.5-flash/.test(modelId)) return { inputUsdPer1m: 1.5, outputUsdPer1m: 9 };
  if (/gemini-3\.1-flash-lite/.test(modelId)) return { inputUsdPer1m: 0.25, outputUsdPer1m: 1.5 };
  if (/gemini-3-flash/.test(modelId)) return { inputUsdPer1m: 0.5, outputUsdPer1m: 3 };
  if (/gemini-2\.5-pro/.test(modelId)) return { inputUsdPer1m: 1.25, outputUsdPer1m: 10 };
  if (/gemini-2\.5-flash-lite/.test(modelId)) return { inputUsdPer1m: 0.1, outputUsdPer1m: 0.4 };
  if (/gemini-2\.5-flash/.test(modelId)) return { inputUsdPer1m: 0.3, outputUsdPer1m: 2.5 };
  if (/gemini-2\.0-flash-lite/.test(modelId)) return { inputUsdPer1m: 0.075, outputUsdPer1m: 0.3 };
  if (/gemini-2\.0-flash/.test(modelId)) return { inputUsdPer1m: 0.15, outputUsdPer1m: 0.6 };
  if (/gemini-1\.5-pro/.test(modelId)) return { inputUsdPer1m: 0.3125, outputUsdPer1m: 1.25 };
  return null;
}

function anthropicUsdPer1m(modelId: string, region: string): VertexUsdPer1mPrice | null {
  const regionalMultiplier = region !== "global" ? 1.1 : 1;
  if (/opus-4-[567]/.test(modelId)) return multiply({ inputUsdPer1m: 5, outputUsdPer1m: 25, cacheReadUsdPer1m: 0.5, cacheWriteUsdPer1m: 6.25 }, regionalMultiplier);
  if (/opus-4-1/.test(modelId)) return { inputUsdPer1m: 15, outputUsdPer1m: 75, cacheReadUsdPer1m: 1.5, cacheWriteUsdPer1m: 18.75 };
  if (/sonnet-4-[56]/.test(modelId)) return multiply({ inputUsdPer1m: 3, outputUsdPer1m: 15, cacheReadUsdPer1m: 0.3, cacheWriteUsdPer1m: 3.75 }, regionalMultiplier);
  if (/haiku-4-5/.test(modelId)) return multiply({ inputUsdPer1m: 1, outputUsdPer1m: 5, cacheReadUsdPer1m: 0.1, cacheWriteUsdPer1m: 1.25 }, regionalMultiplier);
  return null;
}

function mistralUsdPer1m(modelId: string): VertexUsdPer1mPrice | null {
  if (/mistral-medium-3/.test(modelId)) return { inputUsdPer1m: 0.4, outputUsdPer1m: 2 };
  if (/mistral-small-2503/.test(modelId)) return { inputUsdPer1m: 0.1, outputUsdPer1m: 0.3 };
  if (/codestral-2/.test(modelId)) return { inputUsdPer1m: 0.3, outputUsdPer1m: 0.9 };
  return null;
}

function multiply<T extends { inputUsdPer1m: number; outputUsdPer1m: number; cacheReadUsdPer1m?: number; cacheWriteUsdPer1m?: number }>(
  value: T,
  multiplier: number
) {
  return {
    inputUsdPer1m: value.inputUsdPer1m * multiplier,
    outputUsdPer1m: value.outputUsdPer1m * multiplier,
    cacheReadUsdPer1m: (value.cacheReadUsdPer1m ?? 0) * multiplier,
    cacheWriteUsdPer1m: (value.cacheWriteUsdPer1m ?? 0) * multiplier
  };
}

function usdPer1mToTargetCentsPer1m(
  usdPer1m: number,
  conversion: ProviderPriceConversion
) {
  if (!Number.isFinite(usdPer1m) || usdPer1m <= 0) return 0;
  return Math.ceil(usdPer1m * conversion.usdToTargetRate * conversion.markupMultiplier * 100);
}

function vertexProviderDisplayName(publisher: string) {
  const names: Record<string, string> = {
    google: "Google",
    anthropic: "Anthropic",
    mistralai: "Mistral AI",
    xai: "xAI",
    meta: "Meta"
  };
  return names[publisher] ?? publisher;
}

function displayNameForVertexModel(publisher: string, modelId: string, displayName?: string) {
  if (displayName?.trim()) return displayName.trim();
  const title = modelId
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bAi\b/g, "AI")
    .replace(/\b(Claude\s+(?:Opus|Sonnet|Haiku)\s+\d+)\s+(\d+)\b/i, "$1.$2");
  return title.replace(/^Google Gemini/i, "Gemini");
}
