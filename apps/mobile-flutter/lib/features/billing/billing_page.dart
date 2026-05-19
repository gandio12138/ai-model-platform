import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/network/api_models.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class BillingPage extends ConsumerWidget {
  const BillingPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppPage(
      title: '账单明细',
      subtitle: '充值、消费、冻结和退款流水',
      child: FutureBuilder<List<LedgerRecord>>(
        future: ref.read(apiProvider).fetchWalletLedger(),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AppLoading();
          }
          if (snapshot.hasError) {
            return AppEmptyState(
              title: '账单加载失败',
              description: errorMessage(snapshot.error!),
            );
          }
          final records = snapshot.data ?? const [];
          if (records.isEmpty) {
            return const AppEmptyState(
              title: '暂无账单',
              description: '发生充值或模型调用后会生成账单。',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(AppSpacing.md),
            itemCount: records.length,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
            itemBuilder: (context, index) =>
                BillingRecordTile(record: records[index]),
          );
        },
      ),
    );
  }
}

class BillingRecordTile extends StatelessWidget {
  const BillingRecordTile({required this.record, super.key});

  final LedgerRecord record;

  @override
  Widget build(BuildContext context) {
    final isDebit = record.status == 'debit';
    return AppCard(
      child: Row(
        children: [
          Icon(
            isDebit ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded,
            color: isDebit ? AppColors.danger : AppColors.success,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _typeName(record.type),
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                Text(
                  formatDate(record.createdAt),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (record.relatedId != null)
                  Text(
                    record.relatedId!,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
          ),
          Text(
            '${isDebit ? '-' : '+'}${centsToCurrency(record.amount)}',
            style: TextStyle(
              fontWeight: FontWeight.w900,
              color: isDebit ? AppColors.danger : AppColors.success,
            ),
          ),
        ],
      ),
    );
  }

  String _typeName(String type) {
    return switch (type) {
      'payment.fulfill' => '充值到账',
      'payment.bonus' => '充值赠送',
      'usage.charge' => '模型调用扣费',
      'refund' => '退款',
      _ => type,
    };
  }
}
