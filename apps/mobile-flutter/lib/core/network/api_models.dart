DateTime _date(Object? value) {
  if (value is DateTime) return value;
  if (value is String) return DateTime.tryParse(value) ?? DateTime.now();
  return DateTime.now();
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
    required this.availablePaymentMethods,
    required this.showWebPaymentLink,
    required this.reviewMode,
    required this.legalApproved,
    required this.modelListEnabled,
    required this.referralEnabled,
    required this.developerApiEnabled,
    required this.supportContact,
    required this.announcement,
    required this.contentSafetyNotice,
    required this.privacyNoticeVariant,
    required this.paymentPageNotice,
    this.webPaymentUrl,
  });

  final String tenantId;
  final String projectId;
  final List<String> availablePaymentMethods;
  final bool showWebPaymentLink;
  final String? webPaymentUrl;
  final bool reviewMode;
  final bool legalApproved;
  final bool modelListEnabled;
  final bool referralEnabled;
  final bool developerApiEnabled;
  final String supportContact;
  final String announcement;
  final String contentSafetyNotice;
  final String privacyNoticeVariant;
  final String paymentPageNotice;

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    return AppConfig(
      tenantId: _string(json['tenant_id'], 'platform_default_tenant'),
      projectId: _string(json['project_id'], 'mobile-app'),
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
      supportContact: _string(json['support_contact'], 'support@onetoken.one'),
      announcement: _string(json['announcement'], '欢迎使用 OneToken'),
      contentSafetyNotice: _string(
        json['content_safety_notice'],
        'AI 生成内容仅供参考，请遵守当地法律法规并避免输入敏感个人信息。',
      ),
      privacyNoticeVariant: _string(json['privacy_notice_variant'], 'default'),
      paymentPageNotice: _string(json['payment_page_notice']),
    );
  }
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
  });

  final String code;
  final String name;
  final String providerName;
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
        json['provider_display_name'] ?? json['family'],
        '高速线路',
      ),
      inputPer1k: _int(price['input_per_1k']),
      outputPer1k: _int(price['output_per_1k']),
      maxContextTokens: _int(json['max_context_tokens']),
      supportsStream: _bool(capabilities['stream']),
      supportsTools: _bool(capabilities['tools']),
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
  });

  final String id;
  final String orderNo;
  final String status;
  final int amount;
  final String paymentMethod;
  final String checkoutChannel;
  final Map<String, dynamic> clientPayload;

  bool get fulfilled =>
      status.toLowerCase() == 'fulfilled' || status.toLowerCase() == 'paid';

  factory PaymentOrder.fromJson(Map<String, dynamic> json) {
    return PaymentOrder(
      id: _string(json['id']),
      orderNo: _string(json['order_no'] ?? json['order_id']),
      status: _string(json['status'], 'pending'),
      amount: _int(json['amount']),
      paymentMethod: _string(json['payment_method']),
      checkoutChannel: _string(json['checkout_channel']),
      clientPayload: _map(json['client_payload'] ?? json['payment_action']),
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

class ChatEstimate {
  const ChatEstimate({
    required this.modelCode,
    required this.inputTokens,
    required this.outputTokenLimit,
    required this.estimatedCost,
    required this.currentBalance,
  });

  final String modelCode;
  final int inputTokens;
  final int outputTokenLimit;
  final int estimatedCost;
  final int currentBalance;

  bool get balanceEnough => currentBalance >= estimatedCost;

  factory ChatEstimate.fromJson(Map<String, dynamic> json) {
    return ChatEstimate(
      modelCode: _string(json['model'] ?? json['model_code']),
      inputTokens: _int(json['input_tokens']),
      outputTokenLimit: _int(
        json['output_token_limit'] ?? json['max_output_tokens'],
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
