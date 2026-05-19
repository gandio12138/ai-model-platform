import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'bootstrap.dart';
import 'router.dart';
import 'theme.dart';

class OneTokenApp extends ConsumerWidget {
  const OneTokenApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final env = ref.watch(appEnvProvider);
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: env.appName,
      debugShowCheckedModeBanner: env.debugBanner,
      theme: buildLightTheme(),
      routerConfig: router,
    );
  }
}
