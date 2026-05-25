import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/network/api_models.dart';
import '../../core/utils/formatters.dart';
import '../../design_system/tokens.dart';

class ChatPage extends ConsumerStatefulWidget {
  const ChatPage({super.key});

  @override
  ConsumerState<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends ConsumerState<ChatPage> {
  final _input = TextEditingController();
  final _inputFocus = FocusNode();
  final _scroll = ScrollController();
  List<ModelInfo> _models = const [];
  ChatSession? _session;
  List<ChatMessage> _messages = [];
  String _modelCode = 'gpt-4o';
  bool _loading = true;
  bool _sending = false;
  StreamSubscription<ChatStreamEvent>? _subscription;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _input.dispose();
    _inputFocus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final api = ref.read(apiProvider);
      final models = await api.fetchModels();
      final sessions = await api.fetchChatSessions();
      final session = sessions.isNotEmpty
          ? sessions.first
          : await api.createChatSession(models.first.code);
      setState(() {
        _models = models;
        _session = session;
        _modelCode = session.modelCode.isNotEmpty
            ? session.modelCode
            : models.first.code;
        _messages = session.messages;
        _loading = false;
      });
    } catch (error) {
      setState(() => _loading = false);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(errorMessage(error))));
      }
    }
  }

  Future<void> _newSession() async {
    final session = await ref.read(apiProvider).createChatSession(_modelCode);
    setState(() {
      _session = session;
      _messages = [];
    });
  }

  Future<void> _openModelPicker() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (context) =>
          ModelPickerSheet(models: _models, selectedModelCode: _modelCode),
    );
    if (selected == null || selected == _modelCode) return;
    setState(() => _modelCode = selected);
  }

  Future<void> _send() async {
    final content = _input.text.trim();
    if (content.isEmpty || _sending || _session == null) return;
    FocusScope.of(context).unfocus();
    final userMessage = ChatMessage(
      id: 'local-user-${DateTime.now().microsecondsSinceEpoch}',
      role: ChatRole.user,
      content: content,
      createdAt: DateTime.now(),
    );
    ChatEstimate estimate;
    try {
      estimate = await ref
          .read(apiProvider)
          .estimateChat(
            modelCode: _modelCode,
            messages: [..._messages, userMessage],
          );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('发送前预估失败：${errorMessage(error)}')));
      return;
    }
    if (!mounted) return;
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => CostEstimateSheet(estimate: estimate),
    );
    if (confirmed == false && !estimate.balanceEnough && mounted) {
      context.push('/wallet');
      return;
    }
    if (confirmed != true) return;
    if (!estimate.balanceEnough) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('余额不足，请先充值后再发送')));
      }
      return;
    }
    await _subscription?.cancel();
    _input.clear();
    final assistant = ChatMessage(
      id: 'local-assistant-${DateTime.now().microsecondsSinceEpoch}',
      role: ChatRole.assistant,
      content: '',
      createdAt: DateTime.now(),
      streaming: true,
    );
    setState(() {
      _sending = true;
      _messages = [..._messages, userMessage, assistant];
    });
    _scrollToEnd();
    _subscription = ref
        .read(apiProvider)
        .sendMessage(
          sessionId: _session!.id,
          modelCode: _modelCode,
          content: content,
        )
        .listen(
          (event) {
            if (!mounted) return;
            final last = _messages.last;
            if (event.done) {
              setState(() {
                _messages = [
                  ..._messages.take(_messages.length - 1),
                  last.copyWith(streaming: false, usage: event.usage),
                ];
                _sending = false;
              });
              _scrollToEnd();
              return;
            }
            setState(() {
              _messages = [
                ..._messages.take(_messages.length - 1),
                last.copyWith(content: last.content + event.delta),
              ];
            });
            _scrollToEnd();
          },
          onError: (Object error) {
            if (!mounted) return;
            setState(() {
              _messages = _messages
                  .where((message) => message.id != assistant.id)
                  .toList();
              _sending = false;
            });
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('发送失败：${errorMessage(error)}')),
            );
          },
        );
  }

  void _stop() {
    _subscription?.cancel();
    setState(() {
      _sending = false;
      if (_messages.isNotEmpty && _messages.last.streaming) {
        final last = _messages.last;
        _messages = [
          ..._messages.take(_messages.length - 1),
          last.copyWith(streaming: false),
        ];
      }
    });
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent + 160,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: AppLoading(label: '加载会话'));
    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        title: InkWell(
          onTap: _openModelPicker,
          borderRadius: BorderRadius.circular(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('AI 对话'),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _modelCode,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.expand_more_rounded, size: 16),
                ],
              ),
            ],
          ),
        ),
        actions: [
          IconButton(
            onPressed: _newSession,
            icon: const Icon(Icons.add_comment_rounded),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_horiz_rounded),
            onSelected: (value) {
              switch (value) {
                case 'models':
                  _openModelPicker();
                  break;
                case 'clear':
                  setState(() => _messages = []);
                  break;
                case 'history':
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(const SnackBar(content: Text('会话历史已在当前列表加载')));
                  break;
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'models', child: Text('切换模型')),
              PopupMenuItem(value: 'history', child: Text('会话历史')),
              PopupMenuItem(value: 'clear', child: Text('清空当前会话')),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.translucent,
                onTap: () => FocusScope.of(context).unfocus(),
                child: _messages.isEmpty
                    ? _EmptyChat(
                        onPick: (prompt) {
                          _input.text = prompt;
                          _input.selection = TextSelection.collapsed(
                            offset: prompt.length,
                          );
                          _inputFocus.requestFocus();
                        },
                      )
                    : ListView.builder(
                        controller: _scroll,
                        keyboardDismissBehavior:
                            ScrollViewKeyboardDismissBehavior.onDrag,
                        padding: const EdgeInsets.all(AppSpacing.md),
                        itemCount: _messages.length,
                        itemBuilder: (context, index) =>
                            ChatBubble(message: _messages[index]),
                      ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: AppColors.border),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x100F172A),
                      blurRadius: 22,
                      offset: Offset(0, 10),
                    ),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _input,
                          focusNode: _inputFocus,
                          minLines: 1,
                          maxLines: 5,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _send(),
                          decoration: const InputDecoration(
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            hintText: '输入问题，发送前会预估费用',
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      FloatingActionButton.small(
                        elevation: 0,
                        onPressed: _sending ? _stop : _send,
                        child: Icon(
                          _sending
                              ? Icons.stop_rounded
                              : Icons.arrow_upward_rounded,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyChat extends StatelessWidget {
  const _EmptyChat({required this.onPick});

  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    const prompts = [
      '帮我总结一下 OneToken 的 API 接入方式',
      '用 gpt-4o 写一个 Node.js 调用示例',
      '对比 Claude、Gemini 和 Qwen 适合的使用场景',
    ];
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: AppCard(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AppBadge(label: 'AI Chat'),
              const SizedBox(height: AppSpacing.md),
              Text('开始一个新问题', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '发送前会先预估本次费用，确认后再调用模型。你可以直接输入问题，也可以从下面的提示开始。',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: AppSpacing.md),
              for (final prompt in prompts)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: Material(
                    color: AppColors.surfaceSoft,
                    borderRadius: BorderRadius.circular(16),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => onPick(prompt),
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.md),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                prompt,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            const Icon(Icons.arrow_forward_rounded, size: 18),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class ModelPickerSheet extends StatefulWidget {
  const ModelPickerSheet({
    required this.models,
    required this.selectedModelCode,
    super.key,
  });

  final List<ModelInfo> models;
  final String selectedModelCode;

  @override
  State<ModelPickerSheet> createState() => _ModelPickerSheetState();
}

class _ModelPickerSheetState extends State<ModelPickerSheet> {
  final _search = TextEditingController();
  String _company = 'all';
  String _category = 'all';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final companies = _modelCompanies(widget.models);
    final categories = _modelCategories(widget.models);
    final filtered = widget.models.where((model) {
      final companyOk = _company == 'all' || model.providerName == _company;
      if (!companyOk) return false;
      final categoryOk = _category == 'all' || model.category == _category;
      if (!categoryOk) return false;
      if (query.isEmpty) return true;
      return model.code.toLowerCase().contains(query) ||
          model.name.toLowerCase().contains(query) ||
          model.providerName.toLowerCase().contains(query) ||
          model.category.toLowerCase().contains(query);
    }).toList();
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: AppSpacing.lg,
          right: AppSpacing.lg,
          top: AppSpacing.lg,
          bottom: MediaQuery.viewInsetsOf(context).bottom + AppSpacing.lg,
        ),
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * .72,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  height: 4,
                  width: 42,
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text('切换模型', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'API Key 默认可调用全部可用模型，不同模型按各自价格扣费。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: _search,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search_rounded),
                  hintText: '搜索模型、模型公司或能力',
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded),
                          onPressed: () {
                            _search.clear();
                            setState(() {});
                          },
                        ),
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: AppSpacing.md),
              SizedBox(
                height: 36,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: companies.length + 1,
                  separatorBuilder: (_, _) =>
                      const SizedBox(width: AppSpacing.xs),
                  itemBuilder: (context, index) {
                    final value = index == 0 ? 'all' : companies[index - 1];
                    final label = index == 0 ? '全部公司' : value;
                    final selected = _company == value;
                    return ChoiceChip(
                      label: Text(label),
                      selected: selected,
                      onSelected: (_) => setState(() => _company = value),
                    );
                  },
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              SizedBox(
                height: 36,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: categories.length + 1,
                  separatorBuilder: (_, _) =>
                      const SizedBox(width: AppSpacing.xs),
                  itemBuilder: (context, index) {
                    final value = index == 0 ? 'all' : categories[index - 1];
                    final label = index == 0 ? '全部类型' : value;
                    final selected = _category == value;
                    return ChoiceChip(
                      label: Text(label),
                      selected: selected,
                      onSelected: (_) => setState(() => _category = value),
                    );
                  },
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Expanded(
                child: filtered.isEmpty
                    ? const AppEmptyState(
                        title: '暂无匹配模型',
                        description: '换个关键词或清空搜索条件后重试。',
                      )
                    : ListView.separated(
                        itemCount: filtered.length,
                        separatorBuilder: (_, _) =>
                            const SizedBox(height: AppSpacing.sm),
                        itemBuilder: (context, index) {
                          final model = filtered[index];
                          final selected =
                              model.code == widget.selectedModelCode;
                          return AppCard(
                            child: ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                model.name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const SizedBox(height: 4),
                                  Text(model.code),
                                  const SizedBox(height: 6),
                                  Wrap(
                                    spacing: 6,
                                    runSpacing: 6,
                                    children: [
                                      AppBadge(label: model.providerName),
                                      AppBadge(label: model.category),
                                      AppBadge(
                                        label:
                                            '输入 ${modelTokenPricePer1k(centsPer1m: model.inputPer1m, centsPer1k: model.inputPer1k)}',
                                      ),
                                      AppBadge(
                                        label:
                                            '输出 ${modelTokenPricePer1k(centsPer1m: model.outputPer1m, centsPer1k: model.outputPer1k)}',
                                      ),
                                      if (model.maxContextTokens > 0)
                                        AppBadge(
                                          label:
                                              '${compactNumber(model.maxContextTokens)} 上下文',
                                        ),
                                      if (model.supportsStream)
                                        const AppBadge(label: '流式'),
                                    ],
                                  ),
                                ],
                              ),
                              trailing: selected
                                  ? const Icon(
                                      Icons.check_circle_rounded,
                                      color: AppColors.primary,
                                    )
                                  : const Icon(Icons.chevron_right_rounded),
                              onTap: () => Navigator.pop(context, model.code),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ChatBubble extends StatelessWidget {
  const ChatBubble({required this.message, super.key});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == ChatRole.user;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * .82,
        ),
        margin: const EdgeInsets.only(bottom: AppSpacing.md),
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: isUser ? AppColors.primary : AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isUser ? AppColors.primary : AppColors.border,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SelectableText(
              message.content.isEmpty && message.streaming
                  ? '生成中...'
                  : message.content,
              style: TextStyle(
                color: isUser ? Colors.white : AppColors.text,
                height: 1.55,
              ),
            ),
            if (message.streaming) ...[
              const SizedBox(height: AppSpacing.sm),
              const LinearProgressIndicator(minHeight: 2),
            ],
            if (message.usage != null) ...[
              const SizedBox(height: AppSpacing.sm),
              AppBadge(
                label: '本次扣费 ${centsToCurrency(message.usage!.actualCost)}',
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '输入 ${compactNumber(message.usage!.inputTokens)} tokens · 输出 ${compactNumber(message.usage!.outputTokens)} tokens · ${formatDate(message.usage!.chargedAt)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: isUser ? Colors.white70 : AppColors.textMuted,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.sm,
              children: [
                TextButton(
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: message.content));
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(const SnackBar(content: Text('已复制')));
                  },
                  child: Text(isUser ? '复制' : '复制回复'),
                ),
                if (!isUser && message.usage != null)
                  TextButton(
                    onPressed: () => _showUsageDetail(context, message),
                    child: const Text('详情'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showUsageDetail(BuildContext context, ChatMessage message) {
    final usage = message.usage;
    if (usage == null) return;
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
              Text('本次扣费详情', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: AppSpacing.md),
              _Row(label: '实际扣费', value: centsToCurrency(usage.actualCost)),
              _Row(label: '输入 Tokens', value: compactNumber(usage.inputTokens)),
              _Row(
                label: '输出 Tokens',
                value: compactNumber(usage.outputTokens),
              ),
              _Row(label: '计费时间', value: formatDate(usage.chargedAt)),
              const SizedBox(height: AppSpacing.md),
              Text(
                '实际扣费以服务端记录的模型返回 tokens 和后台价格为准。',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

List<String> _modelCategories(List<ModelInfo> _) {
  return const ['文本模型', '图片模型', '视频模型'];
}

List<String> _modelCompanies(List<ModelInfo> _) {
  return const ['Claude', 'OpenAI', 'Gemini'];
}

class CostEstimateSheet extends StatelessWidget {
  const CostEstimateSheet({required this.estimate, super.key});

  final ChatEstimate estimate;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                height: 4,
                width: 42,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text('发送前预估费用', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: AppSpacing.md),
            _Row(label: '模型', value: estimate.modelCode),
            _Row(
              label: '预计输入',
              value: '${compactNumber(estimate.inputTokens)} tokens',
            ),
            _Row(
              label: '预计输出',
              value: '${compactNumber(estimate.estimatedOutputTokens)} tokens',
            ),
            _Row(
              label: '模型输出上限',
              value: '${compactNumber(estimate.maxOutputTokens)} tokens',
            ),
            _Row(
              label: '预估费用',
              value: '约 ${centsToCurrency(estimate.estimatedCost)}',
            ),
            _Row(
              label: '当前余额',
              value: centsToCurrency(estimate.currentBalance),
            ),
            const SizedBox(height: AppSpacing.md),
            AppCard(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const AppBadge(label: '说明', color: AppColors.cyan),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      '预估费用仅用于发送前确认，实际消耗以模型返回和服务端最终计费为准。',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            if (!estimate.balanceEnough)
              AppButton(
                label: '余额不足，去充值',
                fullWidth: true,
                onPressed: () => Navigator.pop(context, false),
              )
            else
              AppButton(
                label: '确认发送',
                fullWidth: true,
                onPressed: () => Navigator.pop(context, true),
              ),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: Theme.of(context).textTheme.bodySmall),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}
