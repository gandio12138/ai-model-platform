# OneToken / AI Token Platform Implementation Gap Report

更新时间：2026-05-20

本报告基于当前仓库实现、`README.md`、workspace 配置、`services/api-server`、`apps/admin-web`、`apps/checkout-web`、`apps/mobile-flutter`、`packages/shared-types`、数据库 migrations，以及以下产品/技术文档审计：

- `/Users/chengchengxu/Desktop/api-token智能基础平台设计方案/ai-token-platform-design-v1.0.md`
- `/Users/chengchengxu/Desktop/api-token智能基础平台设计方案/ai-token-platform-design-v1.1.md`
- `/Users/chengchengxu/Desktop/api-token智能基础平台设计方案/ai-token-platform-design-v1.2-unified-android-payment.md`
- `/Users/chengchengxu/Desktop/api-token智能基础平台设计方案/ai-token-platform-full-implementation-plan-v2.0.md`
- `/Users/chengchengxu/Desktop/api-token智能基础平台设计方案/ai-token-platform-full-implementation-plan-v2.2-saas-billing.md`

## 0. 当前实施进展

### P0 已完成

- 已补 `/api/app/config`、标准客户 Auth、`/v1/models`、`/v1/chat/completions`、App chat sessions、estimate、wallet ledger、API Key hash/mask、FakeProvider dev/test 边界和基础后端测试入口。
- Web/App 已开始切到标准接口，旧 `/api/public/*` 保持兼容。

### P1 本轮已推进

- 已补支付订单状态机和状态流转测试。
- 已补 `POST /api/payment/ios/iap/transactions`，支持 dev/sandbox Apple IAP transaction 幂等入账；prod 缺 Apple Server API 密钥时返回 503。
- 已补 `POST /api/payment/webhooks/:channelCode`，回调先验签留痕，不配置真实 adapter 时不入账。
- 已补 Android `android_unified_checkout` 的统一 payload 结构，并向 App 暴露 `alipay_app_pay` / `wechat_app_pay` / `card_hosted_checkout`。
- 已补 Admin 支付交易、订单状态流转、支付回调、对账记录、Provider 尝试、内容举报、注销申请、风控事件入口。

### P1 仍未完成

- Alipay/WeChat/hosted card/Apple App Store Server API 的真实验签、查单、退款和对账 adapter。
- refund 后钱包负向 ledger / 冲正闭环。
- tenant invoice 真实出账、支付状态和冲正闭环。
- Admin 专用支付订单详情 drawer、状态时间线、回调/ledger/对账联动详情。

### 非支付功能第一版已完成

- 已补 Referral 数据表、邀请码、邀请关系、佣金列表、提现申请和 Admin 提现审核入口。
- 已补协议/隐私/AI 免责声明/内容举报说明等政策文档表，并提供客户侧读取接口和 Admin 维护入口。
- 已将客户注册、登录、注销申请、内容举报写入 `risk_events`，补齐客户侧高风险操作留痕。
- 已补 `tenant_usage_aggregates` 重建脚本和 Admin 手动重建接口，用于从真实 `request_logs`/`billing_records` 聚合租户用量。
- Web 前台已新增代理佣金面板，App 已将 Referral 和 Compliance 页面从占位改为真实接口读取。
- `packages/shared-types` 已补 Referral、佣金提现和政策文档类型。

## 1. 当前已经实现的功能

### Monorepo 和基础工程

- 使用 `pnpm` workspace 管理 `apps/admin-web`、`apps/checkout-web`、`services/api-server`、`packages/shared-types`。
- 后端为 NestJS + PostgreSQL，已有 migrations 和 seed 脚本。
- 前端 Admin / Web 均为 React + Vite + Ant Design。
- 移动端已有 `apps/mobile-flutter` Flutter MVP 工程，包含 dev/staging/prod 入口、Riverpod、GoRouter、Dio、安全存储、基础测试和 README。

### Admin 管理端

