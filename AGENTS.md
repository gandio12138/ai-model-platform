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
