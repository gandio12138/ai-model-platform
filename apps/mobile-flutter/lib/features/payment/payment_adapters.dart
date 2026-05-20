import '../../core/network/api_models.dart';

enum NativePaymentResultType { launched, cancelled, failed, unsupported }

class NativePaymentResult {
  const NativePaymentResult(this.type, {this.message});

  final NativePaymentResultType type;
  final String? message;
}

abstract class NativePaymentAdapter {
  Future<NativePaymentResult> launch(PaymentOrder order);
}

class IosIapPaymentAdapter implements NativePaymentAdapter {
  @override
  Future<NativePaymentResult> launch(PaymentOrder order) async {
    final productId = order.clientPayload['product_id']?.toString();
    return NativePaymentResult(
      NativePaymentResultType.unsupported,
      message: productId == null || productId.isEmpty
          ? '当前版本已创建服务端订单，但尚未接入 StoreKit 商品拉取和购买。'
          : '当前版本尚未接入 StoreKit 购买；后续会用商品 $productId 完成 Apple IAP 并提交服务端验签。',
    );
  }
}

class AndroidUnifiedCheckoutAdapter implements NativePaymentAdapter {
  @override
  Future<NativePaymentResult> launch(PaymentOrder order) async {
    final action = order.paymentAction;
    final method = action?.paymentMethod ?? order.paymentMethod;
    final payload = action?.clientPayload ?? order.clientPayload;
    final hasAlipayPayload =
        method.contains('alipay') && payload['alipay'] is Map;
    final hasWechatPayload =
        method.contains('wechat') && payload['wechat'] is Map;
    final hasHostedCard =
        method.contains('card') &&
        (payload['card'] is Map || action?.url != null);

    if (hasAlipayPayload || hasWechatPayload || hasHostedCard) {
      return NativePaymentResult(
        NativePaymentResultType.unsupported,
        message:
            '${_methodName(method)}订单已创建。原生 SDK 调起将在第二阶段接入，当前请进入订单确认页等待服务端查单结果。',
      );
    }

    return NativePaymentResult(
      NativePaymentResultType.unsupported,
      message: '当前支付方式缺少可调起的客户端参数，请检查后台支付渠道配置。',
    );
  }

  String _methodName(String value) {
    return switch (value) {
      'alipay_app_pay' || 'alipay_app' || 'alipay_qr' => '支付宝',
      'wechat_app_pay' || 'wechat_app' || 'wechat_native' => '微信支付',
      'card_hosted_checkout' => '银行卡',
      _ => value,
    };
  }
}
