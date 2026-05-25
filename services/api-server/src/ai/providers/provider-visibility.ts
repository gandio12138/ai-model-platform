const defaultEnabledProviderTypes = ["google_vertex_ai", "vertex_ai", "google_vertex"];

export function normalizeProviderTypeForVisibility(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "vertex_ai" || normalized === "google_vertex") return "google_vertex_ai";
  return normalized;
}

export function enabledModelProviderTypes(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.ENABLED_MODEL_PROVIDER_TYPES ?? env.MODEL_PROVIDER_TYPES;
  const values = configured
    ? configured.split(",").map((item) => item.trim()).filter(Boolean)
    : defaultEnabledProviderTypes;
  const disabled = new Set(
    String(env.DISABLED_MODEL_PROVIDER_TYPES ?? "aws_bedrock")
      .split(",")
      .map((item) => normalizeProviderTypeForVisibility(item))
      .filter(Boolean)
  );
  return [...new Set(values.map((item) => normalizeProviderTypeForVisibility(item)).filter(Boolean))]
    .filter((item) => !disabled.has(item));
}

export function isModelProviderTypeEnabled(providerType: unknown, env: NodeJS.ProcessEnv = process.env) {
  const normalized = normalizeProviderTypeForVisibility(providerType);
  return enabledModelProviderTypes(env).includes(normalized);
}
