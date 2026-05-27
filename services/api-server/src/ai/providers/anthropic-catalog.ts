import { ProviderPriceConversion, ProviderPriceCurrency } from "./fx-rate.js";
import { ProviderCredentialConfig } from "./types.js";

export interface AnthropicListedModel {
  id: string;
  type?: string;
  display_name?: string;
  created_at?: string;
}

export interface AnthropicModelListResult {
  rows: AnthropicListedModel[];
  tokenSource: "provider_credential";
}

export interface AnthropicResolvedPricing {
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
  sourceProviderName: "Anthropic";
  billingUnit: "token_1m";
  unitUsdPrice?: null;
  unitPriceCents?: null;
  unitLabel?: null;
  priceDisplay?: string | null;
}

export interface AnthropicModelMetadata {
  id: string;
  aliases: string[];
  displayName: string;
  inputUsdPer1m: number;
  outputUsdPer1m: number;
  cacheReadUsdPer1m: number;
  cacheWriteUsdPer1m: number;
  maxContextTokens: number;
  defaultMaxOutputTokens: number;
  sourceUrl: string;
  fetchedAt: string;
}

export interface AnthropicCatalogSyncItem {
  publicModelCode: string;
  providerModelCode: string;
  displayName: string;
  providerName: "Anthropic";
  modelFamily: "Claude";
  inputModalities: string[];
  outputModalities: string[];
  inferenceTypesSupported: string[];
  supportsStream: boolean;
  supportsTools: boolean;
  sourceModelId: string;
  invocationType: "anthropic_api";
  maxContextTokens: number | null;
  defaultMaxOutputTokens: number | null;
  pricing: AnthropicResolvedPricing | null;
  raw: Record<string, unknown>;
}

export async function fetchAnthropicModels(input: {
  credential?: ProviderCredentialConfig | null;
  baseUrl?: string | null;
  anthropicVersion?: string | null;
  timeoutMs?: number | null;
  fetchFn?: typeof fetch;
}): Promise<AnthropicModelListResult> {
  const apiKey = resolveAnthropicApiKey(input.credential);
  if (!apiKey) throw new Error("Anthropic API key is not configured");
  const rows: AnthropicListedModel[] = [];
  let afterId = "";
  const timeoutMs = Number(input.timeoutMs ?? 30000);
  const fetchFn = input.fetchFn ?? fetch;
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`${normalizeAnthropicBaseUrl(input.baseUrl)}/models`);
    url.searchParams.set("limit", "1000");
    if (afterId) url.searchParams.set("after_id", afterId);
    const response = await fetchFn(url, {
      headers: anthropicHeaders(apiKey, input.anthropicVersion),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const json = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || json.error) {
      throw new Error(`Anthropic models request failed: ${response.status} ${json.error?.message ?? response.statusText}`);
    }
    const pageRows = Array.isArray(json.data)
      ? json.data
          .map((item: any) => ({ ...item, id: String(item.id ?? "") }))
          .filter((item: AnthropicListedModel) => item.id)
      : [];
    rows.push(...pageRows);
    if (!json.has_more || !json.last_id || pageRows.length === 0) break;
    afterId = String(json.last_id);
  }
  return {
    rows: [...new Map(rows.map((row) => [row.id, row])).values()],
    tokenSource: "provider_credential"
  };
}

