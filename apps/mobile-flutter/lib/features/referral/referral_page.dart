import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/network/api_models.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class ReferralPage extends ConsumerWidget {
  const ReferralPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppPage(
      title: '代理 / 佣金',
      subtitle: '邀请关系和佣金以后台结算审核为准',
      child: FutureBuilder(
        future: Future.wait([
          ref.read(apiProvider).fetchReferralSummary(),
          ref.read(apiProvider).fetchReferralCommissions(),
        ]),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AppLoading();
          }
          if (snapshot.hasError) {
            return AppEmptyState(
              title: '代理数据加载失败',
              description: errorMessage(snapshot.error!),
            );
          }
          final summary = snapshot.data![0] as ReferralSummary;
          final records = snapshot.data![1] as List<CommissionRecord>;
          return ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('邀请码', style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            summary.inviteCode,
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                        ),
                        IconButton(
                          onPressed: () {
                            Clipboard.setData(
                              ClipboardData(text: summary.inviteCode),
                            );
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('邀请码已复制')),
                            );
                          },
                          icon: const Icon(Icons.copy_rounded),
                        ),
                      ],
                    ),
                    Text(
                      '已邀请 ${summary.invitedCustomers} 位客户',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: _MetricCard(
                      label: '可提现',
                      value: centsToCurrency(summary.availableCommission),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: _MetricCard(
                      label: '待结算',
                      value: centsToCurrency(summary.pendingCommission),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              AppCard(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('提交提现申请'),
                  subtitle: const Text('MVP 使用默认提现信息，后台审核后处理。'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: summary.availableCommission <= 0
                      ? null
                      : () async {
                          await ref
                              .read(apiProvider)
                              .requestCommissionWithdrawal(
                                amount: summary.availableCommission,
                                payoutMethod: 'manual_review',
                              );
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('提现申请已提交')),
                            );
                          }
                        },
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Text('佣金明细', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: AppSpacing.sm),
              if (records.isEmpty)
                const AppEmptyState(
                  title: '暂无佣金记录',
                  description: '邀请客户产生结算后会显示在这里。',
                )
              else
                for (final record in records) ...[
                  AppCard(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(centsToCurrency(record.amount)),
                      subtitle: Text(
                        '${record.sourceEmail ?? "来源客户"} · ${record.createdAt.toLocal().toString().substring(0, 16)}',
                      ),
                      trailing: Chip(label: Text(record.status)),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                ],
            ],
          );
        },
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: AppSpacing.xs),
          Text(value, style: Theme.of(context).textTheme.titleLarge),
        ],
      ),
    );
  }
}
