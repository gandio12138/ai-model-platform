import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/network/api_models.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';
import 'payment_adapters.dart';

class PaymentPage extends ConsumerStatefulWidget {
  const PaymentPage({super.key});

  @override
  ConsumerState<PaymentPage> createState() => _PaymentPageState();
}

class _PaymentPageState extends ConsumerState<PaymentPage> {
  String? _method;
  bool _submitting = false;

  Future<void> _createOrder(PaymentProduct product) async {
    final config = await ref.read(appConfigProvider.future);
    final launch = ref.read(launchContextProvider);
    final platform = launch.platform;
    final methods = _availableMethods(
      product,
      config.availablePaymentMethods,
      platform,
      config,
    );
    final paymentMethod = _method ?? (methods.isEmpty ? null : methods.first);
    if (paymentMethod == null) return;
    setState(() => _submitting = true);
    try {
      final order = await ref
          .read(apiProvider)
          .createPaymentOrder(
            productId: product.id,
            platform: platform,
            checkoutChannel: platform == 'ios'
                ? 'ios_iap'
                : 'android_unified_checkout',
            paymentMethod: paymentMethod,
            clientContext: {
              'app_version': launch.appVersion,
              'package_name': launch.packageName,
              'bundle_id': launch.bundleId,
              'distribution_channel': launch.distributionChannel,
              'device_id': launch.deviceId,
              'apple_product_id': product.appleProductId,
              'payment_method': paymentMethod,
            },
          );
      final launchResult = await _launchPayment(order, platform);
      if (!mounted) return;
      if (launchResult.message?.isNotEmpty == true) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(launchResult.message!)));
      }
      context.push('/payment/status/${order.orderNo}');
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(errorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: '充值',
      subtitle: '支付结果以服务端确认和钱包入账为准',
      child: FutureBuilder(
        future: Future.wait([
          ref.read(appConfigProvider.future),
          ref.read(apiProvider).fetchPaymentProducts(),
        ]),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AppLoading();
          }
          if (snapshot.hasError) {
            return AppEmptyState(
              title: '支付商品加载失败',
              description: errorMessage(snapshot.error!),
            );
          }
          final config = snapshot.data![0] as AppConfig;
          final products = snapshot.data![1] as List<PaymentProduct>;
          final platform = ref.read(launchContextProvider).platform;
          return ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              AppCard(
                child: Text(
                  config.paymentPageNotice.isEmpty
                      ? _defaultNotice(platform)
                      : config.paymentPageNotice,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppCard(
                child: Text(
                  config.settlementNotice.isEmpty
                      ? _settlementNotice(config.tenantBillingMode)
                      : config.settlementNotice,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              for (final product in products) ...[
                PaymentProductCard(
                  product: product,
                  availableMethods: _availableMethods(
                    product,
                    config.availablePaymentMethods,
                    platform,
                    config,
                  ),
                  selectedMethod: _method,
                  submitting: _submitting,
                  onMethodChanged: (value) => setState(() => _method = value),
                  onBuy: () => _createOrder(product),
                ),
                const SizedBox(height: AppSpacing.md),
              ],
              if (config.showWebPaymentLink && config.webPaymentUrl != null)
                AppCard(
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Web 付费入口'),
                    subtitle: Text(config.webPaymentUrl!),
                    trailing: const Icon(Icons.open_in_new_rounded),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  List<String> _availableMethods(
    PaymentProduct product,
    List<String> configMethods,
    String platform,
    AppConfig config,
  ) {
    final methods = product.paymentMethods
        .where(configMethods.contains)
        .toList();
    if (platform == 'ios') {
      if (!config.iosIapEnabled) return const [];
      return methods.where((item) => item == 'apple_iap').toList();
    }
    if (platform == 'android' && !config.androidUnifiedCheckoutEnabled) {
      return const [];
    }
    return methods.where((item) => item != 'apple_iap').toList();
  }

  Future<NativePaymentResult> _launchPayment(
    PaymentOrder order,
    String platform,
  ) {
    final NativePaymentAdapter adapter = platform == 'ios'
        ? IosIapPaymentAdapter()
        : AndroidUnifiedCheckoutAdapter();
    return adapter.launch(order);
  }

  String _defaultNotice(String platform) {
    if (platform == 'ios') {
      return '你正在通过 App Store 购买平台额度。支付、收据和退款由 Apple 处理，钱包到账以服务端确认结果为准。';
    }
    return '你正在通过平台安卓统一收银台购买额度。不同应用市场仅作为分发渠道，不进入支付主干。';
  }

  String _settlementNotice(String mode) {
    if (mode == 'revenue_share') {
      return '客户支付先进入同一钱包，平台按租户分成规则自动生成结算记录。';
    }
    if (mode == 'subscription_usage') {
      return '客户支付先进入同一钱包，租户套餐和用量账单由后台按周期汇总。';
    }
    if (mode == 'postpaid') {
      return '客户调用仍以钱包和授信控制为准，租户侧后付账单由后台根据实际用量汇总。';
    }
    return '客户支付进入同一钱包，App、Web 和 API 调用共用余额。';
  }
}

class PaymentProductCard extends StatelessWidget {
  const PaymentProductCard({
    required this.product,
    required this.availableMethods,
    required this.onBuy,
    super.key,
    this.selectedMethod,
    this.onMethodChanged,
    this.submitting = false,
  });

  final PaymentProduct product;
  final List<String> availableMethods;
  final String? selectedMethod;
  final ValueChanged<String>? onMethodChanged;
  final VoidCallback onBuy;
  final bool submitting;

  @override
  Widget build(BuildContext context) {
    final method =
        selectedMethod != null && availableMethods.contains(selectedMethod)
        ? selectedMethod
        : (availableMethods.isEmpty ? null : availableMethods.first);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  product.name,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              if (product.badge != null) AppBadge(label: product.badge!),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            product.description,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            centsToCurrency(product.saleAmount),
            style: Theme.of(context).textTheme.headlineLarge,
          ),
          Text(
            '到账 ${centsToCurrency(product.faceValueAmount)}，赠送 ${centsToCurrency(product.bonusAmount)}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: 8,
            children: [
              if (availableMethods.isEmpty)
                const AppBadge(label: '当前平台暂不可购买', color: AppColors.warning)
              else
                for (final item in availableMethods)
                  ChoiceChip(
                    label: Text(_methodName(item)),
                    selected: method == item,
                    onSelected: (_) => onMethodChanged?.call(item),
                  ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: availableMethods.isEmpty ? '暂无可用支付方式' : '创建订单并继续支付',
            fullWidth: true,
            loading: submitting,
            onPressed: availableMethods.isEmpty ? null : onBuy,
          ),
        ],
      ),
    );
  }

  String _methodName(String value) {
    return switch (value) {
      'apple_iap' => 'Apple IAP',
      'alipay_qr' => '支付宝',
      'alipay_app_pay' => '支付宝',
      'wechat_app_pay' => '微信支付',
      'alipay_app' => '支付宝',
      'wechat_app' => '微信支付',
      'card_hosted_checkout' => '银行卡',
      _ => value,
    };
  }
}
