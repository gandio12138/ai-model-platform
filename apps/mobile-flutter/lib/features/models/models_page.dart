import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/network/api_models.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class ModelsPage extends ConsumerStatefulWidget {
  const ModelsPage({super.key});

  @override
  ConsumerState<ModelsPage> createState() => _ModelsPageState();
}

class _ModelsPageState extends ConsumerState<ModelsPage> {
  final _search = TextEditingController();
  String _company = 'all';
  String _capability = 'all';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: '模型目录',
      subtitle: '按模型公司查看当前账户可调用的模型、价格和能力',
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
          final keyword = _search.text.trim().toLowerCase();
          final companies = _modelCompanies(models);
          final filtered = models.where((model) {
            final keywordOk =
                keyword.isEmpty ||
                model.name.toLowerCase().contains(keyword) ||
                model.code.toLowerCase().contains(keyword) ||
                model.providerName.toLowerCase().contains(keyword);
            final companyOk =
                _company == 'all' || model.providerName == _company;
            final capabilityOk = switch (_capability) {
              'stream' => model.supportsStream,
              'tools' => model.supportsTools,
              _ => true,
            };
            return keywordOk && companyOk && capabilityOk;
          }).toList();
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.md,
              AppSpacing.xxl + 72,
            ),
            itemCount: filtered.isEmpty ? 2 : filtered.length + 1,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (context, index) {
              if (index == 0) {
                return _ModelFilterBar(
                  controller: _search,
                  capability: _capability,
                  companies: companies,
                  company: _company,
                  total: filtered.length,
                  onCapabilityChanged: (value) =>
                      setState(() => _capability = value),
                  onCompanyChanged: (value) => setState(() => _company = value),
                  onSearchChanged: (_) => setState(() {}),
                );
              }
              if (filtered.isEmpty) {
                return const AppEmptyState(
                  title: '没有匹配模型',
                  description: '清空搜索条件后再试。',
                );
              }
              return ModelCard(model: filtered[index - 1]);
            },
          );
        },
      ),
    );
  }

  List<String> _modelCompanies(List<ModelInfo> models) {
    final companies = models.map((model) => model.providerName).toSet().toList()
      ..sort();
    return companies;
  }
}

class _ModelFilterBar extends StatelessWidget {
  const _ModelFilterBar({
    required this.controller,
    required this.capability,
    required this.companies,
    required this.company,
    required this.total,
    required this.onCapabilityChanged,
    required this.onCompanyChanged,
    required this.onSearchChanged,
  });

  final TextEditingController controller;
  final String capability;
  final List<String> companies;
  final String company;
  final int total;
  final ValueChanged<String> onCapabilityChanged;
  final ValueChanged<String> onCompanyChanged;
  final ValueChanged<String> onSearchChanged;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const AppBadge(label: '模型目录'),
              const Spacer(),
              Text(
                '$total 个模型',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: controller,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search_rounded),
              hintText: '搜索模型 ID、名称或模型公司',
            ),
            onChanged: onSearchChanged,
          ),
          const SizedBox(height: AppSpacing.md),
          Text('模型公司', style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              _FilterChip(
                label: '全部公司',
                active: company == 'all',
                onTap: () => onCompanyChanged('all'),
              ),
              for (final item in companies)
                _FilterChip(
                  label: item,
                  active: company == item,
                  onTap: () => onCompanyChanged(item),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text('能力标签', style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              _FilterChip(
                label: '全部',
                active: capability == 'all',
                onTap: () => onCapabilityChanged('all'),
              ),
              _FilterChip(
                label: '流式输出',
                active: capability == 'stream',
                onTap: () => onCapabilityChanged('stream'),
              ),
              _FilterChip(
                label: '工具调用',
                active: capability == 'tools',
                onTap: () => onCapabilityChanged('tools'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      label: Text(label),
      avatar: active ? const Icon(Icons.check_rounded, size: 16) : null,
      backgroundColor: active ? AppColors.primarySoft : AppColors.surfaceSoft,
      labelStyle: TextStyle(
        color: active ? AppColors.primary : AppColors.text,
        fontWeight: FontWeight.w800,
      ),
      side: BorderSide(color: active ? AppColors.primary : AppColors.border),
      onPressed: onTap,
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
              const AppBadge(label: '全部 API Key 可用', color: AppColors.success),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              AppBadge(label: model.code),
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
