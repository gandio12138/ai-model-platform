DateTime _date(Object? value) {
  if (value is DateTime) return value;
  if (value is String) return DateTime.tryParse(value) ?? DateTime.now();
  return DateTime.now();
}

DateTime? _nullableDate(Object? value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value);
  return null;
}

int _int(Object? value) {
  if (value is int) return value;
  if (value is num) return value.round();
  if (value is String) return num.tryParse(value)?.round() ?? 0;
  return 0;
}

bool _bool(Object? value, [bool fallback = false]) {
  if (value is bool) return value;
  if (value is String) return value == 'true' || value == '1';
  return fallback;
}

String _string(Object? value, [String fallback = '']) {
  if (value == null) return fallback;
  return String.fromCharCodes(value.toString().runes);
}

List<String> _stringList(Object? value) {
  if (value is List) return value.map((item) => item.toString()).toList();
  return const [];
}

Map<String, dynamic> _map(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return const {};
}

class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    this.phone,
    this.nickname,
  });

  final String id;
  final String email;
  final String? phone;
  final String? nickname;

  String get displayName =>
      nickname?.isNotEmpty == true ? nickname! : email.split('@').first;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: _string(json['id'], 'me'),
      email: _string(json['email'], 'user@onetoken.one'),
      phone: json['phone']?.toString(),
      nickname: json['nickname']?.toString(),
    );
  }
}

class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.user,
    this.refreshToken,
    this.wallet,
  });

  final String accessToken;
  final String? refreshToken;
  final UserProfile user;
  final Wallet? wallet;

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      accessToken: _string(json['access_token'] ?? json['token']),
      refreshToken: json['refresh_token']?.toString(),
      user: UserProfile.fromJson(_map(json['user'])),
      wallet: json['wallet'] == null
          ? null
          : Wallet.fromJson(_map(json['wallet'])),
    );
  }
}

class AppConfig {
  const AppConfig({
    required this.tenantId,
    required this.projectId,
    required this.tenantBillingMode,
    required this.availablePaymentMethods,
    required this.showWebPaymentLink,
    required this.reviewMode,
    required this.legalApproved,
    required this.modelListEnabled,
    required this.referralEnabled,
    required this.developerApiEnabled,
    required this.supportContact,
    required this.support,
    required this.announcement,
    required this.contentSafetyNotice,
    required this.privacyNoticeVariant,
    required this.paymentPageNotice,
    required this.settlementNotice,
    required this.iosIapEnabled,
    required this.androidUnifiedCheckoutEnabled,
    required this.appDownload,
    required this.branding,
    required this.legal,
    required this.copy,
    required this.featureFlags,
    this.webPaymentUrl,
    this.tenantPlanCode,
  });

  final String tenantId;
  final String projectId;
  final String tenantBillingMode;
  final String? tenantPlanCode;
  final List<String> availablePaymentMethods;
  final bool showWebPaymentLink;
  final String? webPaymentUrl;
  final bool reviewMode;
  final bool legalApproved;
  final bool modelListEnabled;
  final bool referralEnabled;
  final bool developerApiEnabled;
  final String supportContact;
  final Map<String, dynamic> support;
  final String announcement;
  final String contentSafetyNotice;
  final String privacyNoticeVariant;
  final String paymentPageNotice;
  final String settlementNotice;
  final bool iosIapEnabled;
  final bool androidUnifiedCheckoutEnabled;
  final Map<String, dynamic> appDownload;
  final Map<String, dynamic> branding;
  final Map<String, dynamic> legal;
  final Map<String, dynamic> copy;
  final Map<String, dynamic> featureFlags;

