# Backend API Notes

更新时间：2026-05-20

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
- `POST /api/admin/tenant-usage-aggregates/rebuild`

金额字段当前使用整数分。AI 调用扣费优先扣 bonus，再扣 cash。后付费 credit 仍需 P1/P2 完整策略接入。

租户用量聚合可以通过 Admin 手动接口或命令行重建：

```bash
pnpm usage:aggregate -- --period-start=2026-05-01 --period-end=2026-06-01
```

## Payment

- `GET /api/payment/products`
- `POST /api/payment/orders`
- `GET /api/payment/orders/:order_id`
- `POST /api/payment/orders/:order_id/sync`
- `POST /api/payment/orders/:order_id/cancel`
- `POST /api/payment/orders/:order_id/refund`
- `POST /api/payment/ios/iap/transactions`
- `POST /api/payment/webhooks/alipay`
- `POST /api/payment/webhooks/wechat`
- `POST /api/payment/webhooks/wechat/refund`

P1 当前行为：

- 已新增 `PaymentConfigService`，支付环境变量按 `.env.example` 中的 Alipay / WeChat / Apple 模板配置，支持 `*_PATH` 和 `*_BASE64` 两种密钥读取方式。
- Web 支付第一阶段只开放支付宝二维码 `alipay_qr` 和微信 Native `wechat_native` 主干；银行卡、企业转账、品牌 Android 市场支付暂不进入 P1。
- 支付订单创建后会调用 adapter 生成 `payment_action.type='qr_code'`、`qr_content`、`expires_at`。本地 dev/test 未配置商户密钥时，可在 `PAYMENT_MOCK_ENABLED=true` 下返回 mock QR；生产环境不会回退 mock。
- `sync` 会调用对应 adapter 主动查单；未配置真实 adapter 时只记录查单事件，不会伪造支付成功。
- `POST /api/payment/webhooks/alipay` 处理支付宝 form 回调，验签后校验订单和金额，再进入统一入账事务。
- `POST /api/payment/webhooks/wechat` 处理微信支付 API v3 raw body，验签和解密后进入统一入账事务。
- 已新增 `payment_refunds`，退款申请会进入 `REFUNDING`，渠道确认成功后写 `payment.refund` 负向 wallet ledger。
- `POST /api/payment/ios/iap/transactions` 在 dev/sandbox 可接收 Apple IAP transaction 并幂等入账；`NODE_ENV=production` 必须配置 Apple App Store Server API 密钥，否则返回 503。
- Android 统一收银台对 App 暴露 `alipay_app_pay`、`wechat_app_pay`、`card_hosted_checkout`；服务端内部兼容现有 `alipay_app`、`wechat_app` 渠道配置。
- 支付订单状态流转写入 `payment_order_events`，交易确认写入 `payment_transactions`。
- 支付成功和权益到账分离：只有订单进入 `FULFILLED` 后才视为钱包到账。

仍需真实商户/平台配置后做支付宝、微信、Apple Server API 的真机/沙箱验签、真实查单、真实退款和回调重放压测。

## Admin Payment / Risk Ops

Admin 新增运营资源：

- `GET /api/admin/payment/transactions`
- `GET /api/admin/payment/order-events`
- `GET /api/admin/payment/refunds`
- `GET /api/admin/payment/callbacks`
- `GET /api/admin/payment/orders/:id/detail`
- `POST /api/admin/payment/callbacks/:id/replay`
- `GET /api/admin/reconciliation/records`
- `GET /api/admin/provider-request-attempts`
- `GET /api/admin/content-reports`
- `PATCH /api/admin/content-reports/:id`
- `GET /api/admin/account-deletion-requests`
- `PATCH /api/admin/account-deletion-requests/:id`
- `GET /api/admin/risk-events`

## Developer

- `GET /api/developer/api-keys`
- `POST /api/developer/api-keys`
- `PATCH /api/developer/api-keys/:id`
- `DELETE /api/developer/api-keys/:id`
- `GET /api/developer/request-logs`

API Key 创建后只返回一次完整 key；数据库只保存 hash、prefix 和 suffix。

## Referral

- `GET /api/referral/summary`
- `GET /api/referral/commissions`
- `POST /api/referral/withdrawals`

返回用户的邀请码、邀请客户数、待结算佣金、可提现佣金、已提现佣金和佣金明细。提现申请进入 `commission_withdrawals.pending`，需要 Admin 审核，不会由客户端直接入账。

Admin 运营入口：

- `GET /api/admin/commissions`
- `GET /api/admin/commission-withdrawals`
- `PATCH /api/admin/commission-withdrawals/:id`
- `POST /api/admin/commission-withdrawals/:id/review`

## Compliance

- `POST /api/reports/content`
- `POST /api/account/delete-request`
- `GET /api/compliance/policies`
- `GET /api/compliance/policies/:type`

内容举报和注销申请会写入待处理记录，并同步写入 `risk_events` 作为客户侧高风险操作留痕。政策文档支持 `terms`、`privacy`、`disclaimer`、`report`、`help` 等类型。

Admin 运营入口：

- `GET /api/admin/content-reports`
- `PATCH /api/admin/content-reports/:id`
- `GET /api/admin/account-deletion-requests`
- `PATCH /api/admin/account-deletion-requests/:id`
- `GET /api/admin/risk-events`
- `GET /api/admin/policy-documents`
- `POST /api/admin/policy-documents`
- `PATCH /api/admin/policy-documents/:id`
