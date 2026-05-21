import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/network/api_models.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class WalletPage extends ConsumerWidget {
  const WalletPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppPage(
      title: '钱包',
      subtitle: '余额、充值、冻结资金和最近流水',
      child: PagePadding(
        child: FutureBuilder<(Wallet, List<LedgerRecord>)>(
          future: _load(ref),
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const AppLoading(label: '读取钱包');
            }
            if (snapshot.hasError) {
              return AppEmptyState(
                title: '钱包加载失败',
                description: errorMessage(snapshot.error!),
              );
            }
            final wallet = snapshot.data!.$1;
            final ledger = snapshot.data!.$2.take(5).toList();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _WalletHero(wallet: wallet),
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: [
                    Expanded(
                      child: AppButton(
                        label: '充值',
                        icon: Icons.add_card_rounded,
                        onPressed: () => context.push('/payment'),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: AppButton(
                        label: '账单',
                        icon: Icons.receipt_long_rounded,
                        variant: AppButtonVariant.secondary,
                        onPressed: () => context.push('/billing'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: [
                    Expanded(
                      child: _BalanceTile(
                        label: '现金余额',
                        value: wallet.cashBalance,
                        icon: Icons.payments_rounded,
                        color: AppColors.primary,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: _BalanceTile(
                        label: '赠送额度',
                        value: wallet.bonusBalance,
                        icon: Icons.card_giftcard_rounded,
                        color: AppColors.success,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                _BalanceTile(
                  label: '冻结金额',
                  value: wallet.frozenBalance,
                  icon: Icons.lock_clock_rounded,
                  color: AppColors.warning,
                  fullWidth: true,
                ),
                const SizedBox(height: AppSpacing.md),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            '最近流水',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const Spacer(),
                          TextButton(
                            onPressed: () => context.push('/billing'),
                            child: const Text('查看全部'),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      if (ledger.isEmpty)
                        const AppEmptyState(
                          title: '暂无流水',
                          description: '充值或模型调用后会生成资金记录。',
                        )
                      else
                        for (final item in ledger) _LedgerTile(record: item),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                AppCard(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const AppBadge(label: '说明', color: AppColors.cyan),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          '对话和 API 调用共享同一个钱包。不同模型按后台发布价格扣费，实际消耗以服务端最终计费为准。',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppColors.textMuted),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.xxl),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<(Wallet, List<LedgerRecord>)> _load(WidgetRef ref) async {
    final api = ref.read(apiProvider);
    final wallet = api.fetchWallet();
    final ledger = api.fetchWalletLedger();
    return (await wallet, await ledger);
  }
}

class _WalletHero extends StatelessWidget {
  const _WalletHero({required this.wallet});

  final Wallet wallet;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          colors: [AppColors.primaryDark, AppColors.primary],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x332563EB),
            blurRadius: 30,
            offset: Offset(0, 16),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.account_balance_wallet_rounded,
                  color: Colors.white,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.24),
                  ),
                ),
                child: Text(
                  wallet.currency,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          Text(
            '可用余额',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Colors.white70,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            centsToCurrency(wallet.availableBalance),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 36,
              fontWeight: FontWeight.w900,
              height: 1.05,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            '现金 + 赠送额度 - 冻结金额',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: Colors.white70),
          ),
        ],
      ),
    );
  }
}

class _BalanceTile extends StatelessWidget {
  const _BalanceTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.fullWidth = false,
  });

  final String label;
  final int value;
  final IconData icon;
  final Color color;
  final bool fullWidth;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Row(
        children: [
          Container(
            height: 40,
            width: 40,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: Theme.of(context).textTheme.bodySmall),
                Text(
                  centsToCurrency(value),
                  style: TextStyle(
                    color: fullWidth ? AppColors.text : color,
                    fontWeight: FontWeight.w900,
                    fontSize: 17,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LedgerTile extends StatelessWidget {
  const _LedgerTile({required this.record});

  final LedgerRecord record;

  @override
  Widget build(BuildContext context) {
    final debit =
        record.amount < 0 ||
        record.status == 'debit' ||
        record.type.contains('charge');
    final amount = record.amount.abs();
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _showLedgerDetail(context, record, debit),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: AppColors.border)),
          ),
          child: Row(
            children: [
              Container(
                height: 36,
                width: 36,
                decoration: BoxDecoration(
                  color: (debit ? AppColors.warning : AppColors.success)
                      .withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  debit ? Icons.north_east_rounded : Icons.south_west_rounded,
                  color: debit ? AppColors.warning : AppColors.success,
                  size: 18,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _ledgerName(record.type),
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      formatDate(record.createdAt),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                '${debit ? '-' : '+'}${centsToCurrency(amount)}',
                style: TextStyle(
                  color: debit ? AppColors.warning : AppColors.success,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              const Icon(
                Icons.chevron_right_rounded,
                color: AppColors.textMuted,
                size: 18,
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showLedgerDetail(
    BuildContext context,
    LedgerRecord record,
    bool debit,
  ) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _ledgerName(record.type),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpacing.md),
              _DetailRow(
                label: '金额',
                value:
                    '${debit ? '-' : '+'}${centsToCurrency(record.amount.abs())}',
              ),
              _DetailRow(label: '状态', value: record.status),
              _DetailRow(label: '时间', value: formatDate(record.createdAt)),
              _DetailRow(label: '流水 ID', value: record.id),
              _DetailRow(label: '业务类型', value: record.type),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 84,
            child: Text(
              label,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}

String _ledgerName(String type) {
  return switch (type) {
    'usage.charge' => '模型调用扣费',
    'payment.fulfill' => '充值入账',
    'refund' || 'payment.refund' => '退款冲正',
    'freeze' => '资金冻结',
    'unfreeze' => '资金解冻',
    _ => type,
  };
}
