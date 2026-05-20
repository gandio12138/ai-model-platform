import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class CompliancePage extends ConsumerWidget {
  const CompliancePage({required this.type, super.key});

  final String type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fallbackTitle = switch (type) {
      'privacy' => '隐私政策',
      'disclaimer' => 'AI 生成内容免责声明',
      'report' => '内容举报',
      'help' => '帮助中心',
      _ => '用户协议',
    };
    return AppPage(
      title: fallbackTitle,
      child: FutureBuilder(
        future: ref.read(apiProvider).fetchPolicyDocument(type),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AppLoading();
          }
          if (snapshot.hasError) {
            return AppEmptyState(
              title: '政策内容加载失败',
              description: errorMessage(snapshot.error!),
            );
          }
          final policy = snapshot.data!;
          return PagePadding(
            child: AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    policy.title,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    '版本 ${policy.version}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    policy.content,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
