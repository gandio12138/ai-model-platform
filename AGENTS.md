# Agent Instructions

## Frontend Design Rules

When implementing UI, optimize for polished, restrained, production-quality interfaces.

### Visual Style

- Prefer clean, modern, editorial composition.
- Avoid generic AI landing page cliches:
  - purple gradients by default
  - excessive cards
  - glassmorphism everywhere
  - icon grids
  - pill clusters
  - meaningless stat strips
- Use one strong visual anchor per major page.
- Start with typography, spacing, alignment, and contrast before adding decoration.

### Layout

- Each section should have one purpose.
- Hero should establish brand, promise, CTA, and visual hierarchy.
- Use generous whitespace.
- Mobile layout must be intentionally designed, not merely compressed.

### Design System

- Use existing components before creating new ones.
- Define or reuse tokens for background, surface, text, muted text, accent, and border.
- Use one primary accent color unless the product requires more.

### Motion

- Use subtle motion only when it improves hierarchy or feedback.
- Support `prefers-reduced-motion`.

### Done Means

- Desktop and mobile checked.
- No obvious overflow.
- Build/lint passes.
- Final response explains visual decisions.

## Platform Data Rules

- Do not hardcode Provider model IDs, model names, prices, context windows, capabilities, API endpoints, credentials, tenant IDs, or production URLs into business logic.
- Provider model catalogs must start from the actual Provider account response, such as the API key's accessible model list, and then enrich only those returned models with official verifiable metadata or admin-managed configuration.
- If official metadata such as price or context cannot be fetched or verified, skip the model for customer-facing catalogs and record the missing metadata clearly for admin review.
- Admin-configured prices and context limits override provider defaults for tenant/customer-facing Web and App views; provider defaults remain visible only as source/reference data in Admin.
- Sensitive fields must come from encrypted credentials, environment variables, or secure server-side configuration, and must never be printed, returned to frontend, or committed.
