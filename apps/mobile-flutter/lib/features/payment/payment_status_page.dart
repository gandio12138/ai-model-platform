import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
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
  String _message = '支付结果确认中';
  bool _fulfilled = false;

  @override
  void initState() {
    super.initState();
    _sync();
    _timer = Timer.periodic(const Duration(seconds: 3), (_) => _sync());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _sync() async {
    try {
      final order = await ref
          .read(apiProvider)
          .syncPaymentOrder(widget.orderId);
      if (!mounted) return;
      setState(() {
        _fulfilled = order.fulfilled;
        _message = order.fulfilled
            ? '钱包已到账：${centsToCurrency(order.amount)}'
            : '服务端正在确认订单 ${order.status}';
      });
      if (order.fulfilled) _timer?.cancel();
    } catch (error) {
      if (!mounted) return;
      setState(() => _message = errorMessage(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: '订单状态',
      child: PagePadding(
        child: AppCard(
          child: Column(
            children: [
              Icon(
                _fulfilled
                    ? Icons.check_circle_rounded
                    : Icons.hourglass_top_rounded,
                size: 58,
                color: _fulfilled ? AppColors.success : AppColors.primary,
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                _message,
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '前端不会直接增加余额，权益到账必须以服务端验签、查单和钱包入账为准。',
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(label: '主动刷新', fullWidth: true, onPressed: _sync),
            ],
          ),
        ),
      ),
    );
  }
}
