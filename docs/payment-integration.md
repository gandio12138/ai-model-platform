# Payment Integration Notes

更新时间：2026-05-20

## 当前状态

P1 已补齐支付订单状态机、移动端支付入口结构和后台运营视图：

- `payment_orders`
- `payment_order_events`
- `payment_transactions`
- `payment_callbacks`
- `ios_iap_transactions`
- `reconciliation_records`

当前生产支付 adapter 尚未接入真实外部平台。`/api/public/payment/orders/:orderNo/mock-pay` 仍只用于 dev/test 兼容演示，不是生产主流程。

已实现的服务端结构：

- 订单状态流转校验：`CREATED/PENDING/PAYING/PROCESSING/PAID/FULFILLED/FAILED/CANCELLED/REFUNDING/REFUNDED`。
- `POST /api/payment/ios/iap/transactions`：接收 App Store transaction，dev/sandbox 可幂等入账，prod 必须配置 Apple App Store Server API 密钥后才能验签。
- `POST /api/payment/webhooks/:channelCode`：记录支付回调和签名状态，未配置真实 adapter 时只留痕不入账。
- `POST /api/payment/orders/:order_id/sync`：记录主动查单事件；未配置真实 adapter 时不改变订单状态。
- `POST /api/payment/orders/:order_id/refund`：后台发起退款申请，订单进入 `REFUNDING`，真实退款和冲正仍需支付平台 adapter。
- Android 统一收银台：对 App 暴露 `alipay_app_pay`、`wechat_app_pay`、`card_hosted_checkout`，服务端内部兼容现有 `alipay_app`、`wechat_app` 渠道配置。
- Admin 已有支付交易、订单流转、支付回调、对账记录、内容举报、注销申请、风控事件、Provider 尝试记录入口。

## 强制边界

- 客户端支付成功不能直接增加余额。
- 钱包入账必须由服务端验签、查单、幂等确认后写入 `wallet_ledger`。
- `mock-pay` 不允许作为 prod 入账路径。
- Android 支付主干只允许 `android_unified_checkout`。
- 华为、小米、OPPO、vivo、应用宝等只能作为 `distribution_channel`、审核文案、统计和风控维度。
- iOS 支付走 Apple IAP / StoreKit / App Store Server API。

## Web 支付待接入

需要配置：

- Alipay Web app id、商户私钥、支付宝公钥/证书、notify URL；
- WeChat Pay mch id、app id、API v3 key、商户证书、平台证书、notify URL；
- hosted card checkout PSP merchant id、API key、webhook signing secret；
- enterprise transfer 收款账户和后台对账流程。

服务端仍需接入：

- adapter registry；
- create order 返回真实 redirect/QR/hosted checkout payload；
- webhook 验签和状态确认；
- `syncOrder` 平台查单；
- refund/reversal 的真实平台请求和钱包冲正；
- reconciliation job。

## iOS IAP 待接入

需要配置：

- Apple Developer Team；
- Bundle ID；
- App Store Connect consumable IAP product ids；
- App Store Server API issuer id、key id、private key；
- App Store Server Notifications URL；
- Sandbox Tester。

服务端当前已有 `POST /api/payment/ios/iap/transactions`、duplicate transaction 幂等和 dev/sandbox wallet fulfillment。

服务端仍需接入：

- App Store Server API signed transaction verification；
- App Store Server Notifications；
- refund/revoke/chargeback 状态处理和钱包冲正。

## Android Unified Checkout 待接入

需要配置：

- Android package name；
- signing keystore；
- Alipay/WeChat app id 和签名绑定；
- distribution channel 打包参数；
- 支付宝/微信 SDK。

服务端当前已有 `checkout_channel=android_unified_checkout` 的统一结构和 sandbox client payload。

服务端仍需接入：

- 支付宝 App 支付真实 `order_string`；
- 微信 App 支付真实 `prepay` 参数；
- card hosted checkout fallback；
- 支付 App 未安装降级提示；
- order polling / sync 的真实查单。

## 本地开发建议

- dev/test 可以使用 Fake/Sandbox adapter。
- prod 必须显式配置真实商户参数。
- 测试支付入账时检查：
  - `payment_orders.status`；
  - `payment_order_events`；
  - `payment_transactions`；
  - `wallet_ledger.idempotency_key`；
  - `billing_records` 或充值关联记录；
  - `reconciliation_records`。
