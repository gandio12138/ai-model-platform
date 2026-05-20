import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { PublicService } from "../public/public.service.js";

@Injectable()
export class AppConfigService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PublicService) private readonly publicService: PublicService
  ) {}

  async getConfig(query: Record<string, unknown>, headers: Record<string, unknown> = {}) {
    const platform = String(query.platform ?? headers["x-platform"] ?? "web").toLowerCase();
    const distributionChannel = String(
      query.distribution_channel ?? headers["x-distribution-channel"] ?? "official"
    );
    const region = String(query.region ?? headers["x-region"] ?? "CN").toUpperCase();
    const appVersion = String(query.app_version ?? headers["x-app-version"] ?? "");
    const packageName = String(
      query.package_name ?? query.bundle_id ?? headers["x-package-name"] ?? headers["x-bundle-id"] ?? ""
    );

    const context = await this.publicService.resolveCheckoutContext({
      ...query,
      platform
    });
    const paymentMethods = await this.publicService.listPaymentMethods(context);
    const policy = await this.findDistributionPolicy({
      tenantId: context.tenant.id,
      projectId: context.project?.id ?? null,
      platform,
      distributionChannel,
      region,
      packageName
    });
    const paymentEntry = await this.findPublishedConfig("web_payment_entry");

    const methodCodes = this.resolvePaymentMethods(platform, paymentMethods, policy);
    const legalApproved = Boolean(policy?.legal_approved);
    const reviewMode = Boolean(policy?.review_mode);
    const policyShowWeb = Boolean(policy?.show_web_payment_link);
    const showWebPaymentLink =
      platform === "ios"
        ? legalApproved && policyShowWeb
        : platform === "android"
          ? policyShowWeb || Boolean(paymentEntry?.enabled)
          : true;
    const webPaymentUrl =
      showWebPaymentLink
        ? String(policy?.web_payment_url ?? paymentEntry?.url ?? process.env.WEB_PAYMENT_URL ?? "")
        : null;

    return {
      tenant_id: context.tenant.id,
      project_id: context.project?.id ?? null,
      tenant_billing_mode: context.tenant.billing_mode ?? "prepaid",
      tenant_plan_code: context.tenant.current_plan_code ?? null,
      platform,
      app_version: appVersion || null,
      package_name: packageName || null,
      distribution_channel: distributionChannel,
      region,
      review_mode: reviewMode,
      legal_approved: legalApproved,
      available_payment_methods: methodCodes,
      show_web_payment_link: Boolean(showWebPaymentLink && webPaymentUrl),
      web_payment_url: webPaymentUrl || null,
      payment_page_notice:
        policy?.payment_page_notice ??
        this.defaultPaymentNotice(platform, methodCodes),
      settlement_notice: this.settlementNotice(context.tenant.billing_mode ?? "prepaid"),
      ios_iap_enabled: platform === "ios" && methodCodes.includes("apple_iap"),
      android_unified_checkout_enabled:
        platform === "android" && paymentMethods.some((method) => method.channel_type === "android_unified_checkout"),
      developer_api_enabled: !reviewMode,
      referral_enabled: !reviewMode,
      model_list_enabled: true,
      chat_enabled: !reviewMode,
      support_contact: {
        email: process.env.SUPPORT_EMAIL ?? "support@onetoken.local",
        work_time: "工作日 09:00-18:00"
      },
      announcement:
        policy?.metadata?.announcement ??
        "OneToken 平台余额、API Key 和模型调用数据已在 Web 与 App 端共享。",
      privacy_notice_variant: policy?.metadata?.privacy_notice_variant ?? "standard_cn",
      content_safety_notice:
        policy?.metadata?.content_safety_notice ??
        "AI 生成内容可能存在不准确或不完整，请勿用于违法、侵权或高风险决策场景。",
      min_supported_app_version: policy?.metadata?.min_supported_app_version ?? null,
      maintenance_mode: Boolean(policy?.metadata?.maintenance_mode ?? false),
      feature_flags: {
        app_config_v1: true,
        fake_provider_allowed: process.env.NODE_ENV !== "production",
        web_payment_entry: Boolean(showWebPaymentLink && webPaymentUrl),
        review_safe_copy: reviewMode
      }
    };
  }

  private async findDistributionPolicy(input: {
    tenantId: string;
    projectId: string | null;
    platform: string;
    distributionChannel: string;
    region: string;
    packageName: string;
  }) {
    const { rows } = await this.db.query(
      `select *
         from distribution_policies
        where tenant_id = $1
          and platform = $2
          and distribution_channel = $3
          and region = $4
          and status = 'active'
          and ($5::uuid is null or project_id is null or project_id = $5::uuid)
          and ($6 = '' or package_name = $6 or package_name = '*')
        order by case when project_id = $5::uuid then 0 else 1 end,
                 case when package_name = $6 then 0 else 1 end,
                 created_at desc
        limit 1`,
      [
        input.tenantId,
        input.platform,
        input.distributionChannel,
        input.region,
        input.projectId,
        input.packageName
      ]
    );
    return rows[0] ?? null;
  }

  private async findPublishedConfig(configKey: string) {
    const { rows } = await this.db.query(
      `select published_value
         from configs
        where config_key = $1
          and status = 'published'
        limit 1`,
      [configKey]
    );
    return rows[0]?.published_value ?? null;
  }

  private resolvePaymentMethods(platform: string, methods: any[], policy: any | null) {
    const configured = methods
      .map((method) => this.toPublicPaymentMethodCode(method.payment_method))
      .filter(Boolean);
    const allowed = Array.isArray(policy?.allowed_payment_methods)
      ? policy.allowed_payment_methods.map((method: unknown) => this.toPublicPaymentMethodCode(method))
      : null;
    const filtered = allowed?.length
      ? configured.filter((method) => allowed.includes(method))
      : configured;
    if (platform === "ios") {
      return filtered.includes("apple_iap") ? ["apple_iap"] : [];
    }
    if (platform === "android") {
      return filtered.filter((method) =>
        ["alipay_app_pay", "wechat_app_pay", "card_hosted_checkout", "unionpay_or_bank_card"].includes(method)
      );
    }
    return filtered;
  }

  private toPublicPaymentMethodCode(value: unknown) {
    const method = String(value ?? "");
    if (method === "alipay_app") return "alipay_app_pay";
    if (method === "wechat_app") return "wechat_app_pay";
    if (method === "alipay_web") return "alipay_qr";
    return method;
  }

  private defaultPaymentNotice(platform: string, methods: string[]) {
    if (platform === "ios") {
      return "iOS App 内购买由 App Store 处理，到账以服务端确认 Apple IAP 交易后为准。";
    }
    if (platform === "android") {
      return "安卓支付统一走平台收银台，应用市场仅作为分发渠道，不进入支付主干。";
    }
    if (methods.includes("enterprise_transfer")) {
      return "Web 支付支持支付宝、微信、托管银行卡和企业对公转账，对公转账需要后台对账确认。";
    }
    return "支付成功和权益到账以服务端支付确认、查单和钱包入账为准。";
  }

  private settlementNotice(billingMode: string) {
    if (billingMode === "revenue_share") {
      return "客户在 Web/App 支付后先入客户钱包，平台会按租户分成规则自动生成租户结算记录。";
    }
    if (billingMode === "subscription_usage") {
      return "客户在 Web/App 支付后先入客户钱包，租户侧 SaaS 套餐和用量账单由后台按周期汇总。";
    }
    if (billingMode === "postpaid") {
      return "客户调用仍以钱包和授信控制为准，租户侧后付账单由后台根据实际用量汇总。";
    }
    return "客户在 Web/App 支付后进入同一个客户钱包，App、Web 和 API 调用共用余额。";
  }
}