- 已实现 Admin 登录：`/api/admin/auth/login`、`/api/admin/auth/me`。
- 已实现平台管理员和租户账号的 RBAC 逻辑，菜单按账号类型和权限过滤。
- 已覆盖较多后台资源：
  - Dashboard；
  - 用户、租户、租户成员、租户项目、租户客户；
  - 全局账号、客户分配；
  - 钱包流水、人工调账；
  - Provider、Provider Credential、模型目录、模型价格、模型路由；
  - 租户模型授权、租户模型价格；
  - 支付商品、商品可见性、支付渠道、支付订单、支付回调、对账记录；
  - Distribution Policy、Configs 发布/回滚；
  - Request Logs、Billing Records；
  - Tenant Plans、Tenant Subscriptions、Tenant Invoices、Tenant Billing Rules、Tenant Usage Aggregates；
  - Revenue Share、Commission、Audit Logs。
- 已将大量 UUID 表单字段升级为 searchable select。
- 已有 Dashboard 运营指标和趋势图雏形。
- Admin UI 已支持主题模式切换。

### Web 前台

- 已有官网首页、登录/注册、客户控制台、模型广场、文档页、钱包/充值、API Key、使用日志、个人设置等页面。
- 已对首页、控制台、模型广场、文档页做过统一视觉优化。
- 已接入公共客户接口：
  - `/api/public/auth/register`
  - `/api/public/auth/login`
  - `/api/public/me`
  - `/api/public/bootstrap`
  - `/api/public/products`
  - `/api/public/payment-methods`
  - `/api/public/models`
  - `/api/public/api-keys`
  - `/api/public/usage-logs`
  - `/api/public/wallet`
  - `/api/public/wallet/ledger`
  - `/api/public/payment/orders`
- Web 侧已能创建充值订单，并通过 dev/mock 流程完成钱包入账演示。
- 文档页有 cURL / Node.js / Python 示例和复制入口。

### Flutter App

- 已创建 `apps/mobile-flutter`，具备 Flutter MVP 结构。
- 已有页面：
  - Splash；
  - 登录/注册；
  - 首页；
  - 模型选择；
  - AI 对话；
  - 钱包；
  - 充值/支付商品；
  - 支付状态；
  - 账单；
  - Developer API Key；
  - Referral 占位；
  - Profile/Settings；
  - Compliance 页面；
  - Design System Preview。
- 已有 API client，优先调用真实后端，缺失接口时部分回退到 mock。
- 已有 iOS/Android 支付 adapter 抽象，但 native SDK 调起尚未实现。
- 已有 iPhone 17 Pro 启动脚本和关闭模拟器脚本。
- 已有 Flutter unit/widget 测试雏形。

### 后端数据和业务基础

- migrations 已覆盖：
  - users / roles / permissions / user_roles / audit_logs；
  - wallets / wallet_ledger；
  - api_keys；
  - providers / provider_credentials；
  - models / model_prices / model_routes；
  - request_logs / billing_records；
  - payment_products / payment_channels / payment_orders / payment_callbacks / ios_iap_transactions / reconciliation_records；
  - distribution_policies / configs / commission_records；
  - tenants / tenant_memberships / tenant_projects / tenant_customers；
  - tenant_plans / subscriptions / invoices / invoice_items / billing_rules / tenant_model_authorizations / tenant_model_prices / usage_aggregates / revenue_share_records；
  - payment_product_visibility / invoice_profiles。
- seed 已包含：
  - 平台自营租户、外部示例租户；
  - web / iOS / Android / API 项目；
  - admin、tenant、demo customer；
  - demo Provider、模型、路由、价格；
  - demo payment products/channels；
  - demo wallet/API Key 等基础数据。
- API Key 创建已保存 hash 和 mask，不保存明文 key，创建后返回一次完整 key。
- Provider Credential 已有加密服务和 AWS Bedrock model sync 雏形。

## 2. 当前半实现的功能

