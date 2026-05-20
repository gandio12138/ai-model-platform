import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/network/api_models.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class PaymentStatusPage extends ConsumerStatefulWidget {
  const PaymentStatusPage({required this.orderId, super.key});

  final String orderId;

  @override
  ConsumerState<PaymentStatusPage> createState() => _PaymentStatusPageState();
}

class _PaymentStatusPageState extends ConsumerState<PaymentStatusPage> {
  Timer? _timer;
  PaymentOrder? _order;
  String? _error;
  bool _loading = true;
  bool _syncing = false;
  bool _cancelling = false;
  DateTime? _lastSyncedAt;

  @override
  void initState() {
    super.initState();
    _load(sync: true);
    _timer = Timer.periodic(const Duration(seconds: 3), (_) {
      final order = _order;
      if (order == null || order.terminal) {
        _timer?.cancel();
        return;
      }
      _load(sync: true, quiet: true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool sync = false, bool quiet = false}) async {
    if (_syncing) return;
    if (!quiet) {
      setState(() {
        _loading = _order == null;
        _syncing = sync;
        _error = null;
      });
    } else {
      _syncing = sync;
    }
    try {
      final api = ref.read(apiProvider);
      final order = sync
          ? await api.syncPaymentOrder(widget.orderId)
          : await api.fetchPaymentOrder(widget.orderId);
      if (!mounted) return;
      setState(() {
        _order = order;
        _loading = false;
        _syncing = false;
        _lastSyncedAt = DateTime.now();
      });
      if (order.terminal) _timer?.cancel();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = errorMessage(error);
        _loading = false;
        _syncing = false;
      });
    }
  }

  Future<void> _cancelOrder() async {
    final order = _order;
    if (order == null || !order.active) return;
    setState(() => _cancelling = true);
    try {
      final cancelled = await ref
          .read(apiProvider)
          .cancelPaymentOrder(order.orderNo);
      if (!mounted) return;
      setState(() => _order = cancelled);
      _timer?.cancel();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(errorMessage(error))));
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: '订单确认',
      subtitle: '到账以服务端验签、查单和钱包入账为准',
      child: _loading
          ? const AppLoading()
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                if (_error != null) ...[
                  AppEmptyState(title: '订单状态加载失败', description: _error!),
                  const SizedBox(height: AppSpacing.md),
                ],
                if (_order != null) ...[
                  _StatusHero(order: _order!, syncing: _syncing),
                  const SizedBox(height: AppSpacing.md),
                  _OrderSummary(order: _order!, lastSyncedAt: _lastSyncedAt),
                  const SizedBox(height: AppSpacing.md),
                  _PaymentActionCard(order: _order!),
                  const SizedBox(height: AppSpacing.md),
                  _NoticeCard(order: _order!),
                  const SizedBox(height: AppSpacing.md),
                  AppButton(
                    label: _syncing ? '正在查单' : '主动查单',
                    icon: Icons.refresh_rounded,
                    loading: _syncing,
                    fullWidth: true,
                    onPressed: _order!.terminal
                        ? null
                        : () => _load(sync: true),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  if (_order!.active)
                    AppButton(
                      label: '取消订单',
                      icon: Icons.close_rounded,
                      variant: AppButtonVariant.secondary,
                      loading: _cancelling,
                      fullWidth: true,
                      onPressed: _cancelOrder,
                    ),
                  const SizedBox(height: AppSpacing.sm),
                  AppButton(
                    label: _order!.fulfilled ? '查看钱包' : '返回充值页',
                    icon: _order!.fulfilled
                        ? Icons.account_balance_wallet_rounded
                        : Icons.payments_rounded,
                    variant: AppButtonVariant.secondary,
                    fullWidth: true,
                    onPressed: () =>
                        context.go(_order!.fulfilled ? '/wallet' : '/payment'),
                  ),
                ],
              ],
            ),
    );
  }
}

class _StatusHero extends StatelessWidget {
  const _StatusHero({required this.order, required this.syncing});

  final PaymentOrder order;
  final bool syncing;

