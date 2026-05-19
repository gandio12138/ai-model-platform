import 'package:flutter/material.dart';

import '../../core/network/api_models.dart';
import '../../features/billing/billing_page.dart';
import '../../features/models/models_page.dart';
import '../../features/payment/payment_page.dart';
import '../../core/widgets/app_page.dart';
import '../../design_system/tokens.dart';

class DesignSystemPreviewPage extends StatelessWidget {
  const DesignSystemPreviewPage({super.key});

  @override
  Widget build(BuildContext context) {
    const model = ModelInfo(
      code: 'gpt-4o',
      name: 'GPT-4o',
      providerName: '高速线路 1',
      inputPer1k: 18,
      outputPer1k: 72,
      maxContextTokens: 128000,
      supportsStream: true,
      supportsTools: true,
    );
    const product = PaymentProduct(
      id: 'preview',
      name: '团队标准包',
      description: '覆盖 normal、disabled、long text 等组件状态的预览入口。',
      saleAmount: 30000,
      faceValueAmount: 30000,
      bonusAmount: 4500,
      paymentMethods: ['apple_iap'],
      badge: 'Preview',
    );
    return AppPage(
      title: '组件预览',
      subtitle: 'Design System Preview',
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          const AppButton(label: '主按钮', icon: Icons.bolt_rounded),
          const SizedBox(height: AppSpacing.sm),
          const AppButton(label: '禁用按钮', onPressed: null),
          const SizedBox(height: AppSpacing.sm),
          const AppButton(label: '加载中', loading: true),
          const SizedBox(height: AppSpacing.md),
          const MetricCard(
            title: '可用余额',
            value: '¥35.20',
            icon: Icons.wallet_rounded,
          ),
          const SizedBox(height: AppSpacing.md),
          const ModelCard(model: model),
          const SizedBox(height: AppSpacing.md),
          PaymentProductCard(
            product: product,
            availableMethods: const ['apple_iap'],
            onBuy: () {},
          ),
          const SizedBox(height: AppSpacing.md),
          BillingRecordTile(
            record: LedgerRecord(
              id: 'preview',
              type: 'usage.charge',
              amount: 61,
              status: 'debit',
              createdAt: DateTime.now(),
              relatedId: 'req_preview',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          const AppEmptyState(title: '空状态', description: '暂无数据时展示清晰说明和下一步动作。'),
          const SizedBox(height: AppSpacing.md),
          const AppLoading(label: '加载状态'),
        ],
      ),
    );
  }
}
