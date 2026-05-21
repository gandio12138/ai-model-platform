import 'dart:async';

import 'package:dio/dio.dart';

import '../../app/env.dart';
import '../config/app_context.dart';
import '../errors/app_exception.dart';
import '../storage/token_store.dart';
import 'api_models.dart';
import 'local_network_permission.dart';
import 'mock_api_client.dart';

abstract class OneTokenApi {
  Future<AppConfig> fetchAppConfig(AppLaunchContext context);
  Future<AuthSession> login(
    String account,
    String password,
    AppLaunchContext context,
  );
  Future<AuthSession> register(
    String account,
    String password,
    AppLaunchContext context,
  );
  Future<void> logout();
  Future<UserProfile> me();
  Future<void> requestAccountDeletion();
  Future<List<ModelInfo>> fetchModels();
  Future<Wallet> fetchWallet();
  Future<List<LedgerRecord>> fetchWalletLedger({int page = 1});
  Future<List<LedgerRecord>> fetchBillingRecords({int page = 1});
  Future<List<PaymentProduct>> fetchPaymentProducts();
  Future<PaymentOrder> createPaymentOrder({
    required String productId,
    required String platform,
    required String checkoutChannel,
    required String paymentMethod,
    required Map<String, dynamic> clientContext,
  });
  Future<PaymentOrder> fetchPaymentOrder(String orderId);
  Future<PaymentOrder> syncPaymentOrder(String orderId);
  Future<PaymentOrder> cancelPaymentOrder(String orderId);
  Future<IosIapVerificationResult> submitIosIapTransaction({
    required String productId,
    required String transactionId,
    required String signedTransactionInfo,
    String? originalTransactionId,
    String environment = 'Sandbox',
    String? appAccountToken,
  });
  Future<List<ApiKeyRecord>> fetchApiKeys();
  Future<ApiKeyRecord> createApiKey(String name);
  Future<void> updateApiKey(String id, String status);
  Future<void> deleteApiKey(String id);
  Future<ReferralSummary> fetchReferralSummary();
  Future<List<CommissionRecord>> fetchReferralCommissions({int page = 1});
  Future<void> requestCommissionWithdrawal({
    required int amount,
    String? payoutMethod,
    String? payoutAccount,
  });
  Future<PolicyDocument> fetchPolicyDocument(String type);
  Future<List<ChatSession>> fetchChatSessions();
  Future<ChatSession> createChatSession(String modelCode);
  Future<void> deleteChatSession(String id);
  Future<ChatEstimate> estimateChat({
    required String modelCode,
    required List<ChatMessage> messages,
  });
  Stream<ChatStreamEvent> sendMessage({
    required String sessionId,
    required String modelCode,
    required String content,
  });
  Future<void> reportContent({
    required String messageId,
    required String reason,
  });
}

OneTokenApi createOneTokenApi({
  required AppEnv env,
  required TokenStore tokenStore,
  Dio? dio,
}) {
  if (env.allowMockData) {
    return MockOneTokenApi(env: env, tokenStore: tokenStore);
  }
  return DioOneTokenApi(env: env, tokenStore: tokenStore, dio: dio);
}

