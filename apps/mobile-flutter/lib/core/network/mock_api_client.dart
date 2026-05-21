import 'dart:async';

import 'package:dio/dio.dart';

import '../../app/env.dart';
import '../config/app_context.dart';
import '../storage/token_store.dart';
import 'api_client.dart';
import 'api_models.dart';

class MockOneTokenApi implements OneTokenApi {
  MockOneTokenApi({required this.env, required this.tokenStore});

  final AppEnv env;
  final TokenStore tokenStore;
  final _user = const UserProfile(
    id: 'mock-user',
    email: 'victor@example.com',
    nickname: 'Victor',
  );
  final _wallet = const Wallet(
    cashBalance: 3520,
    bonusBalance: 680,
    frozenBalance: 0,
    availableBalance: 4200,
  );

  @override
  Future<AppConfig> fetchAppConfig(AppLaunchContext context) async {
    await Future<void>.delayed(const Duration(milliseconds: 180));
    final isIos = context.platform == 'ios';
    return AppConfig(
      tenantId: 'tenant_mock',
      projectId: 'project_mobile_mock',
      tenantBillingMode: 'prepaid',
      tenantPlanCode: 'starter',
      availablePaymentMethods: isIos
          ? const ['apple_iap']
          : const ['alipay_app_pay', 'wechat_app_pay', 'card_hosted_checkout'],
      showWebPaymentLink: !isIos,
      webPaymentUrl: 'https://www.onetoken.one/checkout',
      reviewMode: false,
      legalApproved: true,
      modelListEnabled: true,
      referralEnabled: false,
      developerApiEnabled: true,
      supportContact: 'support@onetoken.one',
      support: const {
        'email': 'support@onetoken.one',
        'help_center_url': 'https://www.onetoken.one/docs',
      },
      announcement: 'Dev mock：当前使用本地模拟数据，不代表正式环境。',
      contentSafetyNotice: '请勿输入敏感个人信息，AI 生成内容仅供参考。',
      privacyNoticeVariant: 'default',
      paymentPageNotice: isIos
          ? '你正在通过 App Store 购买平台额度，实际金额以 Apple 支付页面显示为准。'
          : '你正在通过平台安卓统一收银台购买额度，不同支付方式可能存在到账和退款路径差异。',
      settlementNotice: 'Mock 环境下客户付款进入同一钱包，正式环境会由服务端汇总租户结算记录。',
      iosIapEnabled: isIos,
      androidUnifiedCheckoutEnabled: !isIos,
      appDownload: const {
        'enabled': true,
        'show_on_web_home': true,
        'show_on_console': true,
        'show_on_payment_success': true,
      },
      branding: const {
        'site_name': 'OneToken',
        'hero_title': '一个 API Key，调用多家顶尖模型',
      },
      legal: const <String, dynamic>{},
      copy: const {
        'ai_disclaimer': 'AI 生成内容仅供参考，请遵守当地法律法规并避免输入敏感个人信息。',
        'estimated_cost_title': '发送前预估费用',
      },
      featureFlags: const {
        'content_report_enabled': true,
        'account_deletion_enabled': true,
        'developer_api_enabled': true,
      },
    );
  }

  @override
  Future<AuthSession> login(
    String account,
    String password,
    AppLaunchContext context,
  ) async {
    await tokenStore.save(
      const TokenPair(
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      ),
    );
    return AuthSession(
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      user: _user,
      wallet: _wallet,
    );
  }

  @override
  Future<AuthSession> register(
    String account,
    String password,
    AppLaunchContext context,
  ) => login(account, password, context);

  @override
  Future<void> logout() => tokenStore.clear();

  @override
  Future<UserProfile> me() async => _user;

  @override
  Future<void> requestAccountDeletion() async {}

  @override
  Future<List<ModelInfo>> fetchModels() async {
    try {
      return await _fetchPublicModelsFromBackend();
    } catch (_) {
      return _fallbackModels;
    }
  }

  @override
  Future<Wallet> fetchWallet() async => _wallet;

  @override
  Future<List<LedgerRecord>> fetchWalletLedger({int page = 1}) async => [
    LedgerRecord(
      id: 'ledger-1',
      type: 'payment.fulfill',
      amount: 30000,
      status: 'credit',
      createdAt: DateTime(2026, 5, 18, 21, 10),
      relatedId: 'OT202605180001',
    ),
    LedgerRecord(
      id: 'ledger-2',
      type: 'usage.charge',
      amount: 61,
      status: 'debit',
      createdAt: DateTime(2026, 5, 18, 14, 25),
      relatedId: 'req_mock_1001',
    ),
  ];

