import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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

  Future<void> _send() async {
    final content = _input.text.trim();
    if (content.isEmpty || _sending || _session == null) return;
    final userMessage = ChatMessage(
      id: 'local-user-${DateTime.now().microsecondsSinceEpoch}',
      role: ChatRole.user,
      content: content,
      createdAt: DateTime.now(),
    );
    final estimate = await ref
        .read(apiProvider)
        .estimateChat(
          modelCode: _modelCode,
          messages: [..._messages, userMessage],
        );
    if (!mounted) return;
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => CostEstimateSheet(estimate: estimate),
    );
    if (confirmed != true) return;
    if (!estimate.balanceEnough) return;
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
            final last = _messages.last;
            setState(() {
              _messages = [
                ..._messages.take(_messages.length - 1),
                last.copyWith(
                  streaming: false,
                  failed: true,
                  content: last.content.isEmpty
                      ? errorMessage(error)
                      : last.content,
                ),
              ];
              _sending = false;
            });
          },
        );
  }

  void _stop() {
    _subscription?.cancel();
    setState(() => _sending = false);
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
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('AI 对话'),
            Text(_modelCode, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _newSession,
            icon: const Icon(Icons.add_comment_rounded),
          ),
          PopupMenuButton<String>(
            initialValue: _modelCode,
            onSelected: (value) => setState(() => _modelCode = value),
            itemBuilder: (context) => [
              for (final model in _models)
                PopupMenuItem(value: model.code, child: Text(model.name)),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: _messages.isEmpty
                  ? const AppEmptyState(
                      title: '开始新的对话',
                      description: '发送前会先展示预计 tokens、预计消耗和当前余额。',
                    )
                  : ListView.builder(
                      controller: _scroll,
                      padding: const EdgeInsets.all(AppSpacing.md),
                      itemCount: _messages.length,
                      itemBuilder: (context, index) => ChatBubble(
                        message: _messages[index],
                        onReport: () => ref
                            .read(apiProvider)
                            .reportContent(
                              messageId: _messages[index].id,
                              reason: 'user_report',
                            ),
                      ),
                    ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(
                12,
                8,
                12,
                12 + MediaQuery.viewInsetsOf(context).bottom * 0,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 5,
                      decoration: const InputDecoration(
                        hintText: '输入问题，发送前会先预估费用',
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  FloatingActionButton.small(
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
          ],
        ),
      ),
    );
  }
}

class ChatBubble extends StatelessWidget {
  const ChatBubble({required this.message, super.key, this.onReport});

  final ChatMessage message;
  final VoidCallback? onReport;

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
                label: '本次实际消耗 ${centsToCurrency(message.usage!.actualCost)}',
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '输入 ${compactNumber(message.usage!.inputTokens)} tokens · 输出 ${compactNumber(message.usage!.outputTokens)} tokens · ${formatDate(message.usage!.chargedAt)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: isUser ? Colors.white70 : AppColors.textMuted,
                ),
              ),
            ],
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextButton(
                  onPressed: () =>
                      Clipboard.setData(ClipboardData(text: message.content)),
                  child: Text(
                    '复制',
                    style: TextStyle(
                      color: isUser ? Colors.white : AppColors.primary,
                    ),
                  ),
                ),
                if (!isUser)
                  TextButton(onPressed: onReport, child: const Text('举报')),
              ],
            ),
          ],
        ),
      ),
    );
  }
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
            Text('发送前预计消耗', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: AppSpacing.md),
            _Row(label: '模型', value: estimate.modelCode),
            _Row(
              label: '预计输入',
              value: '${compactNumber(estimate.inputTokens)} tokens',
            ),
            _Row(
              label: '预计输出上限',
              value: '${compactNumber(estimate.outputTokenLimit)} tokens',
            ),
            _Row(
              label: '预计消耗',
              value: '约 ${centsToCurrency(estimate.estimatedCost)}',
            ),
            _Row(
              label: '当前余额',
              value: centsToCurrency(estimate.currentBalance),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              '说明：实际消耗以模型返回和最终计费为准。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: AppSpacing.lg),
            if (!estimate.balanceEnough)
              const AppEmptyState(
                title: '余额不足',
                description: '当前余额不足以覆盖预计消耗，请先充值。',
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
