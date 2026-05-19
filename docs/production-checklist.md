# Production Checklist

更新时间：2026-05-19

## Must Configure

- `DATABASE_URL`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- Provider credentials for each enabled route
- Alipay merchant configuration
- WeChat Pay merchant configuration
- hosted card checkout PSP configuration
- Apple App Store Server API credentials
- Android signing keystore and payment SDK app ids
- Public Web payment URL
- Payment webhook public URLs

## Must Disable In Production

- `mock-pay` public exposure as a real payment entry
- FakeProvider for real AI requests unless explicitly enabled for a controlled test
- Debug App Config flags
- Logging of passwords, tokens, full API keys, provider secrets, payment raw secrets

## Backend Checks

- Run migrations and seed only against intended environment.
- Verify `/api/app/config` for iOS, Android and Web.
- Verify `/v1/models` with a real customer API Key.
- Verify `/v1/chat/completions` against a real Provider Adapter.
- Verify wallet debit is idempotent.
- Verify insufficient balance returns HTTP 402.
- Verify payment webhook signatures.
- Verify order sync queries the payment platform.
- Verify refund writes reversal ledger.

## Web/Admin/App Checks

- Web customer login/register.
- Web model marketplace and API docs.
- Web payment order creation and status polling.
- Admin RBAC for platform admin vs tenant account.
- Admin payment order detail, callbacks, reconciliation, ledger.
- App iOS config only exposes Apple IAP unless policy allows Web link.
- App Android config uses android unified checkout.
- App chat estimate, send, actual cost display.
- App wallet, billing, API Key, report, deletion request.

## External Validation Required

The following cannot be honestly marked complete until real external credentials and signing are available:

- Real OpenAI/Anthropic/Gemini/DeepSeek/Qwen/AWS Bedrock calls.
- Real Alipay/WeChat/card checkout payment.
- Real Apple IAP sandbox and production verification.
- Real Android Alipay/WeChat SDK invocation.
- TestFlight build signing and review mode verification.
- Android APK/AAB signing and channel package verification.
