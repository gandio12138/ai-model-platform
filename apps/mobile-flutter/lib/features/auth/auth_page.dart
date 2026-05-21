import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/bootstrap.dart';
import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../core/network/local_network_permission.dart';
import '../../design_system/tokens.dart';
import '../app_config/api_endpoint_dialog.dart';

class AuthPage extends ConsumerStatefulWidget {
  const AuthPage({super.key});

  @override
  ConsumerState<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends ConsumerState<AuthPage> {
  final _account = TextEditingController();
  final _password = TextEditingController();
  bool _registerMode = false;
  bool _loading = false;
  bool _testingConnection = false;
  String? _connectionStatus;

  @override
  void dispose() {
    _account.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(apiProvider);
      final contextInfo = ref.read(launchContextProvider);
      if (_registerMode) {
        await api.register(_account.text.trim(), _password.text, contextInfo);
      } else {
        await api.login(_account.text.trim(), _password.text, contextInfo);
      }
      if (mounted) context.go('/chat');
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(errorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _testConnection() async {
    setState(() {
      _testingConnection = true;
      _connectionStatus = null;
    });
    try {
      await ref
          .read(apiProvider)
          .fetchAppConfig(ref.read(launchContextProvider));
      if (mounted) setState(() => _connectionStatus = 'API 连接正常');
    } catch (error) {
      if (mounted) setState(() => _connectionStatus = errorMessage(error));
    } finally {
      if (mounted) setState(() => _testingConnection = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 40),
              Container(
                height: 58,
                width: 58,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: const LinearGradient(
                    colors: [AppColors.primaryDark, AppColors.primary],
                  ),
                ),
                child: const Center(
                  child: Text(
                    'O',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      fontSize: 24,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              Text(
                _registerMode ? '创建 OneToken 账号' : '登录 OneToken',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '使用手机号或邮箱登录，进入多模型 AI 对话、钱包和开发者 API 管理。',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: AppSpacing.md),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '当前 API',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      ref.watch(apiBaseUrlProvider),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      '真机访问本地后端时，请允许“无线局域网与蜂窝网络”。',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppColors.textMuted,
                      ),
                    ),
                    if (_connectionStatus != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        _connectionStatus!,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: _connectionStatus == 'API 连接正常'
                              ? AppColors.success
                              : AppColors.danger,
                        ),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.sm),
                    AppButton(
                      label: '测试 API 连接',
                      variant: AppButtonVariant.secondary,
                      loading: _testingConnection,
                      onPressed: _testConnection,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    AppButton(
                      label: '修改 API 地址',
                      variant: AppButtonVariant.secondary,
                      onPressed: () => showApiEndpointDialog(context, ref),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    AppButton(
                      label: '打开 iOS 网络设置',
                      variant: AppButtonVariant.secondary,
                      onPressed: () async {
                        final opened = await openOneTokenAppSettings();
                        if (!opened && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                '请手动进入系统设置，打开 OneToken 的无线局域网与蜂窝网络权限',
                              ),
                            ),
                          );
                        }
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              AppInput(
                controller: _account,
                label: '手机号或邮箱',
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: AppSpacing.md),
              AppInput(controller: _password, label: '密码', obscureText: true),
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: _registerMode ? '注册并登录' : '登录',
                fullWidth: true,
                loading: _loading,
                onPressed: _submit,
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                label: _registerMode ? '已有账号，去登录' : '没有账号，去注册',
                variant: AppButtonVariant.secondary,
                fullWidth: true,
                onPressed: () => setState(() => _registerMode = !_registerMode),
              ),
              TextButton(onPressed: () {}, child: const Text('忘记密码，后续接口接入')),
            ],
          ),
        ),
      ),
    );
  }
}
