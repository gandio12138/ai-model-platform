import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/bootstrap.dart';
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
    final appConfig = ref
        .watch(appConfigProvider)
        .maybeWhen(data: (config) => config, orElse: () => null);
    final tokenApiBase = _tokenApiBase(
      appConfig,
      ref.watch(apiBaseUrlProvider),
    );
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
            itemCount: keys.length + 2,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
            itemBuilder: (context, index) {
              if (index == 0) {
                return ApiUsageGuideCard(
                  baseUrl: tokenApiBase,
                  modelCode: '在模型目录复制的模型 ID',
                );
              }
              if (index == 1) {
                return const AppCard(
                  child: Text('安全提示：不要在客户端缓存完整 API Key，不要把完整 Key 写入日志或截图。'),
                );
              }
              return ApiKeyCard(record: keys[index - 2], onChanged: _reload);
            },
          );
        },
      ),
    );
  }
}

class ApiUsageGuideCard extends StatelessWidget {
  const ApiUsageGuideCard({
    required this.baseUrl,
    required this.modelCode,
    super.key,
  });

  final String baseUrl;
  final String modelCode;

  @override
  Widget build(BuildContext context) {
    final endpoint = '$baseUrl/chat/completions';
    final example =
        '''export OTOKEN_BASE_URL="$baseUrl"
export AI_TOKEN_API_KEY="你的 oToken API Key"

curl "\$OTOKEN_BASE_URL/chat/completions" \\
  -H "Authorization: Bearer \$AI_TOKEN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "$modelCode",
    "messages": [{"role":"user","content":"你好"}]
  }' ''';
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('API 调用方式', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '兼容 OpenAI Chat Completions。API Key 消耗同一个客户钱包，余额不足时不会调用上游模型。',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: AppSpacing.md),
          _GuideRow(label: 'Base URL', value: baseUrl),
          _GuideRow(label: 'Endpoint', value: endpoint),
          const SizedBox(height: AppSpacing.sm),
          TextButton.icon(
            onPressed: () => Clipboard.setData(ClipboardData(text: example)),
            icon: const Icon(Icons.copy_rounded, size: 18),
            label: const Text('复制 cURL 示例'),
          ),
        ],
      ),
    );
  }
}

class _GuideRow extends StatelessWidget {
  const _GuideRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 82,
            child: Text(
              label,
              style: Theme.of(
                context,
              ).textTheme.labelMedium?.copyWith(color: AppColors.textMuted),
            ),
          ),
          Expanded(child: SelectableText(value)),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: () => Clipboard.setData(ClipboardData(text: value)),
            icon: const Icon(Icons.copy_rounded, size: 17),
          ),
        ],
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

String _tokenApiBase(AppConfig? config, String apiBaseUrl) {
  final configured = config?.copy['public_api_base_url']?.toString().trim();
  if (configured != null && configured.isNotEmpty) {
    return configured.replaceAll(RegExp(r'/+$'), '');
  }
  final root = apiBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
  if (root.endsWith('/v1')) return root;
  return '$root/v1';
}
