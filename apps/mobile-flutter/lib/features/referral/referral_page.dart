import 'package:flutter/material.dart';

import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class ReferralPage extends StatelessWidget {
  const ReferralPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const AppPage(
      title: '代理 / 佣金',
      child: PagePadding(
        child: AppEmptyState(
          title: '功能开发中',
          description: '佣金汇总、邀请码、佣金明细和提现将在后端 referral 接口完成后接入。',
        ),
      ),
    );
  }
}