  bool get contentReportEnabled =>
      _bool(featureFlags['content_report_enabled'], true);
  bool get accountDeletionEnabled =>
      _bool(featureFlags['account_deletion_enabled'], true);
  String get aiDisclaimer =>
      _string(copy['ai_disclaimer'], 'AI 生成内容仅供参考，请遵守当地法律法规并避免输入敏感个人信息。');
  String get helpCenterUrl => _string(support['help_center_url']);

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    return AppConfig(
      tenantId: _string(json['tenant_id'], 'platform_default_tenant'),
      projectId: _string(json['project_id'], 'mobile-app'),
      tenantBillingMode: _string(json['tenant_billing_mode'], 'prepaid'),
      tenantPlanCode: json['tenant_plan_code']?.toString(),
      availablePaymentMethods: _stringList(
        json['available_payment_methods'] ?? json['enabled_methods'],
      ),
      showWebPaymentLink: _bool(
        json['show_web_payment_link'] ?? json['show_web_pay_link'],
      ),
      webPaymentUrl:
          json['web_payment_url']?.toString() ??
          json['web_pay_url']?.toString(),
      reviewMode: _bool(json['review_mode']),
      legalApproved: _bool(json['legal_approved']),
      modelListEnabled: _bool(json['model_list_enabled'], true),
      referralEnabled: _bool(json['referral_enabled']),
      developerApiEnabled: _bool(json['developer_api_enabled'], true),
      supportContact: _supportText(json['support_contact']),
      support: _map(json['support_contact']),
      announcement: _string(json['announcement'], '欢迎使用 OneToken'),
      contentSafetyNotice: _string(
        json['content_safety_notice'],
        'AI 生成内容仅供参考，请遵守当地法律法规并避免输入敏感个人信息。',
      ),
      privacyNoticeVariant: _string(json['privacy_notice_variant'], 'default'),
      paymentPageNotice: _string(json['payment_page_notice']),
      settlementNotice: _string(json['settlement_notice']),
      iosIapEnabled: _bool(json['ios_iap_enabled'], true),
      androidUnifiedCheckoutEnabled: _bool(
        json['android_unified_checkout_enabled'],
        true,
      ),
      appDownload: json['app_download'] is Map
          ? Map<String, dynamic>.from(json['app_download'] as Map)
          : const <String, dynamic>{},
      branding: _map(json['branding']),
      legal: _map(json['legal']),
      copy: _map(json['copy']),
      featureFlags: _map(json['feature_flags']),
    );
  }
}

String _supportText(Object? value) {
  final map = _map(value);
  return _string(map['email'] ?? value, 'support@onetoken.one');
}

class Wallet {
  const Wallet({
    required this.cashBalance,
    required this.bonusBalance,
    required this.frozenBalance,
    required this.availableBalance,
    this.currency = 'CNY',
  });

  final int cashBalance;
  final int bonusBalance;
  final int frozenBalance;
  final int availableBalance;
  final String currency;

  factory Wallet.fromJson(Map<String, dynamic> json) {
    return Wallet(
      cashBalance: _int(json['cash_balance']),
      bonusBalance: _int(json['bonus_balance']),
      frozenBalance: _int(json['frozen_balance']),
      availableBalance: _int(json['available_balance']),
      currency: _string(json['currency'], 'CNY'),
    );
  }
}

class ModelInfo {
  const ModelInfo({
    required this.code,
    required this.name,
    required this.providerName,
    required this.inputPer1k,
    required this.outputPer1k,
    required this.maxContextTokens,
    required this.supportsStream,
    required this.supportsTools,
    this.category = '文本对话模型',
    this.toolsStatus = '待验证',
  });

  final String code;
  final String name;
  final String providerName;
  final String category;
  final String toolsStatus;
  final int inputPer1k;
  final int outputPer1k;
  final int maxContextTokens;
  final bool supportsStream;
  final bool supportsTools;

  factory ModelInfo.fromJson(Map<String, dynamic> json) {
    final price = _map(json['price']);
    final capabilities = _map(json['capabilities']);
    return ModelInfo(
      code: _string(json['model_code'] ?? json['code']),
      name: _string(json['display_name'] ?? json['name']),
      providerName: _string(
        json['model_company'] ??
            json['family'] ??
            json['provider_display_name'],
        '其他',
      ),
      inputPer1k: _int(price['input_per_1k']),
      outputPer1k: _int(price['output_per_1k']),
      maxContextTokens: _int(json['max_context_tokens']),
      supportsStream: _bool(capabilities['stream']),
      supportsTools: _bool(capabilities['tools']),
      category: _string(json['model_category_label'], '文本对话模型'),
      toolsStatus: _string(
        json['tools_status_label'],
        _bool(capabilities['tools']) ? '支持' : '待验证',
      ),
    );
  }
}

class PaymentProduct {
  const PaymentProduct({
    required this.id,
    required this.name,
    required this.description,
    required this.saleAmount,
    required this.faceValueAmount,
    required this.bonusAmount,
    required this.paymentMethods,
    this.badge,
    this.appleProductId,
  });

  final String id;
  final String name;
  final String description;
  final int saleAmount;
  final int faceValueAmount;
  final int bonusAmount;
  final List<String> paymentMethods;
  final String? badge;
  final String? appleProductId;

