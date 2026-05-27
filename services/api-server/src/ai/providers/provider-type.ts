export type CanonicalModelProviderType =
  | "aws_bedrock"
  | "google_vertex_ai"
  | "openai"
  | "anthropic"
  | "gemini"
  | "openai_compatible"
  | "azure_openai";

const aliases: Record<string, CanonicalModelProviderType> = {
  vertex_ai: "google_vertex_ai",
  google_vertex: "google_vertex_ai",
  openai_official: "openai",
  openai_api: "openai",
  anthropic_api: "anthropic",
  claude: "anthropic",
  google_ai: "gemini",
  google_gemini: "gemini",
  gemini_api: "gemini"
};

export function normalizeAiProviderType(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return aliases[normalized] ?? normalized;
}

export function isCredentialRequiredForModelSync(providerType: unknown) {
  return ["google_vertex_ai", "openai", "anthropic", "gemini"].includes(normalizeAiProviderType(providerType));
}