- 多租户：表结构、Admin scope 和 Web customer context 已有，但 `/v1` 网关、聊天、支付回调、账单聚合还未全部强制 tenant/project/customer 贯穿。
- 钱包：充值入账和人工调账已有，AI 调用扣费、冻结/解冻、退款冲正、佣金入账、月度租户账单聚合尚未完整接入。
- 支付：订单表、渠道表、商品表、回调表、对账表已有；真实支付 adapter、验签、查单、回调幂等、退款状态机、iOS IAP 服务端验证、Android unified checkout SDK payload 仍缺。
- 租户计费：套餐、订阅、发票、规则、用量聚合表和 Admin 页面已有；没有和 AI gateway、支付、月度任务、发票状态流转形成完整闭环。
- Developer API Key：Web/Admin 可创建和撤销；缺 `/api/developer/*` 标准接口、enable/disable/delete、限流配置、模型白名单执行、`/v1/*` 鉴权。
- App：页面结构基本齐，app config、聊天、report、注销、referral 已有后端接口；真实支付 SDK 与部分真机联调仍只能占位或依赖 sandbox/fake adapter。
- Admin 配置：`configs` 和发布/回滚已存在，但缺 config version/diff、App Config 合成预览、面向 iOS/Android/Web 的发布验证。
- UI：四端方向统一过，但 Web 前台仍是大单文件，Admin 大量页面是通用 ResourcePage，复杂运营详情页和状态流转体验不足。
- 测试：Flutter 有基础测试；Node/Web/Admin 基本只有 typecheck/build，缺业务单测、集成测试和 E2E。

## 3. 当前完全没实现的功能

- 真实 Provider Adapter：
  - OpenAI-compatible 真实上游调用；
  - Anthropic；
  - Gemini；
  - DeepSeek/Qwen OpenAI-compatible；
  - AWS Bedrock 标准调用链。
- 真实支付生产 adapter：
  - Alipay Web；
  - WeChat Native；
  - hosted card checkout；
  - enterprise transfer；
  - Apple IAP App Store Server API；
  - Android unified checkout Alipay/WeChat/Card SDK adapter；
  - webhook 验签；
  - order sync 查单；
  - reconciliation 差异处理。
- 自动化月度租户 invoice 生成、下载/导出、支付状态流转和冲正。
- 真实佣金结算到账、提现打款通道和财务审核流。
- 敏感日志脱敏策略和统一限流模块。
- 后端 Jest/e2e、Web/Admin Vitest/Testing Library、Playwright 覆盖。

## 4. 与五份文档不一致的地方

- 文档要求移动端启动必须调用 `/api/app/config`；当前 Flutter 会尝试调用，但后端不存在，回退到 `/api/public/bootstrap`。
- 文档要求 iOS 默认 Apple IAP，Android 统一 `android_unified_checkout`；当前后端 payment channels 有基础数据，但没有严格 App Config 和支付状态机保障。
- 文档要求 Android 不按华为/小米/OPPO/vivo/应用宝拆支付；当前未实现品牌支付分支，这是正确方向，但仍需保证新增代码不引入品牌支付主干。
- 文档要求钱包到账必须服务端验签/查单/幂等确认；当前 Web dev 主要靠 `/mock-pay` 演示入账，不能作为生产主流程。
- 文档要求 AI 调用必须按真实模型返回扣费；当前没有 AI gateway 和模型调用扣费。
- 文档要求 API Key 用于 OpenAI-compatible API；当前 API Key 只用于管理和展示，没有用于 `/v1/*` 鉴权。
- 文档要求 App 聊天支持预估、确认、流式、实际消耗；当前 Flutter UI 有流程，服务端缺失。
- 文档要求完整 SaaS 租户计费、发票、分润、佣金；当前表和 Admin 基础有，业务闭环不完整。
- 文档要求 App、Web、Admin 都有合规入口；当前 Web/App 有部分入口，后端持久化和 Admin 审核不足。
- 文档要求测试体系完整；当前测试严重不足。

## 5. 后端缺口

- 模块边界不完整：当前主要是 `admin` 和 `public` 两个大模块，缺 `app-config`、`customer-auth`、`ai-gateway`、`chat`、`wallet-ledger`、`payment-service`、`developer`、`referral`、`compliance` 等清晰模块。
- `PublicService` 过大，混合 auth、checkout、wallet、API key、models、payment、referral、compliance，后续需要拆分但要保持兼容路由。
- 没有 request id / idempotency middleware 统一处理。
- 没有统一 error response 结构。
- Provider adapter registry 仍是第一版，真实上游 adapter 和健康检查需增强。
- 没有生产 payment adapter registry。
- usage aggregation 已有命令和 Admin 手动触发，invoice generation、reconciliation 仍缺后台任务。
- audit logs 主要覆盖 Admin 操作；客户侧风险事件已有第一版，但还需限流、脱敏和告警。

