import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class WalletPage extends ConsumerWidget {
  const WalletPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppPage(
      title: '钱包',
      subtitle: '余额、充值和账单',
      child: PagePadding(
        child: FutureBuilder(
          future: ref.read(apiProvider).fetchWallet(),
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const AppLoading();
            }
            if (snapshot.hasError) {
              return AppEmptyState(
                title: '钱包加载失败',
                description: errorMessage(snapshot.error!),
              );
            }
            final wallet = snapshot.data!;
            return Column(
              children: [
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '可用余额',
                        style: Theme.of(context).textTheme.labelMedium,
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        centsToCurrency(wallet.availableBalance),
                        style: Theme.of(context).textTheme.headlineLarge,
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      Row(
                        children: [
                          Expanded(
                            child: _Balance(
                              label: '现金',
                              value: wallet.cashBalance,
                            ),
                          ),
                          Expanded(
                            child: _Balance(
                              label: '赠送',
                              value: wallet.bonusBalance,
                            ),
                          ),
                          Expanded(
                            child: _Balance(
                              label: '冻结',
                              value: wallet.frozenBalance,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: '充值 / 购买额度包',
                  icon: Icons.add_card_rounded,
                  fullWidth: true,
                  onPressed: () => context.push('/payment'),
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: '查看账单明细',
                  variant: AppButtonVariant.secondary,
                  fullWidth: true,
                  onPressed: () => context.push('/billing'),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Balance extends StatelessWidget {
  const _Balance({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        Text(
          centsToCurrency(value),
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ],
    );
  }
}
