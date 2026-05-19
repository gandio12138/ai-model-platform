import 'package:flutter/material.dart';

import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class CompliancePage extends StatelessWidget {
  const CompliancePage({required this.type, super.key});

  final String type;

  @override
  Widget build(BuildContext context) {
    final title = switch (type) {
      'privacy' => '隐私政策',
      'disclaimer' => 'AI 生成内容免责声明',
      'report' => '内容举报',
      'help' => '帮助中心',
      _ => '用户协议',
    };
    return AppPage(
      title: title,
      child: PagePadding(
        child: AppCard(
          child: Text(
            _content(title),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
      ),
    );
  }

  String _content(String title) {
    if (type == 'report') {
      return '如果你认为 AI 生成内容存在违法违规、侵权或安全风险，请在聊天消息菜单中提交举报。举报接口：POST /api/reports/content。';
    }
    return '$title 内容将由后台 CMS 或 App Config 下发。MVP 保留入口，确保协议、隐私、免责声明、客服和注销路径始终可见。';
  }
}