  @override
  Widget build(BuildContext context) {
    final icon = _statusIcon(order);
    final color = _statusColor(order);
    return AppCard(
      child: Column(
        children: [
          Container(
            height: 76,
            width: 76,
            decoration: BoxDecoration(
              color: color.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(26),
            ),
            child: Icon(icon, size: 42, color: color),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            order.statusLabel,
            style: Theme.of(context).textTheme.headlineSmall,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            _statusMessage(order, syncing),
            style: Theme.of(context).textTheme.bodyMedium,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  IconData _statusIcon(PaymentOrder order) {
    if (order.fulfilled) return Icons.check_circle_rounded;
    if (order.paidWaitingFulfillment) return Icons.verified_rounded;
    if (order.failed || order.cancelled || order.expired) {
      return Icons.error_rounded;
    }
    if (order.refunded) return Icons.replay_circle_filled_rounded;
    return Icons.hourglass_top_rounded;
  }

  Color _statusColor(PaymentOrder order) {
    if (order.fulfilled) return AppColors.success;
    if (order.paidWaitingFulfillment) return AppColors.primary;
    if (order.failed || order.cancelled || order.expired) {
      return AppColors.danger;
    }
    if (order.refunded) return AppColors.warning;
    return AppColors.primary;
  }

  String _statusMessage(PaymentOrder order, bool syncing) {
    if (order.fulfilled) {
      return '钱包已到账：${centsToCurrency(order.amount)}';
    }
    if (order.paidWaitingFulfillment) {
      return '支付平台已确认收款，服务端正在执行钱包入账。';
    }
    if (order.active) {
      return syncing ? '正在向服务端查单...' : '请完成支付，App 将持续等待服务端确认。';
    }
    if (order.cancelled) return '订单已取消，不会产生扣款或入账。';
    if (order.expired) return '订单已过期，请重新创建订单。';
    if (order.failed) return '支付未完成，请返回充值页重新下单。';
    if (order.refunded) return '该订单已发生退款或冲正，请查看账单明细。';
    return '当前订单状态：${order.status}';
  }
}

class _OrderSummary extends StatelessWidget {
  const _OrderSummary({required this.order, required this.lastSyncedAt});

  final PaymentOrder order;
  final DateTime? lastSyncedAt;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('订单信息', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.md),
          _InfoRow(label: '订单号', value: order.orderNo, copyable: true),
          _InfoRow(label: '商品', value: order.productName ?? '充值额度包'),
          _InfoRow(label: '金额', value: centsToCurrency(order.amount)),
          _InfoRow(label: '支付方式', value: _methodName(order.paymentMethod)),
          _InfoRow(label: '服务端状态', value: order.statusLabel),
          if (order.providerTradeNo?.isNotEmpty == true)
            _InfoRow(
              label: '渠道流水',
              value: order.providerTradeNo!,
              copyable: true,
            ),
          if (lastSyncedAt != null)
            _InfoRow(label: '最近查单', value: formatDate(lastSyncedAt!)),
        ],
      ),
    );
  }
}

class _PaymentActionCard extends StatelessWidget {
  const _PaymentActionCard({required this.order});

  final PaymentOrder order;

  @override
  Widget build(BuildContext context) {
    final action = order.paymentAction;
    if (action == null) {
      return const AppCard(child: Text('当前订单没有客户端支付动作，请等待服务端查单或联系客服。'));
    }
    if (action.isAndroidUnifiedCheckout) {
      return AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('安卓统一收银台', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            Text(
              '支付方式：${_methodName(action.paymentMethod ?? order.paymentMethod)}',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              action.notice ?? '应用市场只作为分发渠道，支付仍由平台统一收银台处理。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: AppSpacing.md),
            const AppBadge(label: '原生 SDK 调起第二阶段接入', color: AppColors.warning),
          ],
        ),
      );
    }
    if (action.isQrCode) {
      return AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('二维码收银台', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            Text(
              '该动作主要用于 Web 或开发联调。移动端真实支付会走 iOS IAP 或安卓统一收银台。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: AppSpacing.md),
            _CodeBox(value: action.qrContent ?? action.url ?? ''),
          ],
        ),
      );
    }
    if (action.isCompanyTransfer) {
      return AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('对公转账', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            for (final item in action.instructions)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('• $item'),
              ),
          ],
        ),
      );
    }
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            action.title ?? '支付动作',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            action.notice ?? '请根据当前平台支付入口完成支付。',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({required this.order});

  final PaymentOrder order;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Text(
        order.checkoutChannel == 'ios_iap'
            ? 'iOS 购买由 App Store 处理支付、收据和退款。客户端支付完成后仍需提交服务端验签，只有服务端确认并写入钱包流水后才会到账。'
            : '安卓支付走 android_unified_checkout。支付宝、微信或银行卡只是底层 payment_method，不按手机品牌拆支付分支。支付完成后 App 只展示确认中，最终到账以后端订单 FULFILLED 为准。',
        style: Theme.of(context).textTheme.bodySmall,
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    required this.value,
    this.copyable = false,
  });

  final String label;
  final String value;
  final bool copyable;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 82,
            child: Text(label, style: Theme.of(context).textTheme.bodySmall),
          ),
          Expanded(
            child: Text(value, style: Theme.of(context).textTheme.bodyMedium),
          ),
          if (copyable)
            IconButton(
              visualDensity: VisualDensity.compact,
              icon: const Icon(Icons.copy_rounded, size: 18),
              onPressed: () => Clipboard.setData(ClipboardData(text: value)),
            ),
        ],
      ),
    );
  }
}

class _CodeBox extends StatelessWidget {
  const _CodeBox({required this.value});

  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.code,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Text(
                value.isEmpty ? '未返回二维码内容' : value,
                style: const TextStyle(
                  color: Colors.white,
                  fontFamily: 'monospace',
                  fontSize: 12,
                ),
              ),
            ),
          ),
          IconButton(
            color: Colors.white,
            icon: const Icon(Icons.copy_rounded, size: 18),
            onPressed: value.isEmpty
                ? null
                : () => Clipboard.setData(ClipboardData(text: value)),
          ),
        ],
      ),
    );
  }
}

String _methodName(String value) {
  return switch (value) {
    'apple_iap' => 'Apple IAP',
    'alipay_qr' || 'alipay_app_pay' || 'alipay_app' => '支付宝',
    'wechat_app_pay' || 'wechat_app' || 'wechat_native' => '微信支付',
    'card_hosted_checkout' => '银行卡',
    'unionpay_or_bank_card' => '银联/银行卡',
    'enterprise_transfer' => '对公转账',
    _ => value,
  };
}
