# AI Model Platform

AI Model Platform is the management backend, admin web, and customer checkout
foundation for a multi-tenant AI token platform. The current implementation
focuses on the admin service and the first Web checkout flow: tenant management,
tenant projects, tenant customers, Provider management, model catalog, route and
price configuration, wallet operations, payment operations, request logs,
billing records, RBAC, audit logs, PostgreSQL-backed data persistence, public
customer auth, product display, order creation, and wallet fulfillment.

## Workspace

```text
apps/admin-web              React + Vite admin console
apps/checkout-web           React + Vite customer Web checkout
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
- Web Checkout P1: Alipay QR (`alipay.trade.precreate`) and WeChat Native QR.
  Hosted card checkout, enterprise transfer, and Android market-specific payment
  branches are intentionally outside the current production payment scope.

AWS Bedrock Providers can store encrypted Bedrock API keys and sync available
foundation models into the model catalog and model routes.

## Customer Web

The Web checkout app uses the same tenant/project/product model that the future
App client will use.

- Tenant and project context is resolved from `tenant_code`, `tenant_id`,
  `project_code`, `project_id`, and `platform` URL/query fields.
- New customer registration creates or reuses a `users` record with
  `user_type = consumer`, then links it to the current tenant through
  `tenant_customers`.
- Wallets are unique per `tenant_id + user_id + currency`, so one customer
  identity can belong to multiple tenants without sharing balances.
- Products are displayed through `payment_product_visibility`, which lets the
  admin configure different iOS, Android, Web, and API presentation rules for
  the same underlying paid package.
- Web checkout supports QR cashier flow for Alipay QR and WeChat Native. The
  browser only polls order status; wallet fulfillment is performed by server-side
  provider notification or active order query.
- Dev/test can keep mock QR fulfillment when `PAYMENT_MOCK_ENABLED=true`.
  Production disables mock payment and never falls back to mock fulfillment.
- The same customer web app includes Token API access setup: customer API Key
  creation, key masking/revocation, base URL display, bearer-token header
  example, and cURL request example.
- The model catalog is loaded from tenant model authorizations and tenant model
  prices, so customers only see models that the tenant can use.

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

Payment configuration is documented in `.env.example`. For production, configure
Alipay / WeChat private keys and certificates through secret files or base64
environment variables. Never commit real merchant keys or platform certificates.

Default ports:

```text
admin web: http://localhost:5173
checkout web: http://localhost:5174
admin api: http://localhost:4000
```

Default Web checkout entry:

```text
http://localhost:5174/?tenant_code=platform_default_tenant&project_code=web-checkout&platform=web
```

LAN preview:

```text
http://<your-mac-lan-ip>:5174/?tenant_code=platform_default_tenant&project_code=web-checkout&platform=web
```

The Vite dev servers listen on `0.0.0.0` and proxy same-origin `/api` and `/v1`
requests to `API_PROXY_TARGET` (`http://127.0.0.1:4000` by default). Keep
`VITE_API_BASE` empty for LAN testing; setting it to `localhost` or `127.0.0.1`
will make other devices call their own local machine instead of this Mac.

Seeded accounts are intended for local development only. Do not display or
reuse default credentials in a deployed environment; create deployment-specific
admin, tenant, and customer accounts after migration.

Seeded customer scope:

```text
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
pnpm dev:checkout
```
