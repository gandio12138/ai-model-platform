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
    final env = ref.watch(appEnvProvider);
    return AppPage(
      title: 'OneToken',
      subtitle: '企业级大模型服务平台',
      actions: [
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
                title: '首页加载失败',
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
                      const Text(
                        '用一个钱包和 API Key 调用多个海外顶尖模型',
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
                        title: '可用模型',
                        value: '${models.length}',
                        subtitle: '支持流式与工具调用',
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
                      _QuickAction(
                        label: '模型选择',
                        icon: Icons.hub_rounded,
                        onTap: () => context.go('/models'),
                      ),
                      _QuickAction(
                        label: 'API Key 管理',
                        icon: Icons.key_rounded,
                        onTap: () => context.push('/developer'),
                      ),
                      _QuickAction(
                        label: '账单明细',
                        icon: Icons.receipt_long_rounded,
                        onTap: () => context.push('/billing'),
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
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: AppColors.primary),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}
