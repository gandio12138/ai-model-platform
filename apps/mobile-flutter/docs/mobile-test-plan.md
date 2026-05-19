# Mobile Test Plan

## iOS Matrix

| Area | Devices / Builds | Checks |
|---|---|---|
| Small iPhone | iPhone SE class | Safe area, readable cards, payment copy wrapping |
| Standard iPhone | iPhone 15 class | Login, home, chat, wallet, billing |
| Large iPhone | Pro Max class | Long conversation, model cards, payment products |
| Latest iOS | Current stable | StoreKit sandbox, TestFlight install |
| Older supported iOS | Oldest supported by Flutter target | Navigation, secure storage, network timeout |
| TestFlight | Staging flavor | IAP sandbox, order confirmation, wallet refresh |
| IAP Sandbox | Consumable products | Cancel, success pending server, duplicate transaction, refund/revoke refresh |

## Android Matrix

| Area | Devices / Builds | Checks |
|---|---|---|
| Huawei / Honor | Market or side-loaded package | Compatibility and distribution_channel only |
| Xiaomi / Redmi | Market or side-loaded package | Keyboard, chat stream, payment copy |
| OPPO / OnePlus | Market or side-loaded package | Network, wallet, billing |
| vivo / iQOO | Market or side-loaded package | Font scale, low memory, input method |
| Samsung | Optional | High DPI, gesture navigation |
| Low-end phone | Android old supported version | Long chat performance, loading states |
| High-refresh large phone | Newer Android | Scroll smoothness, large text |
| Official APK | `official_apk` | Web payment link policy if enabled |
| Market package | `huawei_market` / `xiaomi_market` / `yingyongbao` | Review copy and analytics only |
| Alipay installed | Android unified checkout | SDK launch in phase 2, order polling |
| WeChat installed | Android unified checkout | SDK launch in phase 2, order polling |
| Payment app missing | Android unified checkout | Degrade message, no wallet credit |

Android brands are compatibility and distribution-channel test dimensions only. They must not become payment-channel branches.

## Core Flow Cases

1. Login / register.
2. Fetch `/api/app/config`.
3. Fetch model list.
4. Create chat session.
5. Estimate chat cost.
6. Confirm send.
7. Render stream response.
8. Show actual usage and cost.
9. View wallet.
10. View ledger and billing records.
11. View payment products.
12. Create payment order.
13. Poll order status.
14. Create API Key and display full key only once.
15. Report content.
16. Logout.

## Failure Cases

- 401 clears token and returns to login.
- 403 permission denied.
- 404 missing resource.
- 409 order state conflict.
- 422 validation error.
- 429 rate limit.
- 500 server error.
- Network offline.
- Timeout.
- Stream interrupted.
- Payment pending too long.
- Duplicate payment tap.
