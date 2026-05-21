import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/bootstrap.dart';
import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);
    final configValue = config.maybeWhen(
      data: (value) => value,
      orElse: () => null,
    );
    final env = ref.watch(appEnvProvider);
    return AppPage(
      title: '概览',
      subtitle: '余额、模型和开发者入口',
      actions: env.isProd
          ? const []
          : [
              IconButton(
                onPressed: () => context.push('/preview'),
                icon: const Icon(Icons.tune_rounded),
              ),
            ],
      child: PagePadding(
        child: FutureBuilder(
          future: Future.wait([
            ref.read(apiProvider).me(),
            ref.read(apiProvider).fetchWallet(),
            ref.read(apiProvider).fetchModels(),
          ]),
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const AppLoading();
            }
            if (snapshot.hasError) {
              final error = snapshot.error;
              if (error is AppException && error.statusCode == 401) {
                WidgetsBinding.instance.addPostFrameCallback((_) async {
                  await ref.read(tokenStoreProvider).clear();
                  if (context.mounted) context.go('/auth');
                });
                return const AppLoading();
              }
              return AppEmptyState(
                title: '概览加载失败',
                description: errorMessage(error!),
                actionLabel: '重试',
                onAction: () => ref.invalidate(appConfigProvider),
              );
            }
            final user = snapshot.data![0] as dynamic;
            final wallet = snapshot.data![1] as dynamic;
            final models = snapshot.data![2] as List<dynamic>;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: double.infinity,
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
                      Text(
                        '早上好，${user.displayName}',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        configValue?.branding['hero_title']?.toString() ??
                            '一个账户，统一使用模型、API Key 和钱包余额',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 26,
                          fontWeight: FontWeight.w900,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      Row(
                        children: [
                          AppButton(
                            label: '新建对话',
                            icon: Icons.add_comment_rounded,
                            onPressed: () => context.go('/chat'),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          AppButton(
                            label: '充值',
                            variant: AppButtonVariant.secondary,
                            onPressed: () => context.push('/payment'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                Row(
                  children: [
                    Expanded(
                      child: MetricCard(
                        title: '可用余额',
                        value: centsToCurrency(wallet.availableBalance),
                        subtitle: '现金 + 赠送额度',
                        icon: Icons.account_balance_wallet_rounded,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: MetricCard(
                        title: '可调用模型',
                        value: '${models.length}',
                        subtitle: '对话页直接切换',
                        icon: Icons.dataset_rounded,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '快捷入口',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: AppSpacing.md),
                      GridView.count(
                        crossAxisCount: 2,
                        crossAxisSpacing: AppSpacing.sm,
                        mainAxisSpacing: AppSpacing.sm,
                        childAspectRatio: 1.72,
                        physics: const NeverScrollableScrollPhysics(),
                        shrinkWrap: true,
                        children: [
                          _QuickAction(
                            label: '新建对话',
                            icon: Icons.add_comment_rounded,
                            onTap: () => context.go('/chat'),
                          ),
                          _QuickAction(
                            label: '充值',
                            icon: Icons.add_card_rounded,
                            onTap: () => context.push('/payment'),
                          ),
                          if (configValue?.modelListEnabled ?? true)
                            _QuickAction(
                              label: '模型目录',
                              icon: Icons.hub_rounded,
                              onTap: () => context.go('/models'),
                            ),
                          if (configValue?.developerApiEnabled ?? true)
                            _QuickAction(
                              label: 'API Key',
                              icon: Icons.key_rounded,
                              onTap: () => context.push('/developer'),
                            ),
                          _QuickAction(
                            label: '账单明细',
                            icon: Icons.receipt_long_rounded,
                            onTap: () => context.push('/billing'),
                          ),
                          _QuickAction(
                            label: '使用日志',
                            icon: Icons.history_rounded,
                            onTap: () => context.push('/developer'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                config.when(
                  data: (value) => AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const AppBadge(label: '公告'),
                            if (env.allowMockData) ...[
                              const SizedBox(width: AppSpacing.xs),
                              const AppBadge(
                                label: 'DEV MOCK',
                                color: AppColors.warning,
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Text(value.announcement),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          value.contentSafetyNotice,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                  error: (error, stackTrace) =>
                      AppCard(child: Text(errorMessage(error))),
                  loading: () => const AppLoading(label: '读取 App 配置'),
                ),
                const SizedBox(height: AppSpacing.xxl),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceSoft,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: AppColors.primary),
              const Spacer(),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      label,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded, size: 18),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