## 6. Web 前台缺口

- `apps/checkout-web/src/App.tsx` 仍是大单文件，维护成本高。
- Web API 类型在本地重复定义，没有复用 `packages/shared-types`。
- 支付流程仍将 mock-pay 放在用户可见路径里，需限制为 dev/test 且不作为主流程。
- 缺支付订单确认页、轮询页、失败/取消/超时状态页。
- 钱包和账单还需区分充值、消费、退款、冻结、解冻、佣金等类型。
- API Key 只支持创建和撤销，缺 enable/disable/delete、限流、模型白名单、创建后一次性展示的更强安全提示。
- 使用日志来自现有 request_logs，但 AI gateway 不存在导致真实日志来源缺失。
- 设置页已有标准注销和内容举报接口；协议/隐私/AI 免责声明已接口化，仍需更完整的 Web 展示体验。
- 代理佣金已有第一版面板；提现详情、提现历史和财务状态说明仍需增强。
- 缺 loading/empty/error/retry 的系统化组件抽象。
- 缺 Web 单元测试和关键流程测试。

## 7. Admin 管理端缺口

- 许多页面仍为通用 ResourcePage，复杂资源缺专用详情页：
  - 支付订单状态流转、回调、ledger、对账；
  - request log provider attempts、tokens、cost、售价、错误详情；
  - App Config diff/preview/publish/rollback；
  - 租户账单预览、生成、支付状态流转；
  - content reports、account deletion、risk events。
- Config 发布/回滚现在是基础操作，缺版本历史、差异对比、面向 project/platform/distribution 的合成预览。
- 支付渠道配置需要进一步区分 Web、iOS IAP、Android unified checkout 的字段、密钥引用和启停策略。
- Provider Credential 配置需要覆盖 OpenAI-compatible、Anthropic、Gemini、AWS Bedrock 等不同字段，并隐藏密钥。
- Admin dashboard 还缺异常支付、失败请求、provider health、活跃客户等更完整运营指标。
- 缺 Admin 测试。

## 8. App 缺口

- App Config、标准 Auth、聊天、钱包、账单、API Key、Referral 和合规接口已有第一版。
- 支付 adapter 只有接口和 unsupported 实现，没有 IAP 插件、Android platform channel 或支付 SDK。
- Referral 页面和 Compliance 页面已接真实接口；举报和注销仍需更完整的移动端表单/确认流。
- 缺 integration test 真机流程。
- Android SDK、签名、支付 App 环境需要外部配置后才能真实验证。

## 9. 支付缺口

- 生产支付状态机不完整：PENDING / PROCESSING / PAID / FULFILLED / FAILED / CANCELLED / REFUNDED 需要被 service 层统一执行。
- 支付成功和权益到账没有完整分离；dev mock 直接 fulfilled。
- 缺 payment_order_events 表或等效状态事件记录。
- 缺 payment_transactions 表记录平台交易号、查单结果、资金状态。
- 缺 webhook endpoint 和验签。
- 缺 syncOrder 真实查单。
- 缺 refund/reversal 真实接口和负向 ledger。
- 缺 reconciliation job 和差异处理。
- iOS IAP 表已有，但缺 App Store Server API 验证、notification、重复 transaction 幂等入账。
- Android unified checkout 缺 `client_payload` 结构、SDK 调起参数、支付 App 未安装降级、订单轮询。
- Web 支付缺二维码/redirect/hosted checkout/对公转账的真实展示和状态页。

## 10. AI 网关缺口

- OpenAI-compatible `/v1/models` 和 `/v1/chat/completions` 已有第一版。
- 已支持 API Key Bearer、tenant/project/customer 识别、SSE、FakeProvider dev/test、usage 统计、实际扣费、余额不足拒绝、`idempotency_key` 和 App chat session/message 持久化。
- 仍需真实上游 Provider Adapter、provider route health、熔断、权重重试、credential 轮换、Provider 失败成本归因和更完整的模型白名单/限流执行。