  @override
  Future<List<LedgerRecord>> fetchBillingRecords({int page = 1}) =>
      fetchWalletLedger(page: page);

  @override
  Future<List<PaymentProduct>> fetchPaymentProducts() async => const [
    PaymentProduct(
      id: 'iap_50',
      name: '入门额度包',
      description: '适合个人体验和轻量调用',
      saleAmount: 5000,
      faceValueAmount: 5000,
      bonusAmount: 500,
      paymentMethods: ['apple_iap', 'alipay_app_pay', 'wechat_app_pay'],
      badge: '推荐',
      appleProductId: 'onetoken.credit.50',
    ),
    PaymentProduct(
      id: 'team_300',
      name: '团队标准包',
      description: '适合连续对话和 API 调用',
      saleAmount: 30000,
      faceValueAmount: 30000,
      bonusAmount: 4500,
      paymentMethods: [
        'apple_iap',
        'alipay_app_pay',
        'wechat_app_pay',
        'card_hosted_checkout',
      ],
      badge: '热销',
      appleProductId: 'onetoken.credit.300',
    ),
  ];

  @override
  Future<PaymentOrder> createPaymentOrder({
    required String productId,
    required String platform,
    required String checkoutChannel,
    required String paymentMethod,
    required Map<String, dynamic> clientContext,
  }) async {
    return PaymentOrder(
      id: 'order_mock_1',
      orderNo: 'OTMOCK202605190001',
      status: 'PAYING',
      amount: productId == 'team_300' ? 30000 : 5000,
      paymentMethod: paymentMethod,
      checkoutChannel: checkoutChannel,
      clientPayload: const {'mock': true, 'next': 'SDK adapter placeholder'},
      paymentAction: PaymentAction(
        type: checkoutChannel == 'android_unified_checkout'
            ? 'android_unified_checkout'
            : 'ios_iap_placeholder',
        status: 'pending',
        title: paymentMethod,
        orderNo: 'OTMOCK202605190001',
        paymentMethod: paymentMethod,
        notice: 'Mock 订单只用于 dev 预览，正式环境不会通过客户端模拟入账。',
        clientPayload: const {'mock': true},
      ),
    );
  }

  @override
  Future<PaymentOrder> fetchPaymentOrder(String orderId) async {
    return PaymentOrder(
      id: orderId,
      orderNo: orderId,
      status: 'FULFILLED',
      amount: 5000,
      paymentMethod: 'mock',
      checkoutChannel: 'mock',
    );
  }

  @override
  Future<PaymentOrder> syncPaymentOrder(String orderId) =>
      fetchPaymentOrder(orderId);

  @override
  Future<PaymentOrder> cancelPaymentOrder(String orderId) async {
    return PaymentOrder(
      id: orderId,
      orderNo: orderId,
      status: 'CANCELLED',
      amount: 5000,
      paymentMethod: 'mock',
      checkoutChannel: 'mock',
    );
  }

  @override
  Future<IosIapVerificationResult> submitIosIapTransaction({
    required String productId,
    required String transactionId,
    required String signedTransactionInfo,
    String? originalTransactionId,
    String environment = 'Sandbox',
    String? appAccountToken,
  }) async {
    return IosIapVerificationResult(
      orderId: 'order_mock_iap',
      orderNo: 'OTMOCKIAP202605190001',
      orderStatus: 'FULFILLED',
      transactionId: transactionId,
      idempotent: false,
    );
  }

  @override
  Future<List<ApiKeyRecord>> fetchApiKeys() async => const [
    ApiKeyRecord(
      id: 'key-1',
      name: '移动端测试 Key',
      maskedKey: 'sk-ot-****-8X2D',
      status: 'active',
    ),
  ];

  @override
  Future<ApiKeyRecord> createApiKey(String name) async {
    return ApiKeyRecord(
      id: 'key-new',
      name: name,
      maskedKey: 'sk-ot-****-NEW',
      status: 'active',
      plainKey: 'sk-ot-dev-only',
    );
  }

  @override
  Future<void> updateApiKey(String id, String status) async {}

  @override
  Future<void> deleteApiKey(String id) async {}

  @override
  Future<List<ChatSession>> fetchChatSessions() async => [
    ChatSession(
      id: 'session-1',
      title: '模型能力咨询',
      modelCode: 'gpt-4o',
      messages: [
        ChatMessage(
          id: 'msg-1',
          role: ChatRole.assistant,
          content: '你好，我是 OneToken AI 助手。发送消息前会展示预计消耗，确认后再开始生成。',
          createdAt: DateTime.now().subtract(const Duration(minutes: 6)),
        ),
      ],
    ),
  ];

