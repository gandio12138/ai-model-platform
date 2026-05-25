import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_flutter/app/bootstrap.dart';
import 'package:mobile_flutter/app/env.dart';
import 'package:mobile_flutter/app/router.dart';
import 'package:mobile_flutter/core/network/api_client.dart';
import 'package:mobile_flutter/core/network/api_models.dart';
import 'package:mobile_flutter/core/network/mock_api_client.dart';
import 'package:mobile_flutter/core/storage/token_store.dart';
import 'package:mobile_flutter/design_system/tokens.dart';
import 'package:mobile_flutter/features/auth/auth_page.dart';
import 'package:mobile_flutter/features/billing/billing_page.dart';
import 'package:mobile_flutter/features/chat/chat_page.dart';
import 'package:mobile_flutter/features/home/home_page.dart';
import 'package:mobile_flutter/features/models/models_page.dart';
import 'package:mobile_flutter/features/payment/payment_page.dart';

void main() {
  late TokenStore tokenStore;
  late OneTokenApi api;
  const env = AppEnv(
    flavor: AppFlavor.dev,
    apiBaseUrl: 'http://127.0.0.1:4000',
    appName: 'OneToken Dev',
    appVersion: '1.0.0',
    packageName: 'com.onetoken.app.dev',
    bundleId: 'com.onetoken.app.dev',
    distributionChannel: 'test',
    region: 'CN',
    allowMockData: true,
    debugBanner: true,
  );

  setUp(() {
    tokenStore = MemoryTokenStore();
    api = MockOneTokenApi(env: env, tokenStore: tokenStore);
  });

  Widget wrap(Widget child) {
    return ProviderScope(
      overrides: [
        appEnvProvider.overrideWithValue(env),
        tokenStoreProvider.overrideWithValue(tokenStore),
        apiProvider.overrideWithValue(api),
      ],
      child: MaterialApp(home: child),
    );
  }

  testWidgets('login page renders', (tester) async {
    await tester.pumpWidget(wrap(const AuthPage()));
    expect(find.text('登录 OneToken'), findsOneWidget);
  });

  testWidgets('home page renders balance', (tester) async {
    await tokenStore.save(const TokenPair(accessToken: 'mock'));
    await tester.pumpWidget(wrap(const HomePage()));
    await tester.pumpAndSettle();
    expect(find.text('可用余额'), findsWidgets);
  });

  testWidgets('model card renders', (tester) async {
    const model = ModelInfo(
      code: 'gpt-4o',
      name: 'GPT-4o',
      providerName: 'OpenAI',
      inputPer1k: 18,
      outputPer1k: 72,
      maxContextTokens: 128000,
      supportsStream: true,
      supportsTools: true,
      category: '文本模型',
      toolsStatus: '支持',
    );
    await tester.pumpWidget(
      wrap(const Scaffold(body: ModelCard(model: model))),
    );
    expect(find.text('GPT-4o'), findsOneWidget);
  });

  testWidgets('chat bubble renders and estimate sheet confirms', (
    tester,
  ) async {
    final message = ChatMessage(
      id: 'm1',
      role: ChatRole.assistant,
      content: 'hello',
      createdAt: DateTime.now(),
    );
    await tester.pumpWidget(wrap(Scaffold(body: ChatBubble(message: message))));
    expect(find.text('hello'), findsOneWidget);

    const estimate = ChatEstimate(
      modelCode: 'gpt-4o',
      inputTokens: 1240,
      estimatedOutputTokens: 1500,
      outputTokenLimit: 2000,
      maxOutputTokens: 2000,
      estimatedCost: 83,
      currentBalance: 3520,
    );
    await tester.pumpWidget(
      wrap(const Scaffold(body: CostEstimateSheet(estimate: estimate))),
    );
    expect(find.text('确认发送'), findsOneWidget);
  });

  testWidgets('payment product card renders', (tester) async {
    const product = PaymentProduct(
      id: 'p1',
      name: '入门额度包',
      description: '测试',
      saleAmount: 5000,
      faceValueAmount: 5000,
      bonusAmount: 500,
      paymentMethods: ['apple_iap'],
    );
    await tester.pumpWidget(
      wrap(
        PaymentProductCard(
          product: product,
          availableMethods: const ['apple_iap'],
          onBuy: () {},
        ),
      ),
    );
    expect(find.text('入门额度包'), findsOneWidget);
  });

  testWidgets('billing record tile renders', (tester) async {
    final record = LedgerRecord(
      id: 'l1',
      type: 'usage.charge',
      amount: 61,
      status: 'debit',
      createdAt: DateTime.now(),
    );
    await tester.pumpWidget(
      wrap(Scaffold(body: BillingRecordTile(record: record))),
    );
    expect(find.text('模型调用扣费'), findsOneWidget);
  });

  testWidgets('empty and loading states render', (tester) async {
    await tester.pumpWidget(
      wrap(
        const Column(
          children: [
            Expanded(
              child: AppEmptyState(title: '暂无数据', description: '空状态'),
            ),
            Expanded(child: AppLoading()),
          ],
        ),
      ),
    );
    expect(find.text('暂无数据'), findsOneWidget);
    expect(find.text('加载中'), findsOneWidget);
  });
}
