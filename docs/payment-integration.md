# Payment Integration Notes

更新时间：2026-05-19

## 当前状态

P0 已补齐支付订单的标准入口和事件/交易表结构：

- `payment_orders`
- `payment_order_events`
- `payment_transactions`
- `payment_callbacks`
- `ios_iap_transactions`
- `reconciliation_records`

当前生产支付 adapter 尚未接入。`/api/public/payment/orders/:orderNo/mock-pay` 仍只用于 dev/test 兼容演示，不是生产主流程。

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

服务端需要继续补：

- adapter registry；
- create order 返回真实 redirect/QR/hosted checkout payload；
- webhook 验签；
- `syncOrder` 平台查单；
- refund/reversal；
- reconciliation job。

## iOS IAP 待接入

需要配置：

- Apple Developer Team；
- Bundle ID；
- App Store Connect consumable IAP product ids；
- App Store Server API issuer id、key id、private key；
- App Store Server Notifications URL；
- Sandbox Tester。

服务端需要继续补：

- `POST /api/payment/ios/iap/transactions`；
- signed transaction verification；
- duplicate transaction 幂等；
- refund/revoke/chargeback 状态处理；
- wallet fulfillment。

## Android Unified Checkout 待接入

需要配置：

- Android package name；
- signing keystore；
- Alipay/WeChat app id 和签名绑定；
- distribution channel 打包参数；
- 支付宝/微信 SDK。

服务端需要继续补：

- `checkout_channel=android_unified_checkout` 的真实 client payload；
- `alipay_app` order string；
- `wechat_app` prepay 参数；
- card hosted checkout fallback；
- 支付 App 未安装降级提示；
- order polling / sync。

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
