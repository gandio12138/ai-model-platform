import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/network/api_models.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class ModelsPage extends ConsumerWidget {
  const ModelsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppPage(
      title: '模型目录',
      subtitle: '对话页可直接切换模型，API Key 默认可调用全部已授权模型',
      child: FutureBuilder<List<ModelInfo>>(
        future: ref.read(apiProvider).fetchModels(),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AppLoading();
          }
          if (snapshot.hasError) {
            return AppEmptyState(
              title: '模型加载失败',
              description: errorMessage(snapshot.error!),
            );
          }
          final models = snapshot.data ?? const [];
          if (models.isEmpty) {
            return const AppEmptyState(
              title: '暂无模型',
              description: '当前租户暂未授权模型。',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(AppSpacing.md),
            itemCount: models.length,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (context, index) => ModelCard(model: models[index]),
          );
        },
      ),
    );
  }
}

class ModelCard extends StatelessWidget {
  const ModelCard({required this.model, super.key});

  final ModelInfo model;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 48,
                width: 48,
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Center(
                  child: Text(
                    model.name.characters.first,
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      model.name,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      model.providerName,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const AppBadge(label: '全部 Key 可用', color: AppColors.success),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              AppBadge(label: model.supportsStream ? '流式' : '非流式'),
              if (model.supportsTools) const AppBadge(label: '工具调用'),
              AppBadge(
                label: '${compactNumber(model.maxContextTokens)} context',
                color: AppColors.cyan,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: _Price(
                  label: '输入',
                  value: centsToCurrency(model.inputPer1k),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _Price(
                  label: '输出',
                  value: centsToCurrency(model.outputPer1k),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Price extends StatelessWidget {
  const _Price({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.surfaceSoft,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelMedium),
          Text(
            '$value / 1K',
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}
