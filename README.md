# AI Model Platform

AI Model Platform is the management backend and admin web foundation for an AI
intelligent service platform. The current implementation focuses on the admin
service: Provider management, model catalog, route and price configuration,
wallet operations, payment operations, request logs, billing records, customer
assignment, RBAC, audit logs, and PostgreSQL-backed data persistence.

## Workspace

```text
apps/admin-web              React + Vite admin console
services/api-server         NestJS admin API service
packages/shared-types       Shared TypeScript contracts
services/api-server/migrations
                             PostgreSQL schema migrations
```

## Admin Scope Model

The admin console supports one backend admin account managing multiple app/web
customer accounts.

- `super_admin` can view and operate on all customer-scoped records.
- Non-super-admin accounts only see records for customers assigned through
  `admin_customer_accounts`.
- Customer scope is enforced by the API service for users, wallet ledger,
  payment orders, request logs, billing records, and commission records.
- Customer assignment can be managed in the admin web through the customer
  assignment page.

## Admin Web

The admin web includes:

- Dashboard overview.
- User and customer assignment management.
- Wallet ledger and balance adjustment.
- Provider and provider credential management.
- Model catalog, model price, and model route management.
- Payment product, channel, order, callback, and reconciliation views.
- Distribution policy, config publishing, request log, billing, commission, and
  audit log views.

Relationship fields that reference other records use searchable dropdowns
instead of manual UUID input. Provider, model, and route pages also expose detail
drawers for full-record inspection.

## Local Development

Requirements:

- Node.js 20+
- pnpm 11+
- PostgreSQL 14+

```bash
cp .env.example .env
createdb -h localhost ai_model_platform
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Default ports:

```text
admin web: http://localhost:5173
admin api: http://localhost:4000
```

Seeded accounts:

```text
super admin:
  email: admin@example.com
  password: Admin123456!

support admin:
  email: support@example.com
  password: Support123456!
```

Seeded customer scope:

```text
support@example.com -> demo-user@example.com
support@example.com -> vip-customer@example.com
```

`external-customer@example.com` is intentionally not assigned to the support
admin and is used to verify customer-scope isolation.

## Useful Commands

```bash
pnpm typecheck
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm dev:api
pnpm dev:admin
```