## 11. 钱包/计费/账单缺口

- 钱包 ledger 已有，但业务类型不完整，需要标准化 event_type/direction/balance_type/idempotency_key。
- AI 调用消费已写 `wallet_ledger` / `billing_records`。
- 充值赠送 cash/bonus 已有 dev 流程，但真实支付入账未闭环。
- 冻结/解冻、退款、佣金、发票支付状态未完整闭环。
- 余额不可为负规则需要 service 层加锁保障。
- 后付费/信用额度、订阅+用量、最低消费等租户计费模式未完整接入。
- `tenant_usage_aggregates` 已有重建脚本和 Admin 手动触发；仍缺定时任务、增量聚合和异常补偿。
- tenant invoice 生成基于已有数据雏形，缺周期任务、支付状态、冲正、下载/导出。

## 12. 测试缺口

- 后端缺：
  - auth register/login/refresh/logout；
  - tenant scope isolation；
  - app config；
  - API Key create/revoke/auth；
  - `/v1/models`；
  - `/v1/chat/completions` non-stream/stream；
  - wallet ledger；
  - AI billing；
  - insufficient balance；
  - payment order/callback/sync/refund/idempotency；
  - iOS IAP idempotency；
  - Android unified checkout；
  - referral/compliance/RBAC/audit 深度覆盖。
- Web 缺：
  - 首页渲染；
  - 登录/注册；
  - 控制台；
  - 模型广场；
  - API Key 一次性展示；
  - 钱包充值和支付结果轮询；
  - 文档复制；
  - 设置、注销、举报；
  - loading/empty/error。
- Admin 缺：
  - 登录、RBAC；
  - 租户、模型、路由；
  - 支付订单详情；
  - 配置发布/回滚；
  - 租户账单；
  - request/audit logs。
- Flutter 已有基础 unit/widget test，但缺真实 integration test、支付状态、logout、report、delete request、referral/compliance 页面覆盖。

## 13. 需要新增或修改的数据表

### 已新增

- `refresh_tokens`
- `account_deletion_requests`
- `content_reports`
- `risk_events`
- `chat_sessions`
- `chat_messages`
- `chat_estimates`
- `ai_gateway_requests` 或扩展 `request_logs`
- `provider_request_attempts`
- `payment_transactions`
- `payment_order_events`
- `referral_codes`
- `referral_relations`
- `commission_withdrawals`

### 必须新增

- `api_key_rate_limits`
- `model_route_health`

### 建议新增或演进

- `app_configs` / `config_versions`：当前有 `configs`，可选择扩展而不是新建。
- `distribution_policy_events`：记录渠道策略发布和命中。
- `tenant_invoice_events`：记录发票状态流转。

### 需要修改

- `api_keys`：增加 expires_at、last_used_at、rate_limit_config、model_whitelist、deleted_at 或 status 细分。
- `request_logs`：增加 idempotency_key、estimated_usage、error_code、billing_status、response_status、stream_status。
- `payment_orders`：补 checkout_channel、payment_method、platform、client_context、paid_at、fulfilled_at、cancelled_at、refunded_at、status_reason。
- `ios_iap_transactions`：补 signed_transaction_info、original_transaction_id、environment、verification_status、revocation_at。
- `payment_channels`：补 adapter_type、secret_ref、merchant_config_schema、sandbox_enabled、prod_enabled。
- `wallet_ledger`：保证所有业务写入都有 tenant_id/customer_id/idempotency_key。

## 14. 需要新增或修改的接口

### App Config

- `GET /api/app/config`

### Auth / Session

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `GET /api/me`
- `POST /api/account/delete-request`
- 保留 `/api/public/auth/*` 和 `/api/public/me` 兼容。

### AI Gateway / Chat

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /api/chat/estimate`
- `POST /api/chat/sessions`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/:id`
- `POST /api/chat/sessions/:id/messages`
- `DELETE /api/chat/sessions/:id`

### Wallet / Billing

