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
  late OTokenApi api;
  const env = AppEnv(
    flavor: AppFlavor.dev,
    apiBaseUrl: 'http://127.0.0.1:4000',
    appName: 'oToken Dev',
    appVersion: '1.0.0',
    packageName: 'com.otoken.app.dev',
    bundleId: 'com.otoken.app.dev',
    distributionChannel: 'test',
    region: 'CN',
    allowMockData: true,
    debugBanner: true,
  );

  setUp(() {
    tokenStore = MemoryTokenStore();
    api = _FastMockOTokenApi(env: env, tokenStore: tokenStore);
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
    expect(find.text('登录账号'), findsOneWidget);
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

  testWidgets('chat bubble renders usage and compact copy action', (
    tester,
  ) async {
    final message = ChatMessage(
      id: 'm1',
      role: ChatRole.assistant,
      content: 'hello',
      createdAt: DateTime.now(),
      usage: ChatUsage(
        actualCost: 1,
        inputTokens: 41,
        outputTokens: 9,
        modelCode: 'gpt-4o',
        chargedAt: DateTime(2026, 5, 26, 10, 26, 58),
      ),
    );
    await tester.pumpWidget(wrap(Scaffold(body: ChatBubble(message: message))));
    expect(find.text('hello'), findsOneWidget);
    expect(find.textContaining('输入 41 tokens'), findsOneWidget);
    expect(find.byIcon(Icons.copy_rounded), findsOneWidget);
    expect(find.text('复制回复'), findsNothing);
  });

  testWidgets('chat page switches model and renders generated reply', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tokenStore.save(const TokenPair(accessToken: 'mock'));
    await tester.pumpWidget(wrap(const ChatPage()));
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();

    expect(find.text('gpt-4o'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.expand_more_rounded));
    await tester.pumpAndSettle();
    expect(find.text('切换模型'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, 'Claude');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, 'Claude 3.7 Sonnet'));
    await tester.pumpAndSettle();
    expect(find.text('claude-3-7-sonnet'), findsOneWidget);

    await tester.enterText(find.byType(TextField).last, '你好');
    await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
    await tester.pump(const Duration(milliseconds: 1200));
    await tester.pumpAndSettle();

    expect(find.textContaining('现在通过 claude-3-7-sonnet 生成回复'), findsOneWidget);
    expect(find.textContaining('输入'), findsWidgets);
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

class _FastMockOTokenApi extends MockOTokenApi {
  _FastMockOTokenApi({required super.env, required super.tokenStore});

  @override
  Future<List<ModelInfo>> fetchModels() async {
    return const [
      ModelInfo(
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
      ),
      ModelInfo(
        code: 'claude-3-7-sonnet',
        name: 'Claude 3.7 Sonnet',
        providerName: 'Claude',
        inputPer1k: 24,
        outputPer1k: 120,
        maxContextTokens: 200000,
        supportsStream: true,
        supportsTools: true,
        category: '文本模型',
        toolsStatus: '待验证',
      ),
    ];
  }
}
