import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PublicService } from "./public.service.js";

function modelCategory(row: Record<string, unknown>) {
  const service = new PublicService({} as any, {} as any);
  return (service as any).resolveModelCategory(row);
}

describe("PublicService model category resolution", () => {
  it("keeps multimodal text-output models in the text category", () => {
    assert.equal(
      modelCategory({
        public_model_code: "amazon.nova-lite-v1:0",
        display_name: "Nova Lite",
        model_family: "Amazon",
        modality: ["text"],
        model_metadata: {
          input_modalities: ["TEXT", "IMAGE", "VIDEO"],
          output_modalities: ["TEXT"],
          inference_types_supported: ["ON_DEMAND"]
        }
      }),
      "text_chat"
    );
  });

  it("classifies image and video generation by output modality", () => {
    assert.equal(
      modelCategory({
        public_model_code: "gemini-2.5-flash-image",
        display_name: "Gemini 2.5 Flash Image",
        model_family: "Google",
        model_metadata: {
          input_modalities: ["TEXT"],
          output_modalities: ["IMAGE"]
        }
      }),
      "image"
    );

    assert.equal(
      modelCategory({
        public_model_code: "gemini-2.5-flash-video-preview",
        display_name: "Gemini 2.5 Flash Video Preview",
        model_family: "Google",
        model_metadata: {
          input_modalities: ["TEXT"],
          output_modalities: ["VIDEO"]
        }
      }),
      "video"
    );
  });
});