export function buildAnthropicCatalogSyncItems(
  models: AnthropicListedModel[],
  options: {
    conversion: ProviderPriceConversion;
    priceVersion?: string;
    metadataByModelId: Map<string, AnthropicModelMetadata>;
  }
): AnthropicCatalogSyncItem[] {
  const selected = new Map<string, { model: AnthropicListedModel; entry: AnthropicModelMetadata }>();
  for (const model of [...new Map(models.map((item) => [item.id, item])).values()].sort((left, right) => left.id.localeCompare(right.id))) {
    const entry = resolveAnthropicCatalogEntry(model.id, options.metadataByModelId);
    if (!entry) continue;
    const publicModelCode = canonicalAnthropicPublicModelCode(model.id, entry);
    const current = selected.get(publicModelCode);
    if (!current || shouldPreferAnthropicListedModel(model.id, current.model.id, entry)) {
      selected.set(publicModelCode, { model, entry });
    }
  }

  const items: AnthropicCatalogSyncItem[] = [];
  for (const [publicModelCode, { model, entry }] of [...selected.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const pricing = resolveAnthropicPricing(entry, options);
    items.push({
      publicModelCode,
      providerModelCode: model.id,
      displayName: entry.displayName,
      providerName: "Anthropic",
      modelFamily: "Claude",
      inputModalities: ["TEXT"],
      outputModalities: ["TEXT"],
      inferenceTypesSupported: ["ANTHROPIC_MESSAGES"],
      supportsStream: true,
      supportsTools: false,
      sourceModelId: model.id,
      invocationType: "anthropic_api",
      maxContextTokens: entry.maxContextTokens,
      defaultMaxOutputTokens: entry.defaultMaxOutputTokens,
      pricing,
      raw: {
        source: "anthropic",
        source_model_id: model.id,
        canonical_model_key: publicModelCode,
        model_company: "Anthropic",
        model_category: "text_chat",
        provider_name: "Anthropic",
        created_at: model.created_at ?? null,
        context_source: "anthropic_official_model_docs",
        price_source: "anthropic_official_model_docs",
        metadata_source_url: entry.sourceUrl,
        metadata_fetched_at: entry.fetchedAt,
        tools_status: "unverified"
      }
    });
  }
  return items;
}

export async function fetchAnthropicOfficialModelMetadataCatalog(input: {
  overviewUrl?: string | null;
  timeoutMs?: number | null;
  fetchFn?: typeof fetch;
} = {}) {
  const sourceUrl = String(input.overviewUrl ?? "https://docs.anthropic.com/en/docs/about-claude/models/overview");
  const fetchFn = input.fetchFn ?? fetch;
  const response = await fetchFn(sourceUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "OneTokenModelSync/1.0 (+https://xufongnian.xyz)"
    },
    signal: AbortSignal.timeout(Number(input.timeoutMs ?? 30000))
  });
  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic model metadata request failed: ${response.status} ${response.statusText}`);
  }
  return buildAnthropicMetadataMap(parseAnthropicOfficialModelOverview(html, sourceUrl));
}

export function parseAnthropicOfficialModelOverview(html: string, sourceUrl = "https://docs.anthropic.com/en/docs/about-claude/models/overview") {
  const fetchedAt = new Date().toISOString();
  const entries: AnthropicModelMetadata[] = [];
  for (const tableHtml of String(html ?? "").match(/<table[\s\S]*?<\/table>/giu) ?? []) {
    const rows = parseHtmlTableRows(tableHtml);
    if (rows.length < 2) continue;
    const header = rows[0];
    const labels = rows.slice(1).map((row) => normalizeLabel(row[0]));
    if (!labels.includes("claude api id")) continue;
    const columns = header.slice(1).map((displayName) => ({ displayName }));
    for (const row of rows.slice(1)) {
      const label = normalizeLabel(row[0]);
      for (let index = 1; index < row.length; index += 1) {
        const column = columns[index - 1];
        if (!column) continue;
        const value = row[index] ?? "";
        if (label === "claude api id") (column as any).id = firstCodeLikeToken(value);
        if (label === "claude api alias") (column as any).alias = firstCodeLikeToken(value);
        if (label === "pricing") {
          (column as any).inputUsdPer1m = parseLabeledUsdPerMtok(value, "input");
          (column as any).outputUsdPer1m = parseLabeledUsdPerMtok(value, "output");
        }
        if (label === "context window") (column as any).maxContextTokens = parseTokenWindow(value);
        if (label === "max output") (column as any).defaultMaxOutputTokens = parseTokenWindow(value);
      }
    }
    for (const column of columns as Array<Record<string, unknown>>) {
      const id = String(column.id ?? "").trim();
      const displayName = String(column.displayName ?? "").trim();
      const inputUsdPer1m = numberOrNull(column.inputUsdPer1m);
      const outputUsdPer1m = numberOrNull(column.outputUsdPer1m);
      const maxContextTokens = integerOrNull(column.maxContextTokens);
      const defaultMaxOutputTokens = integerOrNull(column.defaultMaxOutputTokens);
      if (!id || !displayName || inputUsdPer1m === null || outputUsdPer1m === null || !maxContextTokens || !defaultMaxOutputTokens) {
        continue;
      }
      const alias = String(column.alias ?? "").trim();
      entries.push({
        id,
        aliases: alias && alias !== id ? [alias] : [],
        displayName: displayName.replace(/\s*\(\s*deprecated\s*\)\s*$/iu, "").trim(),
        inputUsdPer1m,
        outputUsdPer1m,
        cacheReadUsdPer1m: inputUsdPer1m * 0.1,
        cacheWriteUsdPer1m: inputUsdPer1m * 1.25,
        maxContextTokens,
        defaultMaxOutputTokens,
        sourceUrl,
        fetchedAt
      });
    }
  }
  entries.push(...parseAnthropicSerializedModelTables(html, sourceUrl, fetchedAt));
  return dedupeAnthropicMetadata(entries);
}

export function buildAnthropicMetadataMap(entries: AnthropicModelMetadata[]) {
  const map = new Map<string, AnthropicModelMetadata>();
  for (const entry of entries) {
    map.set(entry.id, entry);
    for (const alias of entry.aliases) {
      map.set(alias, entry);
    }
  }
  return map;
}

export function resolveAnthropicCatalogEntry(modelId: string, metadataByModelId: Map<string, AnthropicModelMetadata>) {
  const normalized = String(modelId ?? "").trim();
  if (!normalized) return null;
  return metadataByModelId.get(normalized) ?? metadataByModelId.get(normalized.replace(/-latest$/u, "")) ?? null;
}

export function canonicalAnthropicPublicModelCode(modelId: string, entry: AnthropicModelMetadata) {
  const exact = String(modelId ?? "").trim();
  const stableAlias = entry.aliases.find((alias) => alias && !/-latest$/u.test(alias));
  return stableAlias || entry.id || exact;
}

export function resolveAnthropicApiKey(credential?: ProviderCredentialConfig | null) {
  const secret = String(credential?.decryptedSecret ?? "").trim();
  if (!secret) return "";
  if (!secret.startsWith("{")) return secret;
  try {
    const parsed = JSON.parse(secret) as Record<string, unknown>;
    return String(parsed.api_key ?? parsed.apiKey ?? parsed.key ?? parsed.token ?? parsed.anthropic_api_key ?? "").trim();
  } catch {
    return secret;
  }
}

export function normalizeAnthropicBaseUrl(baseUrl?: string | null) {
  const value = String(baseUrl ?? "https://api.anthropic.com/v1").trim().replace(/\/+$/u, "");
  if (!value) return "https://api.anthropic.com/v1";
  return /\/v1$/u.test(value) ? value : `${value}/v1`;
}

export function anthropicHeaders(apiKey: string, anthropicVersion?: string | null) {
  return {
    "x-api-key": apiKey,
    "anthropic-version": String(anthropicVersion ?? "2023-06-01"),
    "content-type": "application/json"
  };
}

function resolveAnthropicPricing(
  entry: AnthropicModelMetadata,
  options: { conversion: ProviderPriceConversion; priceVersion?: string }
): AnthropicResolvedPricing {
  return {
    priceVersion: options.priceVersion ?? `anthropic-official-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
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
    sourceProviderName: "Anthropic",
    billingUnit: "token_1m",
    unitUsdPrice: null,
    unitPriceCents: null,
    unitLabel: null,
    priceDisplay: `Input $${entry.inputUsdPer1m}/1M tokens, output $${entry.outputUsdPer1m}/1M tokens`
  };
}

