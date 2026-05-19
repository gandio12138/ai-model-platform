import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/errors/app_exception.dart';
import '../../design_system/tokens.dart';

class AuthPage extends ConsumerStatefulWidget {
  const AuthPage({super.key});

  @override
  ConsumerState<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends ConsumerState<AuthPage> {
  final _account = TextEditingController(text: 'web-customer@example.com');
  final _password = TextEditingController(text: 'Web123456!');
  bool _registerMode = false;
  bool _loading = false;

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
      if (mounted) context.go('/home');
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