  factory PaymentProduct.fromJson(Map<String, dynamic> json) {
    return PaymentProduct(
      id: _string(json['id']),
      name: _string(json['display_name'] ?? json['name']),
      description: _string(json['display_description'] ?? json['description']),
      saleAmount: _int(json['sale_amount']),
      faceValueAmount: _int(json['face_value_amount']),
      bonusAmount: _int(json['bonus_amount']),
      paymentMethods: _stringList(json['payment_methods']),
      badge: json['badge']?.toString(),
      appleProductId:
          json['apple_product_id']?.toString() ??
          json['ios_product_id']?.toString(),
    );
  }
}

class PaymentOrder {
  const PaymentOrder({
    required this.id,
    required this.orderNo,
    required this.status,
    required this.amount,
    required this.paymentMethod,
    required this.checkoutChannel,
    this.clientPayload = const {},
    this.paymentAction,
    this.productName,
    this.currency = 'CNY',
    this.providerTradeNo,
    this.providerOrderStatus,
    this.paidAt,
    this.fulfilledAt,
    this.cancelledAt,
    this.refundedAt,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String orderNo;
  final String status;
  final int amount;
  final String currency;
  final String paymentMethod;
  final String checkoutChannel;
  final Map<String, dynamic> clientPayload;
  final PaymentAction? paymentAction;
  final String? productName;
  final String? providerTradeNo;
  final String? providerOrderStatus;
  final DateTime? paidAt;
  final DateTime? fulfilledAt;
  final DateTime? cancelledAt;
  final DateTime? refundedAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  String get normalizedStatus => status.toUpperCase();

  bool get fulfilled => normalizedStatus == 'FULFILLED';

  bool get paidWaitingFulfillment => normalizedStatus == 'PAID';

  bool get active => const {
    'CREATED',
    'PENDING',
    'PAYING',
    'PROCESSING',
  }.contains(normalizedStatus);

  bool get failed => const {'FAILED', 'ERROR'}.contains(normalizedStatus);

  bool get cancelled => normalizedStatus == 'CANCELLED';

  bool get expired => normalizedStatus == 'EXPIRED';

  bool get refunded => const {
    'REFUNDED',
    'PART_REFUNDED',
    'REVERSED',
  }.contains(normalizedStatus);

  bool get terminal => fulfilled || failed || cancelled || expired || refunded;

  String get statusLabel {
    return switch (normalizedStatus) {
      'CREATED' || 'PENDING' => '待支付',
      'PAYING' => '待支付',
      'PROCESSING' => '确认中',
      'PAID' => '已支付，待入账',
      'FULFILLED' => '已到账',
      'FAILED' || 'ERROR' => '支付失败',
      'CANCELLED' => '已取消',
      'EXPIRED' => '已过期',
      'REFUNDING' => '退款中',
      'REFUNDED' => '已退款',
      'PART_REFUNDED' => '部分退款',
      'REVERSED' => '已冲正',
      _ => status,
    };
  }

  factory PaymentOrder.fromJson(Map<String, dynamic> json) {
    final actionMap = _map(json['payment_action'] ?? json['client_payload']);
    final action = actionMap.isEmpty ? null : PaymentAction.fromJson(actionMap);
    return PaymentOrder(
      id: _string(json['id']),
      orderNo: _string(json['order_no'] ?? json['order_id']),
      status: _string(json['status'], 'pending'),
      amount: _int(json['amount']),
      currency: _string(json['currency'], 'CNY'),
      paymentMethod: _string(json['payment_method']),
      checkoutChannel: _string(json['checkout_channel']),
      clientPayload: _map(
        json['client_payload'] ??
            (actionMap['client_payload'] is Map
                ? actionMap['client_payload']
                : actionMap),
      ),
      paymentAction: action,
      productName:
          json['product_name']?.toString() ??
          json['product_display_name']?.toString(),
      providerTradeNo: json['provider_trade_no']?.toString(),
      providerOrderStatus: json['provider_order_status']?.toString(),
      paidAt: _nullableDate(json['paid_at']),
      fulfilledAt: _nullableDate(json['fulfilled_at']),
      cancelledAt: _nullableDate(json['cancelled_at']),
      refundedAt: _nullableDate(json['refunded_at']),
      createdAt: _nullableDate(json['created_at']),
      updatedAt: _nullableDate(json['updated_at']),
    );
  }
}

class PaymentAction {
  const PaymentAction({
    required this.type,
    this.provider,
    this.title,
    this.status,
    this.orderNo,
    this.paymentMethod,
    this.qrContent,
    this.expiresAt,
    this.url,
    this.notice,
    this.clientPayload = const {},
    this.instructions = const [],
    this.raw = const {},
  });

  final String type;
  final String? provider;
  final String? title;
  final String? status;
  final String? orderNo;
  final String? paymentMethod;
  final String? qrContent;
  final DateTime? expiresAt;
  final String? url;
  final String? notice;
  final Map<String, dynamic> clientPayload;
  final List<String> instructions;
  final Map<String, dynamic> raw;

  bool get isQrCode => type == 'qr_code' || type == 'mock_qr';

  bool get isAndroidUnifiedCheckout => type == 'android_unified_checkout';

  bool get isCompanyTransfer => type == 'company_transfer';

  factory PaymentAction.fromJson(Map<String, dynamic> json) {
    return PaymentAction(
      type: _string(json['type']),
      provider: json['provider']?.toString(),
      title: json['title']?.toString(),
      status: json['status']?.toString(),
      orderNo: json['order_no']?.toString(),
      paymentMethod: json['payment_method']?.toString(),
      qrContent:
          json['qr_content']?.toString() ??
          json['code_url']?.toString() ??
          json['url']?.toString(),
      expiresAt: _nullableDate(json['expires_at'] ?? json['qr_expires_at']),
      url: json['url']?.toString(),
      notice: json['notice']?.toString(),
      clientPayload: _map(json['client_payload']),
      instructions: _stringList(json['instructions']),
      raw: json,
    );
  }
}

class IosIapVerificationResult {
  const IosIapVerificationResult({
    required this.orderNo,
    required this.orderStatus,
    required this.transactionId,
    required this.idempotent,
    this.orderId,
  });

  final String? orderId;
  final String orderNo;
  final String orderStatus;
  final String transactionId;
  final bool idempotent;

  factory IosIapVerificationResult.fromJson(Map<String, dynamic> json) {
    final transaction = _map(json['transaction']);
    return IosIapVerificationResult(
      orderId: json['order_id']?.toString(),
      orderNo: _string(json['order_no']),
      orderStatus: _string(json['order_status']),
      transactionId: _string(
        transaction['transaction_id'] ?? json['transaction_id'],
      ),
      idempotent: _bool(json['idempotent']),
    );
  }
}

class LedgerRecord {
  const LedgerRecord({
    required this.id,
    required this.type,
    required this.amount,
    required this.status,
    required this.createdAt,
    this.relatedId,
  });

  final String id;
  final String type;
  final int amount;
  final String status;
  final DateTime createdAt;
  final String? relatedId;

  factory LedgerRecord.fromJson(Map<String, dynamic> json) {
    return LedgerRecord(
      id: _string(json['id']),
      type: _string(json['event_type'] ?? json['type']),
      amount: _int(json['amount']),
      status: _string(json['status'] ?? json['direction']),
      createdAt: _date(json['created_at']),
      relatedId:
          json['related_id']?.toString() ?? json['request_id']?.toString(),
    );
  }
}

class ApiKeyRecord {
  const ApiKeyRecord({
    required this.id,
    required this.name,
    required this.maskedKey,
    required this.status,
    this.plainKey,
  });

  final String id;
  final String name;
  final String maskedKey;
  final String status;
  final String? plainKey;

  factory ApiKeyRecord.fromJson(Map<String, dynamic> json) {
    return ApiKeyRecord(
      id: _string(json['id']),
      name: _string(json['name']),
      maskedKey: _string(json['masked_key']),
      status: _string(json['status'], 'active'),
      plainKey: json['key']?.toString(),
    );
  }
}

class ReferralSummary {
  const ReferralSummary({
    required this.inviteCode,
    required this.invitedCustomers,
    required this.pendingCommission,
    required this.availableCommission,
    required this.withdrawnCommission,
    required this.currency,
  });

  final String inviteCode;
  final int invitedCustomers;
  final int pendingCommission;
  final int availableCommission;
  final int withdrawnCommission;
  final String currency;

  factory ReferralSummary.fromJson(Map<String, dynamic> json) {
    return ReferralSummary(
      inviteCode: _string(json['invite_code']),
      invitedCustomers: _int(json['invited_customers']),
      pendingCommission: _int(json['pending_commission']),
      availableCommission: _int(json['available_commission']),
      withdrawnCommission: _int(json['withdrawn_commission']),
      currency: _string(json['currency'], 'CNY'),
    );
  }
}

class CommissionRecord {
  const CommissionRecord({
    required this.id,
    required this.amount,
    required this.status,
    required this.createdAt,
    this.sourceEmail,
  });

  final String id;
  final int amount;
  final String status;
  final DateTime createdAt;
  final String? sourceEmail;

  factory CommissionRecord.fromJson(Map<String, dynamic> json) {
    return CommissionRecord(
      id: _string(json['id']),
      amount: _int(json['commission_amount']),
      status: _string(json['status'], 'pending'),
      createdAt: _date(json['created_at']),
      sourceEmail: json['source_email']?.toString(),
    );
  }
}

class PolicyDocument {
  const PolicyDocument({
    required this.type,
    required this.title,
    required this.content,
    required this.version,
  });

  final String type;
  final String title;
  final String content;
  final int version;

  factory PolicyDocument.fromJson(Map<String, dynamic> json) {
    return PolicyDocument(
      type: _string(json['policy_type']),
      title: _string(json['title']),
      content: _string(json['content']),
      version: _int(json['version']),
    );
  }
}

class ChatEstimate {
  const ChatEstimate({
    required this.modelCode,
    required this.inputTokens,
    required this.estimatedOutputTokens,
    required this.outputTokenLimit,
    required this.maxOutputTokens,
    required this.estimatedCost,
    required this.currentBalance,
  });

  final String modelCode;
  final int inputTokens;
  final int estimatedOutputTokens;
  final int outputTokenLimit;
  final int maxOutputTokens;
  final int estimatedCost;
  final int currentBalance;

  bool get balanceEnough => currentBalance >= estimatedCost;

  factory ChatEstimate.fromJson(Map<String, dynamic> json) {
    return ChatEstimate(
      modelCode: _string(json['model'] ?? json['model_code']),
      inputTokens: _int(json['input_tokens']),
      estimatedOutputTokens: _int(
        json['estimated_output_tokens'] ?? json['output_token_limit'],
      ),
      outputTokenLimit: _int(
        json['output_token_limit'] ?? json['max_output_tokens'],
      ),
      maxOutputTokens: _int(
        json['max_output_tokens'] ?? json['output_token_limit'],
      ),
      estimatedCost: _int(json['estimated_cost']),
      currentBalance: _int(json['current_balance']),
    );
  }
}

class ChatUsage {
  const ChatUsage({
    required this.actualCost,
    required this.inputTokens,
    required this.outputTokens,
    required this.modelCode,
    required this.chargedAt,
  });

  final int actualCost;
  final int inputTokens;
  final int outputTokens;
  final String modelCode;
  final DateTime chargedAt;

  factory ChatUsage.fromJson(Map<String, dynamic> json) {
    return ChatUsage(
      actualCost: _int(json['actual_cost']),
      inputTokens: _int(json['input_tokens']),
      outputTokens: _int(json['output_tokens']),
      modelCode: _string(json['model'] ?? json['model_code']),
      chargedAt: _date(json['charged_at'] ?? json['created_at']),
    );
  }
}

enum ChatRole { user, assistant, system }

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
    this.usage,
    this.streaming = false,
    this.failed = false,
  });

  final String id;
  final ChatRole role;
  final String content;
  final DateTime createdAt;
  final ChatUsage? usage;
  final bool streaming;
  final bool failed;

  ChatMessage copyWith({
    String? content,
    ChatUsage? usage,
    bool? streaming,
    bool? failed,
  }) {
    return ChatMessage(
      id: id,
      role: role,
      content: content ?? this.content,
      createdAt: createdAt,
      usage: usage ?? this.usage,
      streaming: streaming ?? this.streaming,
      failed: failed ?? this.failed,
    );
  }

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final role = switch (_string(json['role'])) {
      'assistant' => ChatRole.assistant,
      'system' => ChatRole.system,
      _ => ChatRole.user,
    };
    return ChatMessage(
      id: _string(json['id']),
      role: role,
      content: _string(json['content']),
      createdAt: _date(json['created_at']),
      usage: json['usage'] == null
          ? null
          : ChatUsage.fromJson(_map(json['usage'])),
    );
  }
}

class ChatSession {
  const ChatSession({
    required this.id,
    required this.title,
    required this.modelCode,
    required this.messages,
  });

  final String id;
  final String title;
  final String modelCode;
  final List<ChatMessage> messages;

  factory ChatSession.fromJson(Map<String, dynamic> json) {
    return ChatSession(
      id: _string(json['id']),
      title: _string(json['title'], '新的对话'),
      modelCode: _string(json['model'] ?? json['model_code']),
      messages: (json['messages'] as List? ?? const [])
          .map((item) => ChatMessage.fromJson(_map(item)))
          .toList(),
    );
  }
}

class ChatStreamEvent {
  const ChatStreamEvent({required this.delta, this.done = false, this.usage});

  final String delta;
  final bool done;
  final ChatUsage? usage;
}
