import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enabledModelProviderTypes, isModelProviderTypeEnabled } from "./provider-visibility.js";

describe("provider visibility", () => {
  it("defaults to Google Vertex AI, OpenAI, Anthropic and Gemini, and keeps AWS Bedrock disabled", () => {
    assert.deepEqual(enabledModelProviderTypes({}), ["google_vertex_ai", "openai", "anthropic", "gemini"]);
    assert.equal(isModelProviderTypeEnabled("google_vertex_ai", {}), true);
    assert.equal(isModelProviderTypeEnabled("vertex_ai", {}), true);
    assert.equal(isModelProviderTypeEnabled("openai", {}), true);
    assert.equal(isModelProviderTypeEnabled("anthropic", {}), true);
    assert.equal(isModelProviderTypeEnabled("google_ai", {}), true);
    assert.equal(isModelProviderTypeEnabled("gemini_api", {}), true);
    assert.equal(isModelProviderTypeEnabled("aws_bedrock", {}), false);
  });

  it("can enable additional providers with explicit env configuration", () => {
    const env = {
      ENABLED_MODEL_PROVIDER_TYPES: "google_vertex_ai,aws_bedrock",
      DISABLED_MODEL_PROVIDER_TYPES: ""
    };
    assert.deepEqual(enabledModelProviderTypes(env), ["google_vertex_ai", "aws_bedrock"]);
    assert.equal(isModelProviderTypeEnabled("aws_bedrock", env), true);
  });
});