- `GET /api/wallet`
- `GET /api/wallet/ledger`
- `GET /api/billing/records`
- 继续保留 `/api/public/wallet*` 兼容。

### Payment

- `GET /api/payment/products`
- `POST /api/payment/orders`
- `GET /api/payment/orders/:order_id`
- `POST /api/payment/orders/:order_id/sync`
- `POST /api/payment/orders/:order_id/cancel`
- `POST /api/payment/orders/:order_id/refund`
- `POST /api/payment/ios/iap/transactions`
- 支付 webhook endpoints，例如 `/api/payment/webhooks/alipay`、`/api/payment/webhooks/wechat`、`/api/payment/webhooks/apple`

### Developer

- `GET /api/developer/api-keys`
- `POST /api/developer/api-keys`
- `PATCH /api/developer/api-keys/:id`
- `DELETE /api/developer/api-keys/:id`
- `GET /api/developer/request-logs`

### Referral / Compliance

- `GET /api/referral/summary`
- `GET /api/referral/commissions`
- `POST /api/referral/withdrawals`
- `POST /api/reports/content`
- `GET /api/compliance/policies`
- `GET /api/compliance/policies/:type`

### Admin

- 支付订单详情、查单、退款、回调、对账详情增强。
- App Config 合成预览、diff、发布、回滚增强。
- Account deletion、content report、risk events、commission withdrawals、policy documents 页面接口。

## 15. 需要新增或修改的前端页面

### Web 前台

- 拆分 `apps/checkout-web/src/App.tsx` 为 feature-first 结构。
- 新增或增强：
  - 支付订单确认页；
  - 支付结果轮询页；
  - 账单详情页；
  - API Key 创建成功一次性密钥弹窗；
  - API Key enable/disable/delete；
  - 使用日志详情；
  - 注销申请；
  - 内容举报；
  - 协议/隐私/AI 内容免责声明专页；
  - loading/empty/error/retry 统一组件。
  - 代理佣金提现历史和状态详情。

### Admin

- 支付订单专用详情 drawer。
- Request Log 专用详情 drawer。
- Config diff / preview / publish 页面。
- Provider Credential 按 provider type 的专用表单。
- Account Deletion Requests 页面。
- Content Reports 页面。
- Risk Events 页面。
- Payment Reconciliation 页面增强。
- Tenant Invoice event/status 页面增强。

## 16. 需要新增或修改的 Flutter 页面

- App Config 失败/维护模式/版本过低页面。
- 登录 refresh/logout 状态处理。
- Chat session list 独立页或抽屉。
- Chat streaming error/retry/stop generation 完整状态。
- Billing records 独立接口页面。
- Payment status 恢复未完成订单。
- iOS IAP 商品加载、购买中、待服务端确认、失败、取消、恢复状态。
- Android unified checkout 支付方式、支付 App 未安装、待确认、超时、查单状态。
- API Key 创建后一次性完整 key 展示。
- Request logs 页面。
- Referral summary/commission/withdrawal 页面已完成第一版。
- Compliance 政策页面已接真实接口；Report content 提交页和 Account deletion 二次确认页仍需增强。
- Debug config/preview 页面增强。

## 17. 需要外部密钥、证书、商户号、Apple 配置、Android 签名才能完成的事项

- OpenAI / Anthropic / Gemini / DeepSeek / Qwen / AWS Bedrock 等 Provider API Key、base URL、region、model access 权限。
- Provider Credential 加密主密钥：`CREDENTIAL_ENCRYPTION_KEY` 或等效 KMS 配置。
- Alipay：
  - app_id；
  - merchant private key；
  - Alipay public key/cert；
  - notify URL；
  - sandbox/prod 环境开关。
- WeChat Pay：
  - mch_id；
  - app_id；
  - API v3 key；
  - merchant cert/private key；
  - platform cert；
  - notify URL。
- Hosted card checkout PSP：
  - merchant id；
  - API key；
  - webhook signing secret；
  - hosted checkout domain。
- Apple IAP：
  - Apple Developer Team；
  - Bundle ID；
  - App Store Connect IAP product ids；
  - App Store Server API issuer id / key id / private key；
  - Sandbox Tester；
  - Server Notification URL。
