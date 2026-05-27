# Media And Non-Text Model Endpoints

This document records the first-stage contract for non-text model access. Text chat continues to use the OpenAI-compatible `/v1/chat/completions` endpoint. Non-text models must not be routed through chat.

## Implemented In This Stage

- `POST /v1/images/generations`
  - Auth: customer API Key.
  - Billing: model category `image`; uses admin-configured unit pricing when available.
  - Provider adapter: Google Vertex image-capable models.
  - Response: OpenAI-style image generation response with `b64_json` or `url`, plus usage and charge metadata.

- `POST /v1/videos/generations`
  - Auth: customer API Key.
  - Billing: model category `video`; charged on operation submission for the current MVP.
  - Provider adapter: Google Vertex video-capable models that return a long-running operation.
  - Response: generation task id, provider operation name, status, usage, and charge metadata.

## Reserved For Later

- `POST /v1/embeddings`
  - Current behavior: returns `501`.
  - Planned billing: model category `embedding`, independent input token or vector unit pricing.
  - Planned provider adapters: OpenAI embeddings and Google Vertex embeddings.

- `POST /v1/audio/speech`
- `POST /v1/audio/transcriptions`
  - Current behavior: returns `501`.
  - Planned billing: model category `audio`, independent character, minute, or token pricing depending on provider metadata.

## Catalog Rules

- Customer-facing Web/App catalogs can show text, image, video, audio, and Embedding model categories.
- App chat model picker must only show text/chat models with pricing, routes, and successful availability status.
- Admin model catalog keeps provider source metadata and provider default pricing/context as reference data.
- Customer-facing price/context values come from admin-configured model prices when present; provider defaults are only fallback display data.

## Availability Test Rules

- Synchronization can validate a model only when the operator explicitly enables availability checks.
- A successful validation is cached in route metadata and should not be re-run on later syncs unless the model, route, provider credential, or operator request changes.
- Failed/unavailable routes are excluded from customer-facing catalogs and chat model pickers.

