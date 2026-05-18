# AI Model Platform

AI Model Platform is the management backend and admin web foundation for a
multi-tenant AI token platform. The current implementation focuses on the admin
service: tenant management, tenant projects, tenant customers, Provider
management, model catalog, route and price configuration, wallet operations,
payment operations, request logs, billing records, RBAC, audit logs, and
PostgreSQL-backed data persistence.

## Workspace

```text
apps/admin-web              React + Vite admin console
services/api-server         NestJS admin API service
packages/shared-types       Shared TypeScript contracts
services/api-server/migrations
                             PostgreSQL schema migrations
```

## Admin Scope Model

The admin console follows the platform -> tenant -> project -> customer model.

- `super_admin` / `platform_master` can view and operate across all tenants.
- Tenant admins only see tenants linked through `tenant_memberships`.
- Tenant customers are linked through `tenant_customers`; app/web/API customer
  records are not assigned directly to arbitrary backend accounts.
- Tenant scope is enforced by the API service for users, wallet ledger, payment
  products, payment channels, payment orders, request logs, billing records,
  distribution policies, and commission records.
- The legacy customer-assignment API is restricted to platform-level permissions
  and is not exposed in the main admin menu.

## Admin Web

The admin web includes:

- Dashboard overview.
- Tenant, tenant member, tenant project, and tenant customer management.
- Global account management.
- Wallet ledger and balance adjustment.
- Provider and provider credential management.
- Model catalog, model price, and model route management.
- Payment product, channel, order, callback, and reconciliation views.
- Distribution policy, config publishing, request log, billing, commission, and
  audit log views.

Relationship fields that reference other records use searchable dropdowns
instead of manual UUID input. Provider, model, and route pages also expose detail
drawers for full-record inspection with business labels instead of raw database
field names.

Payment channels are configured by project/platform and payment method:

- iOS App: Apple IAP.
- Android App: unified checkout with Alipay App Pay and WeChat App Pay.
- Web Checkout: Alipay web, WeChat Native, hosted card checkout, and enterprise
  transfer.

AWS Bedrock Providers can store encrypted Bedrock API keys and sync available
foundation models into the model catalog and model routes.

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
support@example.com -> platform_default_tenant

platform_default_tenant customers:
  demo-user@example.com
  vip-customer@example.com

external_demo_tenant customers:
  external-customer@example.com
```

`external-customer@example.com` is intentionally not assigned to the support
admin's tenant and is used to verify tenant-scope isolation.

## Useful Commands

```bash
pnpm typecheck
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm dev:api
pnpm dev:admin
```
