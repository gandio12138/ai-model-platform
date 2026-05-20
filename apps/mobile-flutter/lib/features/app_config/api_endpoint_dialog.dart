import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/bootstrap.dart';
import '../../app/router.dart';
import '../../design_system/tokens.dart';

Future<void> showApiEndpointDialog(BuildContext context, WidgetRef ref) async {
  final current = ref.read(apiBaseUrlProvider);
  final controller = TextEditingController(text: current);
  String? errorText;

  final value = await showDialog<String>(
    context: context,
    builder: (context) {
      return StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: const Text('修改 API 地址'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: controller,
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                  decoration: InputDecoration(
                    labelText: 'API Base URL',
                    hintText: 'http://192.168.2.75:4000',
                    errorText: errorText,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  '保存后会清理当前登录态，并立即使用新的后端地址。',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('取消'),
              ),
              TextButton(
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: current));
                },
                child: const Text('复制当前'),
              ),
              FilledButton(
                onPressed: () {
                  final normalized = _normalizeApiBase(controller.text);
                  final uri = Uri.tryParse(normalized);
                  if (uri == null ||
                      !uri.hasScheme ||
                      uri.host.isEmpty ||
                      (uri.scheme != 'http' && uri.scheme != 'https')) {
                    setState(() => errorText = '请输入 http 或 https 开头的完整地址');
                    return;
                  }
                  Navigator.pop(context, normalized);
                },
                child: const Text('保存'),
              ),
            ],
          );
        },
      );
    },
  );

  if (value == null || value == current) return;
  await ref.read(apiBaseStoreProvider).save(value);
  await ref.read(tokenStoreProvider).clear();
  ref.read(apiBaseUrlProvider.notifier).state = value;
  ref.invalidate(appConfigProvider);
  ref.invalidate(authStateProvider);

  if (context.mounted) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('API 地址已切换为 $value')));
  }
}

String _normalizeApiBase(String value) {
  var text = value.trim();
  while (text.endsWith('/')) {
    text = text.substring(0, text.length - 1);
  }
  return text;
}