  @override
  Future<ChatSession> createChatSession(String modelCode) async {
    return ChatSession(
      id: 'session-${DateTime.now().millisecondsSinceEpoch}',
      title: '新的对话',
      modelCode: modelCode,
      messages: const [],
    );
  }

  @override
  Future<void> deleteChatSession(String id) async {}

  @override
  Future<ChatEstimate> estimateChat({
    required String modelCode,
    required List<ChatMessage> messages,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 240));
    return ChatEstimate(
      modelCode: modelCode,
      inputTokens: 1240,
      estimatedOutputTokens: 1500,
      outputTokenLimit: 2000,
      maxOutputTokens: 2000,
      estimatedCost: 83,
      currentBalance: _wallet.availableBalance,
    );
  }

  @override
  Stream<ChatStreamEvent> sendMessage({
    required String sessionId,
    required String modelCode,
    required String content,
  }) async* {
    final chunks = [
      '已确认预计消耗，',
      '现在通过 $modelCode 生成回复。',
      '这是流式输出示例，',
      '正式环境会连接后端 SSE/stream 接口。',
    ];
    for (final chunk in chunks) {
      await Future<void>.delayed(const Duration(milliseconds: 220));
      yield ChatStreamEvent(delta: chunk);
    }
    yield ChatStreamEvent(
      delta: '',
      done: true,
      usage: ChatUsage(
        actualCost: 61,
        inputTokens: 1220,
        outputTokens: 1486,
        modelCode: modelCode,
        chargedAt: DateTime(2026, 5, 18, 14, 25, 10),
      ),
    );
  }

  @override
  Future<ReferralSummary> fetchReferralSummary() async {
    return const ReferralSummary(
      inviteCode: 'WEBVIP88',
      invitedCustomers: 3,
      pendingCommission: 600,
      availableCommission: 2400,
      withdrawnCommission: 0,
      currency: 'CNY',
    );
  }

  @override
  Future<List<CommissionRecord>> fetchReferralCommissions({
    int page = 1,
  }) async {
    return [
      CommissionRecord(
        id: 'commission-1',
        amount: 2400,
        status: 'available',
        createdAt: DateTime(2026, 5, 18, 21, 30),
        sourceEmail: 'vip-customer@example.com',
      ),
      CommissionRecord(
        id: 'commission-2',
        amount: 600,
        status: 'pending',
        createdAt: DateTime(2026, 5, 19, 10, 20),
        sourceEmail: 'new-user@example.com',
      ),
    ];
  }

  @override
  Future<void> requestCommissionWithdrawal({
    required int amount,
    String? payoutMethod,
    String? payoutAccount,
  }) async {}

  @override
  Future<PolicyDocument> fetchPolicyDocument(String type) async {
    final title = switch (type) {
      'privacy' => '隐私政策',
      'disclaimer' => 'AI 生成内容免责声明',
      'report' => '内容举报说明',
      'help' => '帮助中心',
      _ => '用户协议',
    };
    return PolicyDocument(
      type: type,
      title: title,
      content:
          '$title：这是 dev mock 内容，正式环境会从 /api/compliance/policies/$type 获取发布版本。',
      version: 1,
    );
  }

  @override
  Future<void> reportContent({
    required String messageId,
    required String reason,
  }) async {}

  Future<List<ModelInfo>> _fetchPublicModelsFromBackend() async {
    final dio = Dio(
      BaseOptions(
        baseUrl: env.apiBaseUrl,
        connectTimeout: const Duration(seconds: 2),
        receiveTimeout: const Duration(seconds: 5),
      ),
    );
    final response = await dio.get<Map<String, dynamic>>(
      '/api/public/models',
      queryParameters: AppLaunchContext.fromEnv(env).toQuery(),
    );
    final data = response.data?['data'];
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((item) => ModelInfo.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  static const _fallbackModels = [
    ModelInfo(
      code: 'gpt-4o',
      name: 'GPT-4o',
      providerName: 'OpenAI',
      inputPer1k: 18,
      outputPer1k: 72,
      maxContextTokens: 128000,
      supportsStream: true,
      supportsTools: true,
    ),
    ModelInfo(
      code: 'claude-3-7-sonnet',
      name: 'Claude 3.7 Sonnet',
      providerName: 'Anthropic',
      inputPer1k: 24,
      outputPer1k: 120,
      maxContextTokens: 200000,
      supportsStream: true,
      supportsTools: true,
    ),
    ModelInfo(
      code: 'qwen-max',
      name: '通义千问 Max',
      providerName: '阿里巴巴',
      inputPer1k: 12,
      outputPer1k: 36,
      maxContextTokens: 128000,
      supportsStream: true,
      supportsTools: false,
    ),
  ];
}