- Android：
  - package name；
  - signing keystore；
  - Alipay/WeChat app id 与签名绑定；
  - distribution_channel 打包配置；
  - 应用市场渠道包配置。
- 真机验证：
  - Xcode signing；
  - Android SDK；
  - iOS/Android 真机；
  - 支付宝/微信 App；
  - TestFlight / Android APK/AAB 发布凭证。

## 18. 实现顺序

### P0：先打通最小完整业务闭环

1. 新增数据库迁移：
   - refresh tokens；
   - app config 所需字段或 config 扩展；
   - chat sessions/messages/estimates；
   - provider attempts；
   - payment order events/transactions；
   - content reports/account deletion 最小表。
2. 后端新增标准接口：
   - `/api/app/config`；
   - `/api/auth/*` + `/api/me`；
   - `/api/wallet*`、`/api/billing/records`；
   - `/api/developer/*`；
   - `/api/chat/*`；
   - `/v1/models`、`/v1/chat/completions`。
3. AI Gateway MVP：
   - API Key Bearer 鉴权；
   - tenant/project/customer scope；
   - FakeProvider dev/test；
   - OpenAI-compatible adapter skeleton；
   - stream/non-stream；
   - request_logs + billing_records + wallet ledger 扣费；
   - 余额不足拒绝。
4. Payment MVP 生产结构：
   - 禁止 prod mock 入账；
   - order status event；
   - public order get/sync/cancel；
   - dev sandbox adapter；
   - wallet fulfillment 幂等。
5. Web/App 改为优先调用标准接口，兼容 public 旧接口。
6. 补基础后端测试和 Flutter/Web smoke 测试。

### P1：补支付和租户计费生产结构

1. Web payment adapters：Alipay Web、WeChat Native、hosted card、enterprise transfer skeleton。
2. iOS IAP 服务端验证结构和 transaction 幂等：已完成提交入口、幂等记录和 dev/sandbox fulfillment，真实 Apple 验签待接入。
3. Android unified checkout order/client_payload/sync 结构：已完成统一 payload 和方法名兼容，真实 SDK payload 待商户配置。
4. 支付 webhook 验签入口和 callback 记录：已完成回调记录和 dev 签名入口，真实验签 adapter 待接入。
5. refund/reversal/negative ledger。
6. usage aggregate job 已有命令和 Admin 手动触发；tenant invoice 生成仍需接入真实 usage/payment。
7. Admin 支付、对账、账单、配置详情页增强：已补支付/风控/合规资源入口，专用详情页仍待增强。

### P2：补运营、合规、佣金和 UI

1. Referral / commission public API 和 Admin 审核已完成第一版。
2. Content report、account deletion、risk events 已完成第一版，audit logs/告警仍需增强。
3. Web 前台拆分模块并统一设计系统。
4. Admin 专用详情页和运营化 dashboard。
5. Flutter Referral/Compliance 真实接口已补；支付状态页、举报/注销表单、组件 preview 仍需增强。
6. 文档补齐 backend-api、payment-integration、mobile-test-plan、production-checklist。

### P3：上线前增强

1. Anthropic/Gemini/更多 OpenAI-compatible provider adapter。
2. Provider route health、熔断、权重、失败重试策略增强。
3. API Key 限流、模型白名单、细粒度风控。
4. Playwright E2E、后端 e2e、Flutter integration test。
5. CI/CD、release checklist、生产监控和告警。

## 当前审计结论

当前项目已经完成了“可演示的管理后台 + Web 客户端 + Flutter App MVP”，数据库也提前铺了大量 SaaS、支付、模型和计费表。但离文档要求的“完整产品闭环”还差三个核心中枢：

1. AI Gateway：真实模型调用、API Key 鉴权、usage 统计、扣费、日志。
2. Payment Service：真实支付 adapter、验签、查单、状态事件、幂等入账、退款/对账。
3. App Config/Auth/Chat 标准接口：让 Web、App、Admin 使用同一套 tenant/project/customer 语义和业务数据。

后续实现必须优先补 P0，避免继续在页面层扩展导致业务闭环更分散。
