# Backend API Notes

更新时间：2026-05-19

## Customer Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/me`

`/api/auth/login` 和 `/api/auth/register` 返回：

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token": "...",
  "token_type": "Bearer",
  "expires_in": 28800,
  "user": {},
  "tenant": {},
  "project": {},
  "tenant_customer": {},
  "wallet": {}
}
```

`token` 是兼容旧 Web 客户端的 access token alias。客户端新代码应使用 `access_token`。

## App Config

- `GET /api/app/config`

支持 query/header 上下文：

- `platform`
- `app_version`
- `bundle_id` / `package_name`
- `distribution_channel`
- `tenant_code` / `tenant_id`
- `project_code` / `project_id`
- `region`
- `device_id`

返回合成后的平台配置，包括支付方式、Web 付费入口、review mode、公告、隐私文案、功能开关和维护状态。

## Models

- `GET /api/models`
- `GET /v1/models`

`/api/models` 用于 Web/App 展示模型目录。`/v1/models` 使用 `Authorization: Bearer <customer_api_key>`，返回 OpenAI-compatible model list。

## Chat And AI Gateway

- `POST /api/chat/estimate`
- `POST /api/chat/sessions`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/:id`
- `POST /api/chat/sessions/:id/messages`
- `DELETE /api/chat/sessions/:id`
- `POST /v1/chat/completions`

当前 P0 实现：

- API Key Bearer 鉴权；
- tenant/project/customer 语义写入日志和账单；
- FakeProvider dev/test 回复；
- non-stream 与 SSE stream OpenAI-compatible 响应；
- request_logs、provider_request_attempts、wallet_ledger、billing_records 写入；
- 余额不足返回 HTTP 402；
- `idempotency_key` 可用于防止重复扣费。

生产限制：

- `NODE_ENV=production` 且未设置 `ENABLE_FAKE_PROVIDER=true` 时，FakeProvider 不处理真实请求。
- 上线必须配置真实 Provider Adapter 和 Provider Credential。

## Wallet And Billing

- `GET /api/wallet`
- `GET /api/wallet/ledger`
- `GET /api/billing/records`

金额字段当前使用整数分。AI 调用扣费优先扣 bonus，再扣 cash。后付费 credit 仍需 P1/P2 完整策略接入。

## Payment

- `GET /api/payment/products`
- `POST /api/payment/orders`
- `GET /api/payment/orders/:order_id`
- `POST /api/payment/orders/:order_id/sync`
- `POST /api/payment/orders/:order_id/cancel`

P0 中 `sync` 只记录查询事件，不会伪造支付成功。真实查单、验签、回调和退款在 P1 接入。

## Developer

- `GET /api/developer/api-keys`
- `POST /api/developer/api-keys`
- `PATCH /api/developer/api-keys/:id`
- `DELETE /api/developer/api-keys/:id`
- `GET /api/developer/request-logs`

API Key 创建后只返回一次完整 key；数据库只保存 hash、prefix 和 suffix。

## Compliance

- `POST /api/reports/content`
- `POST /api/account/delete-request`

当前写入待处理记录，后续需要 Admin 审核页面和处理流。
