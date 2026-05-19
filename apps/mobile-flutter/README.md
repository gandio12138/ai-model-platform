# OneToken Mobile Flutter

OneToken iOS / Android App MVP. The app follows the platform design documents:

- `ai-token-platform-full-implementation-plan-v2.2-saas-billing.md`
- `ai-token-platform-design-v1.2-unified-android-payment.md`

The mobile app uses Flutter, Riverpod, go_router, Dio, and flutter_secure_storage. Phase 1 does not integrate real payment SDKs; it implements UI, routing, API clients, payment order wrappers, and native payment adapter placeholders.

## Structure

```text
lib/
  main.dart
  main_dev.dart
  main_staging.dart
  main_prod.dart
  app/                 # bootstrap, env, router, theme
  core/                # network, storage, errors, config, utils
  design_system/       # tokens and reusable components
  features/            # auth, home, models, chat, wallet, payment, billing, developer, profile
assets/
integration_test/
test/
docs/mobile-test-plan.md
```

## Flavors And Environments

Recommended commands:

```bash
flutter run --flavor dev -t lib/main_dev.dart \
  --dart-define=APP_FLAVOR=dev \
  --dart-define=API_BASE_URL=http://127.0.0.1:4000 \
  --dart-define=USE_MOCKS=true

flutter run --flavor staging -t lib/main_staging.dart \
  --dart-define=APP_FLAVOR=staging \
  --dart-define=API_BASE_URL=https://staging-api.onetoken.one \
  --dart-define=USE_MOCKS=false

flutter run --flavor prod -t lib/main_prod.dart \
  --dart-define=APP_FLAVOR=prod \
  --dart-define=API_BASE_URL=https://api.onetoken.one
```

Android package names:

- dev: `com.onetoken.app.dev`
- staging: `com.onetoken.app.staging`
- prod: `com.onetoken.app`

iOS bundle ids are documented in `ios/Flutter/*.xcconfig`. Full Xcode scheme/config wiring should be verified after full Xcode is installed.

## Local Backend Address

- iOS Simulator can access the Mac backend through `http://127.0.0.1:4000`.
- Android Emulator usually needs `http://10.0.2.2:4000`.
- Physical devices need the Mac LAN IP, for example `http://192.168.1.10:4000`.

Use `--dart-define=API_BASE_URL=...` instead of hardcoding the address.

## Preview

The project is generated for iOS and Android. For UI-only development, use the debug route `/preview` after launching the app on a simulator or device.

iOS Simulator:

```bash
./scripts/run_ios17pro_dev.sh
```

The script finds `iPhone 17 Pro`, shuts down the plain `iPhone 17` simulator if
it was restored by Simulator.app, boots `iPhone 17 Pro`, and runs the dev app on
that device. Override defaults when needed:

```bash
USE_MOCKS=false API_BASE_URL=http://127.0.0.1:4000 ./scripts/run_ios17pro_dev.sh
IOS_SIMULATOR_NAME="iPhone 17 Pro Max" ./scripts/run_ios17pro_dev.sh
```

Stop the iPhone 17 Pro simulator:

```bash
./scripts/stop_ios17pro.sh
```

Android Emulator:

```bash
flutter run -d emulator-5554 --flavor dev -t lib/main_dev.dart \
  --dart-define=API_BASE_URL=http://10.0.2.2:4000
```

## Build

```bash
flutter build apk --flavor staging -t lib/main_staging.dart
flutter build appbundle --flavor prod -t lib/main_prod.dart
flutter build ipa --flavor staging -t lib/main_staging.dart
flutter build ipa --flavor prod -t lib/main_prod.dart
```

## iOS Real Device / TestFlight

1. Install full Xcode.
2. Open `ios/Runner.xcworkspace`.
3. Set Apple Developer Team.
4. Verify Bundle ID:
   - `com.onetoken.app.dev`
   - `com.onetoken.app.staging`
   - `com.onetoken.app`
5. Configure signing.
6. Run staging flavor on a device.
7. Configure App Store Connect consumable IAP products.
8. Use Sandbox Tester for IAP.
9. Submit IAP transaction data to `POST /api/payment/ios/iap/transactions`.
10. Refresh wallet only after server confirmation.

Flutter 3.44 may generate the iOS project with Swift Package Manager instead of CocoaPods. In that case `ios/Podfile` will not exist and `pod install` is not required. Use `flutter pub get` and `flutter run` directly. Only run `pod install` when a future plugin or project setting creates `ios/Podfile`.

If the project is later switched back to CocoaPods, run:

```bash
cd apps/mobile-flutter/ios
pod install
```

## Android Real Device

1. Install Android Studio and Android SDK.
2. Configure signing in `android/key.properties` and Gradle release signing.
3. Enable USB debugging on the device.
4. Run:

```bash
flutter run -d <device_id> --flavor staging -t lib/main_staging.dart
flutter build apk --flavor staging -t lib/main_staging.dart
flutter build appbundle --flavor prod -t lib/main_prod.dart
```

Set distribution channel with:

```bash
--dart-define=DISTRIBUTION_CHANNEL=official_apk
--dart-define=DISTRIBUTION_CHANNEL=huawei_market
--dart-define=DISTRIBUTION_CHANNEL=xiaomi_market
```

Distribution channel is only for review copy, analytics, risk control, and package source. It must not create Android brand-specific payment branches.

## Payment Notes

- iOS path: Apple IAP / StoreKit / App Store Server API.
- Android path: `android_unified_checkout`.
- Android payment methods can include `alipay_app_pay`, `wechat_app_pay`, `card_hosted_checkout`.
- Phase 1 only wraps order creation and status polling. Native SDK launch is isolated in `features/payment/payment_adapters.dart` for phase 2.
- Never credit wallet based only on client payment success. Wallet must refresh after payment-service verification, idempotency, lookup, and ledger write.

## Implemented API Client Paths

The app client expects these paths:

- `GET /api/app/config`
- `GET /api/public/bootstrap` as a compatibility fallback for app config
- `POST /api/public/auth/register`
- `POST /api/public/auth/login`
- `GET /api/public/me`
- `POST /api/account/delete-request`
- `GET /api/public/models`
- `POST /api/chat/estimate`
- `POST /api/chat/sessions`
- `GET /api/chat/sessions`
- `POST /api/chat/sessions/{id}/messages`
- `DELETE /api/chat/sessions/{id}`
- `GET /api/public/wallet`
- `GET /api/public/wallet/ledger`
- `GET /api/public/products`
- `POST /api/public/payment/orders`
- `GET /api/public/payment/orders/{order_no}`
- `GET /api/public/api-keys`
- `POST /api/public/api-keys`
- `POST /api/public/api-keys/{id}/revoke`
- `POST /api/reports/content`

## Backend Gaps To Confirm

Current server has `/api/public/*` web checkout endpoints, but the mobile design expects `/api/*` app endpoints. Do not map these casually without backend confirmation.

Missing or not confirmed:

- `GET /api/app/config`
- Refresh token and explicit logout semantics
- Chat session, estimate, and streaming message APIs
- iOS IAP transaction submit API
- Android order sync API under mobile naming
- Billing records API separate from wallet ledger
- Developer API Key PATCH/DELETE under `/api/developer`
- Referral summary/commission/withdrawal APIs
- Content report API
- Account deletion API and required legal copy

## Tests

```bash
flutter pub get
dart format .
flutter analyze
flutter test
flutter test integration_test
```

Integration tests use dev mock data unless `USE_MOCKS=false`.