function parseHtmlTableRows(tableHtml: string) {
  const rows: string[][] = [];
  for (const rowMatch of tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/giu)) {
    const cells = [...rowMatch[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/giu)]
      .map((match) => htmlToPlainText(match[1]))
      .map((cell) => cell.trim());
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function parseAnthropicSerializedModelTables(html: string, sourceUrl: string, fetchedAt: string) {
  const entries: AnthropicModelMetadata[] = [];
  const positions = [...String(html ?? "").matchAll(/Claude API ID/gu)].map((match) => match.index ?? 0);
  for (const position of positions) {
    const block = String(html).slice(Math.max(0, position - 6000), Math.min(String(html).length, position + 120000));
    const base = block.indexOf("Claude API ID");
    if (base < 0) continue;
    const idSegment = sliceBetweenLabels(block, base, "Claude API ID", "Claude API alias");
    const aliasSegment = sliceBetweenLabels(block, base, "Claude API alias", "AWS Bedrock ID");
    const pricingSegment = sliceBetweenLabels(block, base, "Pricing", "Extended thinking");
    const contextSegment = sliceBetweenLabels(block, base, "Context window", "Max output");
    const outputSegment = sliceBetweenLabels(block, base, "Max output", "Reliable knowledge cutoff");
    const ids = extractClaudeModelIds(idSegment);
    const aliases = extractClaudeModelIds(aliasSegment);
    const prices = extractAnthropicPricingCells(pricingSegment);
    const contexts = extractTokenWindows(contextSegment);
    const outputs = extractTokenWindows(outputSegment);
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const price = prices[index];
      const maxContextTokens = contexts[index];
      const defaultMaxOutputTokens = outputs[index];
      if (!id || !price || !maxContextTokens || !defaultMaxOutputTokens) continue;
      const alias = aliases[index] && aliases[index] !== id ? aliases[index] : "";
      entries.push({
        id,
        aliases: alias ? [alias] : [],
        displayName: displayNameFromAnthropicModelId(id),
        inputUsdPer1m: price.inputUsdPer1m,
        outputUsdPer1m: price.outputUsdPer1m,
        cacheReadUsdPer1m: price.inputUsdPer1m * 0.1,
        cacheWriteUsdPer1m: price.inputUsdPer1m * 1.25,
        maxContextTokens,
        defaultMaxOutputTokens,
        sourceUrl,
        fetchedAt
      });
    }
  }
  return entries;
}

