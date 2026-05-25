import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';

import '../core/storage/token_store.dart';
import 'app.dart';
import 'env.dart';

final appEnvProvider = Provider<AppEnv>((ref) => throw UnimplementedError());
final initialApiBaseProvider = Provider<String?>((ref) => null);
final apiBaseStoreProvider = Provider<ApiBaseStore>(
  (ref) => SecureApiBaseStore(),
);
final apiBaseUrlProvider = StateProvider<String>((ref) {
  final initial = ref.watch(initialApiBaseProvider);
  if (initial != null && initial.trim().isNotEmpty) return initial.trim();
  return ref.watch(appEnvProvider).apiBaseUrl;
});

Future<void> runOTokenApp(AppEnv env) async {
  WidgetsFlutterBinding.ensureInitialized();
  final initialApiBase = await SecureApiBaseStore().read();
  runApp(
    ProviderScope(
      overrides: [
        appEnvProvider.overrideWithValue(env),
        initialApiBaseProvider.overrideWithValue(initialApiBase),
      ],
      child: const OTokenApp(),
    ),
  );
}
