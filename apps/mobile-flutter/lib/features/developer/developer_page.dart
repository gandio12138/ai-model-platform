import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/network/api_models.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class DeveloperPage extends ConsumerStatefulWidget {
  const DeveloperPage({super.key});

  @override
  ConsumerState<DeveloperPage> createState() => _DeveloperPageState();
}

class _DeveloperPageState extends ConsumerState<DeveloperPage> {
  late Future<List<ApiKeyRecord>> _future = ref
      .read(apiProvider)
      .fetchApiKeys();

  void _reload() =>
      setState(() => _future = ref.read(apiProvider).fetchApiKeys());

  Future<void> _create() async {
    try {
      final created = await ref.read(apiProvider).createApiKey('移动端 API Key');
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('API Key 只展示一次'),
          content: SelectableText(created.plainKey ?? created.maskedKey),
          actions: [
            TextButton(
              onPressed: () {
                Clipboard.setData(
                  ClipboardData(text: created.plainKey ?? created.maskedKey),
                );
                Navigator.pop(context);
              },
              child: const Text('复制并关闭'),
            ),
          ],
        ),
      );
      _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(errorMessage(error))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: '开发者 API Key',
      subtitle: '完整 Key 只在创建时展示一次',
      actions: [
        IconButton(onPressed: _create, icon: const Icon(Icons.add_rounded)),
      ],
      child: FutureBuilder<List<ApiKeyRecord>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AppLoading();
          }
          if (snapshot.hasError) {
            return AppEmptyState(
              title: 'API Key 加载失败',
              description: errorMessage(snapshot.error!),
            );
          }
          final keys = snapshot.data ?? const [];
          if (keys.isEmpty) {
            return AppEmptyState(
              title: '暂无 API Key',
              description: '创建后可用于 OpenAI-compatible API 调用。',
              actionLabel: '创建 API Key',
              onAction: _create,
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(AppSpacing.md),
            itemCount: keys.length + 1,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
            itemBuilder: (context, index) {
              if (index == 0) {
                return const AppCard(
                  child: Text('安全提示：不要在客户端缓存完整 API Key，不要把完整 Key 写入日志或截图。'),
                );
              }
              return ApiKeyCard(record: keys[index - 1], onChanged: _reload);
            },
          );
        },
      ),
    );
  }
}

class ApiKeyCard extends ConsumerWidget {
  const ApiKeyCard({required this.record, required this.onChanged, super.key});

  final ApiKeyRecord record;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  record.name,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              AppBadge(label: record.status),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          SelectableText(record.maskedKey),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              TextButton(
                onPressed: () =>
                    Clipboard.setData(ClipboardData(text: record.maskedKey)),
                child: const Text('复制 mask'),
              ),
              TextButton(
                onPressed: () async {
                  try {
                    await ref
                        .read(apiProvider)
                        .updateApiKey(record.id, 'disabled');
                    onChanged();
                  } catch (error) {
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(errorMessage(error))),
                    );
                  }
                },
                child: const Text('禁用'),
              ),
              TextButton(
                onPressed: () async {
                  try {
                    await ref.read(apiProvider).deleteApiKey(record.id);
                    onChanged();
                  } catch (error) {
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(errorMessage(error))),
                    );
                  }
                },
                child: const Text('删除'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
