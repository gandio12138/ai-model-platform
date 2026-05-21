import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/bootstrap.dart';
import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';
import '../app_config/api_endpoint_dialog.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final env = ref.watch(appEnvProvider);
    final config = ref.watch(
      appConfigProvider.select(
        (value) =>
            value.maybeWhen(data: (config) => config, orElse: () => null),
      ),
    );
    final legal = config?.legal ?? const <String, dynamic>{};
    final branding = config?.branding ?? const <String, dynamic>{};
    final helpCenterUrl = config?.helpCenterUrl ?? '';
    return AppPage(
      title: '我的',
      subtitle: '账号、安全和帮助',
      child: PagePadding(
        child: FutureBuilder(
          future: ref.read(apiProvider).me(),
          builder: (context, snapshot) {
            final user = snapshot.data;
            return Column(
              children: [
                AppCard(
                  child: Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: AppColors.primary,
                        child: Text(
                          (user?.displayName ?? 'U').characters.first,
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.displayName ?? '未登录',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            Text(
                              user?.email ?? '',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                AppCard(
                  child: Column(
                    children: [
                      if (!env.isProd)
                        _Setting(
                          label: '开发设置：API 地址',
                          value: ref.watch(apiBaseUrlProvider),
                          onTap: () => showApiEndpointDialog(context, ref),
                        ),
                      _Setting(
                        label: '用户协议',
                        value: legal['terms_url']?.toString(),
                        onTap: () => context.push('/compliance/terms'),
                      ),
                      _Setting(
                        label: '隐私政策',
                        value: legal['privacy_url']?.toString(),
                        onTap: () => context.push('/compliance/privacy'),
                      ),
                      _Setting(
                        label: 'AI 生成内容免责声明',
                        onTap: () => context.push('/compliance/disclaimer'),
                      ),
                      if (config?.contentReportEnabled ?? true)
                        _Setting(
                          label: '内容举报',
                          onTap: () => context.push('/compliance/report'),
                        ),
                      _Setting(
                        label: '帮助中心 / 客服',
                        value: helpCenterUrl.isNotEmpty
                            ? helpCenterUrl
                            : config?.supportContact,
                        onTap: () => context.push('/compliance/help'),
                      ),
                      if (config?.referralEnabled ?? false)
                        _Setting(
                          label: '邀请返佣',
                          onTap: () => context.push('/referral'),
                        ),
                      if (config?.accountDeletionEnabled ?? true)
                        _Setting(
                          label: '账号注销',
                          danger: true,
                          onTap: () => _deleteAccount(context, ref),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: '退出登录',
                  variant: AppButtonVariant.secondary,
                  fullWidth: true,
                  onPressed: () async {
                    await ref.read(apiProvider).logout();
                    if (context.mounted) context.go('/auth');
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                if (branding['icp_text']?.toString().isNotEmpty == true)
                  Text(
                    branding['icp_text'].toString(),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _deleteAccount(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('确认申请注销账号？'),
        content: const Text('注销后数据、余额和未完成订单处理规则应以后端配置文案为准。当前仅提交注销申请。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('提交申请'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiProvider).requestAccountDeletion();
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('注销申请已提交')));
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(errorMessage(error))));
      }
    }
  }
}

class _Setting extends StatelessWidget {
  const _Setting({
    required this.label,
    required this.onTap,
    this.value,
    this.danger = false,
  });

  final String label;
  final String? value;
  final VoidCallback onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: danger ? AppColors.danger : AppColors.text,
            ),
          ),
          if (value?.isNotEmpty == true) ...[
            const SizedBox(height: 4),
            Text(
              value!,
              style: Theme.of(context).textTheme.bodySmall,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}
