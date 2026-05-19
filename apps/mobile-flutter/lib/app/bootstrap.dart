import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'env.dart';

final appEnvProvider = Provider<AppEnv>((ref) => throw UnimplementedError());

void runOneTokenApp(AppEnv env) {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ProviderScope(
      overrides: [appEnvProvider.overrideWithValue(env)],
      child: const OneTokenApp(),
    ),
  );
}
