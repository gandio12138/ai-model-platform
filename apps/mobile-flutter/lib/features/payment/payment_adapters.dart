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
    return const NativePaymentResult(
      NativePaymentResultType.unsupported,
      message: 'StoreKit SDK integration is reserved for phase 2.',
    );
  }
}

class AndroidUnifiedCheckoutAdapter implements NativePaymentAdapter {
  @override
  Future<NativePaymentResult> launch(PaymentOrder order) async {
    return const NativePaymentResult(
      NativePaymentResultType.unsupported,
      message:
          'Alipay/WeChat/native checkout SDK launch is reserved for phase 2.',
    );
  }
}