function sliceBetweenLabels(value: string, fromIndex: number, startLabel: string, endLabel: string) {
  const start = value.indexOf(startLabel, fromIndex);
  if (start < 0) return "";
  const end = value.indexOf(endLabel, start + startLabel.length);
  return value.slice(start, end >= 0 ? end : undefined);
}

function extractClaudeModelIds(value: string) {
  return [...new Set(
    [...String(value ?? "").matchAll(/claude-[a-z0-9-]+(?:@\d+)?/giu)]
      .map((match) => String(match[0] ?? "").trim())
      .filter((id) => /^claude-[a-z0-9-]+(?:@\d+)?$/iu.test(id))
      .filter((id) => !/-v\d+$/iu.test(id))
  )];
}

function extractAnthropicPricingCells(value: string) {
  const cells: Array<{ inputUsdPer1m: number; outputUsdPer1m: number }> = [];
  const pattern = /\$\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*input\s*MTok[\s\S]{0,400}?\$\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*output\s*MTok/giu;
  for (const match of String(value ?? "").matchAll(pattern)) {
    const inputUsdPer1m = Number(match[1]);
    const outputUsdPer1m = Number(match[2]);
    if (Number.isFinite(inputUsdPer1m) && inputUsdPer1m > 0 && Number.isFinite(outputUsdPer1m) && outputUsdPer1m > 0) {
      cells.push({ inputUsdPer1m, outputUsdPer1m });
    }
  }
  return cells;
}

function extractTokenWindows(value: string) {
  const tokens: number[] = [];
  for (const match of String(value ?? "").matchAll(/(?:children\\?":\\?"|>)([0-9]+(?:\.[0-9]+)?\s*[MkK]?\s*tokens?)/giu)) {
    const parsed = parseTokenWindow(match[1] ?? "");
    if (parsed) tokens.push(parsed);
  }
  return tokens;
}