class DioOneTokenApi implements OneTokenApi {
  DioOneTokenApi({required this.env, required this.tokenStore, Dio? dio})
    : _dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: env.apiBaseUrl,
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 45),
              headers: {'Content-Type': 'application/json'},
            ),
          ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await tokenStore.read();
          if (token?.accessToken.isNotEmpty == true) {
            options.headers['Authorization'] = 'Bearer ${token!.accessToken}';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401) {
            await tokenStore.clear();
          }
          handler.reject(error);
        },
      ),
    );
  }

  final AppEnv env;
  final TokenStore tokenStore;
  final Dio _dio;
  Future<void>? _localNetworkWarmup;

  AppLaunchContext get _context => AppLaunchContext.fromEnv(env);
  MockOneTokenApi get _fallback =>
      MockOneTokenApi(env: env, tokenStore: tokenStore);

  @override
  Future<AppConfig> fetchAppConfig(AppLaunchContext context) async {
    try {
      final response = await _request(
        () => _dio.get(
          '/api/app/config',
          queryParameters: context.toQuery(),
          options: Options(headers: context.toHeaders()),
        ),
      );
      return AppConfig.fromJson(_dataMap(response));
    } on AppException catch (error) {
      if (error.statusCode != 404) rethrow;
      return _fetchAppConfigFromPublicBootstrap(context);
    }
  }

  @override
  Future<AuthSession> login(
    String account,
    String password,
    AppLaunchContext context,
  ) async {
    final response = await _request(
      () => _dio.post(
        '/api/auth/login',
        data: {
          'account': account,
          'email': account.contains('@') ? account : null,
          'phone': account.contains('@') ? null : account,
          'password': password,
          ...context.toQuery(),
        },
      ),
    );
    final session = AuthSession.fromJson(_dataMap(response));
    await tokenStore.save(
      TokenPair(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      ),
    );
    return session;
  }

  @override
  Future<AuthSession> register(
    String account,
    String password,
    AppLaunchContext context,
  ) async {
    final response = await _request(
      () => _dio.post(
        '/api/auth/register',
        data: {
          'account': account,
          'email': account.contains('@') ? account : null,
          'phone': account.contains('@') ? null : account,
          'password': password,
          ...context.toQuery(),
        },
      ),
    );
    final session = AuthSession.fromJson(_dataMap(response));
    await tokenStore.save(
      TokenPair(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      ),
    );
    return session;
  }

  @override
  Future<void> logout() async {
    final token = await tokenStore.read();
    final refreshToken = token?.refreshToken;
    if (refreshToken?.isNotEmpty == true) {
      try {
        await _request(
          () => _dio.post(
            '/api/auth/logout',
            data: {'refresh_token': refreshToken},
          ),
        );
      } on AppException {
        // Local credentials must still be cleared even when the server session
        // has already expired or the device is offline.
      }
    }
    await tokenStore.clear();
  }

  @override
  Future<UserProfile> me() async {
    final response = await _request(
      () => _dio.get('/api/me', queryParameters: _context.toQuery()),
    );
    return UserProfile.fromJson(
      _dataMap(response)['user'] as Map<String, dynamic>? ?? _dataMap(response),
    );
  }

  @override
  Future<void> requestAccountDeletion() async {
    try {
      await _request(() => _dio.post('/api/account/delete-request'));
    } on AppException catch (error) {
      if (_isMissingEndpoint(error)) return;
      rethrow;
    }
  }

  @override
  Future<List<ModelInfo>> fetchModels() async {
    final response = await _request(
      () => _dio.get('/api/models', queryParameters: _context.toQuery()),
    );
    return _dataList(response).map((item) => ModelInfo.fromJson(item)).toList();
  }

  @override
  Future<Wallet> fetchWallet() async {
    final response = await _request(
      () => _dio.get('/api/wallet', queryParameters: _context.toQuery()),
    );
    final data = _dataMap(response);
    return Wallet.fromJson(
      data['wallet'] is Map
          ? Map<String, dynamic>.from(data['wallet'] as Map)
          : data,
    );
  }

  @override
  Future<List<LedgerRecord>> fetchWalletLedger({int page = 1}) async {
    final response = await _request(
      () => _dio.get(
        '/api/wallet/ledger',
        queryParameters: {..._context.toQuery(), 'page': page},
      ),
    );
    return _dataList(
      response,
    ).map((item) => LedgerRecord.fromJson(item)).toList();
  }

  @override
  Future<List<LedgerRecord>> fetchBillingRecords({int page = 1}) async {
    final response = await _request(
      () => _dio.get(
        '/api/billing/records',
        queryParameters: {..._context.toQuery(), 'page': page},
      ),
    );
    return _dataList(
      response,
    ).map((item) => LedgerRecord.fromJson(item)).toList();
  }

  @override
  Future<List<PaymentProduct>> fetchPaymentProducts() async {
    final response = await _request(
      () => _dio.get(
        '/api/payment/products',
        queryParameters: _context.toQuery(),
      ),
    );
    return _dataList(
      response,
    ).map((item) => PaymentProduct.fromJson(item)).toList();
  }

  @override
  Future<PaymentOrder> createPaymentOrder({
    required String productId,
    required String platform,
    required String checkoutChannel,
    required String paymentMethod,
    required Map<String, dynamic> clientContext,
  }) async {
    final response = await _request(
      () => _dio.post(
        '/api/payment/orders',
        data: {
          ..._context.toQuery(),
          'product_id': productId,
          'platform': platform,
          'checkout_channel': checkoutChannel,
          'payment_method': paymentMethod,
          'client_context': clientContext,
        },
      ),
    );
    return PaymentOrder.fromJson(_dataMap(response));
  }

  @override
  Future<PaymentOrder> fetchPaymentOrder(String orderId) async {
    final response = await _request(
      () => _dio.get('/api/payment/orders/$orderId'),
    );
    return PaymentOrder.fromJson(_dataMap(response));
  }

  @override
  Future<PaymentOrder> syncPaymentOrder(String orderId) async {
    final response = await _request(
      () => _dio.post('/api/payment/orders/$orderId/sync'),
    );
    return PaymentOrder.fromJson(_dataMap(response));
  }

  @override
  Future<PaymentOrder> cancelPaymentOrder(String orderId) async {
    final response = await _request(
      () => _dio.post('/api/payment/orders/$orderId/cancel'),
    );
    return PaymentOrder.fromJson(_dataMap(response));
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
    final response = await _request(
      () => _dio.post(
        '/api/payment/ios/iap/transactions',
        data: {
          ..._context.toQuery(),
          'product_id': productId,
          'transaction_id': transactionId,
          'original_transaction_id': originalTransactionId,
          'signed_transaction_info': signedTransactionInfo,
          'environment': environment,
          'app_account_token': appAccountToken,
        },
      ),
    );
    return IosIapVerificationResult.fromJson(_dataMap(response));
  }

  @override
  Future<List<ApiKeyRecord>> fetchApiKeys() async {
    final response = await _request(
      () => _dio.get(
        '/api/developer/api-keys',
        queryParameters: _context.toQuery(),
      ),
    );
    return _dataList(
      response,
    ).map((item) => ApiKeyRecord.fromJson(item)).toList();
  }

  @override
  Future<ApiKeyRecord> createApiKey(String name) async {
    final response = await _request(
      () => _dio.post(
        '/api/developer/api-keys',
        data: {'name': name, ..._context.toQuery()},
      ),
    );
    final data = _dataMap(response);
    return ApiKeyRecord.fromJson(
      data['record'] is Map
          ? {
              ...Map<String, dynamic>.from(data['record'] as Map),
              'key': data['key'],
            }
          : data,
    );
  }

  @override
  Future<void> updateApiKey(String id, String status) async {
    if (status == 'revoked' || status == 'disabled' || status == 'inactive') {
      await _request(
        () =>
            _dio.patch('/api/developer/api-keys/$id', data: {'status': status}),
      );
      return;
    }
    throw const AppException('当前公共接口暂不支持重新启用 API Key');
  }

  @override
  Future<void> deleteApiKey(String id) async {
    await _request(() => _dio.delete('/api/developer/api-keys/$id'));
  }

  @override
  Future<ReferralSummary> fetchReferralSummary() async {
    final response = await _request(
      () => _dio.get(
        '/api/referral/summary',
        queryParameters: _context.toQuery(),
      ),
    );
    return ReferralSummary.fromJson(_dataMap(response));
  }

  @override
  Future<List<CommissionRecord>> fetchReferralCommissions({
    int page = 1,
  }) async {
    final response = await _request(
      () => _dio.get(
        '/api/referral/commissions',
        queryParameters: {..._context.toQuery(), 'page': page},
      ),
    );
    return _dataList(
      response,
    ).map((item) => CommissionRecord.fromJson(item)).toList();
  }

  @override
  Future<void> requestCommissionWithdrawal({
    required int amount,
    String? payoutMethod,
    String? payoutAccount,
  }) async {
    await _request(
      () => _dio.post(
        '/api/referral/withdrawals',
        data: {
          ..._context.toQuery(),
          'amount': amount,
          'payout_method': payoutMethod,
          'payout_account': payoutAccount,
          'requested_from': _context.platform,
        },
      ),
    );
  }

  @override
  Future<PolicyDocument> fetchPolicyDocument(String type) async {
    final response = await _request(
      () => _dio.get(
        '/api/compliance/policies/$type',
        queryParameters: {'variant': 'standard_cn'},
      ),
    );
    final list = _dataList(response);
    return PolicyDocument.fromJson(list.isEmpty ? _dataMap(response) : list[0]);
  }

  @override
  Future<List<ChatSession>> fetchChatSessions() async {
    try {
      final response = await _request(() => _dio.get('/api/chat/sessions'));
      return _dataList(
        response,
      ).map((item) => ChatSession.fromJson(item)).toList();
    } on AppException catch (error) {
      if (_isMissingEndpoint(error)) return _fallback.fetchChatSessions();
      rethrow;
    }
  }

  @override
  Future<ChatSession> createChatSession(String modelCode) async {
    try {
      final response = await _request(
        () => _dio.post('/api/chat/sessions', data: {'model': modelCode}),
      );
      return ChatSession.fromJson(_dataMap(response));
    } on AppException catch (error) {
      if (_isMissingEndpoint(error)) {
        return _fallback.createChatSession(modelCode);
      }
      rethrow;
    }
  }

  @override
  Future<void> deleteChatSession(String id) async {
    try {
      await _request(() => _dio.delete('/api/chat/sessions/$id'));
    } on AppException catch (error) {
      if (_isMissingEndpoint(error)) return;
      rethrow;
    }
  }

  @override
  Future<ChatEstimate> estimateChat({
    required String modelCode,
    required List<ChatMessage> messages,
  }) async {
    try {
      final response = await _request(
        () => _dio.post(
          '/api/chat/estimate',
          data: {
            'model': modelCode,
            'messages': messages
                .map(
                  (message) => {
                    'role': message.role.name,
                    'content': message.content,
                  },
                )
                .toList(),
          },
        ),
      );
      return ChatEstimate.fromJson(_dataMap(response));
    } on AppException catch (error) {
      if (_isMissingEndpoint(error)) {
        return _fallback.estimateChat(modelCode: modelCode, messages: messages);
      }
      rethrow;
    }
  }

  @override
  Stream<ChatStreamEvent> sendMessage({
    required String sessionId,
    required String modelCode,
    required String content,
  }) async* {
    try {
      final response = await _request(
        () => _dio.post(
          '/api/chat/sessions/$sessionId/messages',
          data: {'model': modelCode, 'content': content, 'stream': true},
        ),
      );
      final data = _dataMap(response);
      yield ChatStreamEvent(delta: data['content']?.toString() ?? '');
      if (data['usage'] is Map) {
        yield ChatStreamEvent(
          delta: '',
          done: true,
          usage: ChatUsage.fromJson(
            Map<String, dynamic>.from(data['usage'] as Map),
          ),
        );
      } else {
        yield const ChatStreamEvent(delta: '', done: true);
      }
    } on AppException catch (error) {
      if (!_isMissingEndpoint(error)) rethrow;
      yield* _fallback.sendMessage(
        sessionId: sessionId,
        modelCode: modelCode,
        content: content,
      );
    }
  }

  @override
  Future<void> reportContent({
    required String messageId,
    required String reason,
  }) async {
    try {
      await _request(
        () => _dio.post(
          '/api/reports/content',
          data: {'message_id': messageId, 'reason': reason},
        ),
      );
    } on AppException catch (error) {
      if (_isMissingEndpoint(error)) return;
      rethrow;
    }
  }

  Future<Response<dynamic>> _request(
    Future<Response<dynamic>> Function() run,
  ) async {
    try {
      _localNetworkWarmup ??= warmUpLocalNetworkPermission(env.apiBaseUrl);
      await _localNetworkWarmup;
      return await run();
    } on DioException catch (error) {
      final statusCode = error.response?.statusCode;
      final data = error.response?.data;
      final message = data is Map && data['message'] != null
          ? data['message'].toString()
          : _messageForStatus(
              statusCode,
              error.type,
              error.requestOptions.uri.toString(),
              error.message ?? error.error?.toString(),
            );
      throw AppException(message, statusCode: statusCode);
    }
  }

  String _messageForStatus(
    int? statusCode,
    DioExceptionType type,
    String uri,
    String? detail,
  ) {
    if (type == DioExceptionType.connectionTimeout ||
        type == DioExceptionType.receiveTimeout) {
      return '请求超时：$uri';
    }
    if (type == DioExceptionType.connectionError ||
        type == DioExceptionType.unknown) {
      return '无法连接到 API：$uri${detail == null ? '' : '（$detail）'}';
    }
    if (statusCode != null && statusCode >= 500) {
      return '服务端异常，请稍后重试';
    }
    return switch (statusCode) {
      401 => '登录已过期，请重新登录',
      403 => '当前账号没有权限',
      404 => '资源不存在',
      409 => '订单或状态冲突，请刷新后重试',
      422 => '参数错误，请检查输入',
      429 => '请求过于频繁，请稍后再试',
      _ => '网络异常，请稍后重试',
    };
  }

  bool _isMissingEndpoint(AppException error) => error.statusCode == 404;

  Map<String, dynamic> _dataMap(Response<dynamic> response) {
    final data = response.data;
    if (data is Map<String, dynamic>) {
      if (data['data'] is Map) {
        return Map<String, dynamic>.from(data['data'] as Map);
      }
      return data;
    }
    if (data is Map) return Map<String, dynamic>.from(data);
    return const {};
  }

  List<Map<String, dynamic>> _dataList(Response<dynamic> response) {
    final data = response.data;
    final list = data is Map
        ? data['data'] ?? data['products'] ?? data['payment_methods']
        : data;
    if (list is List) {
      return list
          .map(
            (item) => item is Map
                ? Map<String, dynamic>.from(item)
                : <String, dynamic>{},
          )
          .toList();
    }
    return const [];
  }

  Future<AppConfig> _fetchAppConfigFromPublicBootstrap(
    AppLaunchContext context,
  ) async {
    final response = await _request(
      () =>
          _dio.get('/api/public/bootstrap', queryParameters: context.toQuery()),
    );
    final data = _dataMap(response);
    final tenant = data['tenant'] is Map
        ? Map<String, dynamic>.from(data['tenant'] as Map)
        : const <String, dynamic>{};
    final project = data['project'] is Map
        ? Map<String, dynamic>.from(data['project'] as Map)
        : const <String, dynamic>{};
    final methods = data['payment_methods'] is List
        ? (data['payment_methods'] as List)
              .whereType<Map>()
              .map((item) => item['payment_method']?.toString() ?? '')
              .where((item) => item.isNotEmpty)
              .toList()
        : const <String>[];
    final isIos = context.platform == 'ios';
    return AppConfig(
      tenantId: tenant['id']?.toString() ?? context.tenantCode,
      projectId: project['id']?.toString() ?? context.projectCode,
      tenantBillingMode: tenant['billing_mode']?.toString() ?? 'prepaid',
      tenantPlanCode: tenant['current_plan_code']?.toString(),
      availablePaymentMethods: methods,
      showWebPaymentLink: !isIos,
      webPaymentUrl: !isIos ? '${env.apiBaseUrl}/checkout' : null,
      reviewMode: false,
      legalApproved: true,
      modelListEnabled: true,
      referralEnabled: false,
      developerApiEnabled: true,
      supportContact: 'support@onetoken.one',
      support: const {'email': 'support@onetoken.one'},
      announcement: '当前配置来自 /api/public/bootstrap，与 Web 客户端使用同一租户上下文。',
      contentSafetyNotice: '请勿输入敏感个人信息，AI 生成内容仅供参考。',
      privacyNoticeVariant: 'default',
      paymentPageNotice: isIos
          ? '你正在通过 App Store 购买平台额度，钱包到账以服务端确认结果为准。'
          : '你正在通过平台统一收银台购买额度，应用市场仅作为分发渠道，不进入支付主干。',
      settlementNotice: '客户付款进入同一钱包，租户结算由服务端基于支付订单和用量记录汇总。',
      iosIapEnabled: isIos,
      androidUnifiedCheckoutEnabled: !isIos,
      appDownload: data['app_download'] is Map
          ? Map<String, dynamic>.from(data['app_download'] as Map)
          : const <String, dynamic>{},
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
}
