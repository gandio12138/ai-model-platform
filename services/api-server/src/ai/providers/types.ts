export type ProviderChatRole = "system" | "user" | "assistant";

export interface ProviderChatMessage {
  role: ProviderChatRole;
  content: string;
}

export interface ProviderCredentialConfig {
  id?: string | null;
  credentialType?: string | null;
  authMethod?: string | null;
  decryptedSecret?: string | null;
  secretLast4?: string | null;
  awsRegion?: string | null;
  endpointUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ProviderConfig {
  id?: string | null;
  name?: string | null;
  providerType: string;
  region?: string | null;
  endpoint?: string | null;
  timeoutMs?: number | null;
  retryCount?: number | null;
  metadata?: Record<string, unknown> | null;
  credential?: ProviderCredentialConfig | null;
}

export interface ProviderCompletionInput {
  publicModelCode: string;
  providerModelCode: string;
  messages: ProviderChatMessage[];
  maxTokens: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
}

export interface ProviderImageGenerationInput {
  publicModelCode: string;
  providerModelCode: string;
  prompt: string;
  n: number;
  size?: string | null;
  aspectRatio?: string | null;
}

export interface ProviderImageGenerationResult {
  images: Array<{
    b64Json?: string | null;
    url?: string | null;
    mimeType?: string | null;
    revisedPrompt?: string | null;
  }>;
  providerRequestId?: string | null;
  usage: ProviderTokenUsage;
  metadata?: Record<string, unknown>;
}

export interface ProviderVideoGenerationInput {
  publicModelCode: string;
  providerModelCode: string;
  prompt: string;
  n: number;
  durationSeconds: number;
  aspectRatio?: string | null;
  outputGcsUri?: string | null;
}

export interface ProviderVideoGenerationResult {
  operationName: string;
  status: "submitted";
  providerRequestId?: string | null;
  usage: ProviderTokenUsage;
  metadata?: Record<string, unknown>;
}

export interface ProviderTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  source: "bedrock" | "vertex_ai" | "openai" | "fake_provider" | "estimated";
  estimated?: boolean;
}

export interface ProviderCompletionResult {
  content: string;
  finishReason?: string | null;
  providerRequestId?: string | null;
  usage: ProviderTokenUsage;
  metadata?: Record<string, unknown>;
}

export interface ProviderStreamChunk {
  delta?: string;
  done?: boolean;
  finishReason?: string | null;
  usage?: ProviderTokenUsage;
  providerRequestId?: string | null;
}

export interface ProviderHealthCheckInput {
  provider: ProviderConfig;
  modelId?: string | null;
}

export interface ProviderHealthCheckResult {
  ok: boolean;
  providerType: string;
  region?: string | null;
  credentialValid: boolean;
  regionAccessible: boolean;
  modelCallable: boolean;
  latencyMs?: number | null;
  message: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  checkedAt: string;
}

export interface ProviderToolValidationInput {
  provider: ProviderConfig;
  publicModelCode: string;
  providerModelCode: string;
}

export interface ProviderToolValidationResult {
  ok: boolean;
  status: "supported" | "unsupported" | "unverified";
  providerType: string;
  providerRequestId?: string | null;
  latencyMs?: number | null;
  message: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  checkedAt: string;
}

export interface ProviderAdapter {
  readonly type: string;
  complete(provider: ProviderConfig, input: ProviderCompletionInput): Promise<ProviderCompletionResult>;
  stream(provider: ProviderConfig, input: ProviderCompletionInput): AsyncIterable<ProviderStreamChunk>;
  validateCredentials(input: ProviderHealthCheckInput): Promise<ProviderHealthCheckResult>;
  validateToolUse?(input: ProviderToolValidationInput): Promise<ProviderToolValidationResult>;
  generateImage?(provider: ProviderConfig, input: ProviderImageGenerationInput): Promise<ProviderImageGenerationResult>;
  generateVideo?(provider: ProviderConfig, input: ProviderVideoGenerationInput): Promise<ProviderVideoGenerationResult>;
}