function htmlToPlainText(html: string) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/giu, "\n")
    .replace(/<style[\s\S]*?<\/style>/giu, "\n")
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/(div|p|li|h[1-6]|section|article|tr|td|th|span|strong|a)>/giu, "\n")
    .replace(/<sup[\s\S]*?<\/sup>/giu, "")
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

function normalizeLabel(value: string) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().toLowerCase();
}

function firstCodeLikeToken(value: string) {
  return String(value ?? "")
    .split(/\s+/u)
    .map((token) => token.trim())
    .find((token) => /^claude-[a-z0-9-]+(?:@\d+)?$/iu.test(token)) ?? "";
}

function parseLabeledUsdPerMtok(value: string, label: "input" | "output") {
  const match = new RegExp(`\\$\\s*([0-9]+(?:\\.[0-9]+)?)\\s*\\/\\s*${label}\\s*MTok`, "iu").exec(value);
  if (!match?.[1]) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseTokenWindow(value: string) {
  const text = String(value ?? "").replace(/,/gu, "");
  const million = /([0-9]+(?:\.[0-9]+)?)\s*M\s*tokens?/iu.exec(text);
  if (million?.[1]) return Math.round(Number(million[1]) * 1_000_000);
  const thousand = /([0-9]+(?:\.[0-9]+)?)\s*k\s*tokens?/iu.exec(text);
  if (thousand?.[1]) return Math.round(Number(thousand[1]) * 1_000);
  const plain = /([0-9]+)\s*tokens?/iu.exec(text);
  if (plain?.[1]) return Number(plain[1]);
  return null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function integerOrNull(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function usdPer1mToTargetCentsPer1m(usdPer1m: number, conversion: ProviderPriceConversion) {
  if (!Number.isFinite(usdPer1m) || usdPer1m <= 0) return 0;
  return Math.ceil(usdPer1m * conversion.usdToTargetRate * conversion.markupMultiplier * 100);
}

function displayNameFromAnthropicModelId(modelId: string) {
  const parts = String(modelId ?? "")
    .replace(/@\d+$/u, "")
    .split("-")
    .filter(Boolean)
    .filter((part) => !/^\d{8}$/u.test(part));
  if (parts[0]?.toLowerCase() !== "claude") {
    return parts.map(titleWord).join(" ");
  }
  const familyNames = new Set(["opus", "sonnet", "haiku"]);
  if (familyNames.has(String(parts[1] ?? "").toLowerCase())) {
    const family = titleWord(parts[1]);
    const version = compactVersionParts(parts.slice(2));
    return ["Claude", family, version].filter(Boolean).join(" ");
  }
  const familyIndex = parts.findIndex((part) => familyNames.has(part.toLowerCase()));
  if (familyIndex > 1) {
    const family = titleWord(parts[familyIndex]);
    const version = compactVersionParts(parts.slice(1, familyIndex));
    const suffix = parts.slice(familyIndex + 1).map(titleWord).join(" ");
    return ["Claude", family, version, suffix].filter(Boolean).join(" ");
  }
  return parts.map(titleWord).join(" ");
}

function compactVersionParts(parts: string[]) {
  const values = parts.filter(Boolean);
  const numeric: string[] = [];
  const rest: string[] = [];
  for (const part of values) {
    if (/^\d+$/u.test(part) && rest.length === 0) {
      numeric.push(part);
    } else {
      rest.push(part);
    }
  }
  return [numeric.length ? numeric.join(".") : "", ...rest.map(titleWord)].filter(Boolean).join(" ");
}

function titleWord(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function shouldPreferAnthropicListedModel(candidateId: string, currentId: string, entry: AnthropicModelMetadata) {
  if (candidateId === entry.id && currentId !== entry.id) return true;
  if (candidateId !== entry.id && currentId === entry.id) return false;
  return candidateId.localeCompare(currentId) > 0;
}

function dedupeAnthropicMetadata(entries: AnthropicModelMetadata[]) {
  const byId = new Map<string, AnthropicModelMetadata>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}
