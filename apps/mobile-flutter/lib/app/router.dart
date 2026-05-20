import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/config/app_context.dart';
import '../core/errors/app_exception.dart';
import '../core/network/api_client.dart';
import '../core/storage/token_store.dart';
import '../features/app_config/design_system_preview_page.dart';
import '../features/auth/auth_page.dart';
import '../features/billing/billing_page.dart';
import '../features/chat/chat_page.dart';
import '../features/compliance/compliance_page.dart';
import '../features/developer/developer_page.dart';
import '../features/home/home_page.dart';
import '../features/models/models_page.dart';
import '../features/payment/payment_page.dart';
import '../features/payment/payment_status_page.dart';
import '../features/profile/profile_page.dart';
import '../features/referral/referral_page.dart';
import '../features/wallet/wallet_page.dart';
import 'bootstrap.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final launchContextProvider = Provider<AppLaunchContext>((ref) {
  return AppLaunchContext.fromEnv(ref.watch(appEnvProvider));
});

final apiProvider = Provider<OneTokenApi>((ref) {
  final env = ref.watch(appEnvProvider);
  return createOneTokenApi(
    env: env.copyWith(apiBaseUrl: ref.watch(apiBaseUrlProvider)),
    tokenStore: ref.watch(tokenStoreProvider),
  );
});

final appConfigProvider = FutureProvider((ref) {
  return ref
      .watch(apiProvider)
      .fetchAppConfig(ref.watch(launchContextProvider));
});

final authStateProvider = FutureProvider<bool>((ref) async {
  final tokenStore = ref.watch(tokenStoreProvider);
  final token = await tokenStore.read();
  if (token == null) return false;
  try {
    await ref.watch(apiProvider).me().timeout(const Duration(seconds: 8));
    return true;
  } on AppException catch (error) {
    if (error.statusCode == 401) {
      await tokenStore.clear();
      return false;
    }
    return false;
  } on TimeoutException {
    return false;
  } catch (_) {
    return false;
  }
});

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/splash',
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashPage()),
      GoRoute(path: '/auth', builder: (context, state) => const AuthPage()),
      ShellRoute(
        builder: (context, state, child) => MainShell(child: child),
        routes: [
          GoRoute(path: '/home', builder: (context, state) => const HomePage()),
          GoRoute(path: '/chat', builder: (context, state) => const ChatPage()),
          GoRoute(
            path: '/models',
            builder: (context, state) => const ModelsPage(),
          ),
          GoRoute(
            path: '/wallet',
            builder: (context, state) => const WalletPage(),
          ),
          GoRoute(
            path: '/profile',
            builder: (context, state) => const ProfilePage(),
          ),
        ],
      ),
      GoRoute(
        path: '/billing',
        builder: (context, state) => const BillingPage(),
      ),
      GoRoute(
        path: '/payment',
        builder: (context, state) => const PaymentPage(),
      ),
      GoRoute(
        path: '/payment/status/:id',
        builder: (context, state) =>
            PaymentStatusPage(orderId: state.pathParameters['id'] ?? ''),
      ),
      GoRoute(
        path: '/developer',
        builder: (context, state) => const DeveloperPage(),
      ),
      GoRoute(
        path: '/referral',
        builder: (context, state) => const ReferralPage(),
      ),
      GoRoute(
        path: '/compliance/:type',
        builder: (context, state) =>
            CompliancePage(type: state.pathParameters['type'] ?? 'terms'),
      ),
      GoRoute(
        path: '/preview',
        builder: (context, state) => const DesignSystemPreviewPage(),
      ),
    ],
  );
});

class SplashPage extends ConsumerStatefulWidget {
  const SplashPage({super.key});

  @override
  ConsumerState<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends ConsumerState<SplashPage> {
  String _status = '正在连接 OneToken 服务';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await ref
            .read(appConfigProvider.future)
            .timeout(const Duration(seconds: 8));
        if (mounted) {
          setState(() => _status = '配置已就绪，正在检查登录状态');
        }
      } catch (_) {
        if (mounted) {
          setState(() => _status = '正在进入登录页');
        }
        await Future<void>.delayed(const Duration(milliseconds: 300));
      }
      bool loggedIn = false;
      try {
        loggedIn = await ref
            .read(authStateProvider.future)
            .timeout(const Duration(seconds: 8));
      } catch (_) {
        loggedIn = false;
      }
      if (!mounted) return;
      context.go(loggedIn ? '/chat' : '/auth');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                height: 74,
                width: 74,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF1D4ED8), Color(0xFF38BDF8)],
                  ),
                ),
                child: const Center(
                  child: Text(
                    'O',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 30,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                'OneToken',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 8),
              Text(_status, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class MainShell extends StatelessWidget {
  const MainShell({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final items = [
      _NavItem('/chat', Icons.auto_awesome_rounded, '对话'),
      _NavItem('/home', Icons.space_dashboard_rounded, '概览'),
      _NavItem('/models', Icons.dataset_rounded, '模型'),
      _NavItem('/wallet', Icons.account_balance_wallet_rounded, '钱包'),
      _NavItem('/profile', Icons.person_rounded, '我的'),
    ];
    final index = items.indexWhere((item) => location.startsWith(item.path));
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index < 0 ? 0 : index,
        onDestinationSelected: (value) => context.go(items[value].path),
        destinations: [
          for (final item in items)
            NavigationDestination(icon: Icon(item.icon), label: item.label),
        ],
      ),
    );
  }
}

class _NavItem {
  const _NavItem(this.path, this.icon, this.label);

  final String path;
  final IconData icon;
  final String label;
}
