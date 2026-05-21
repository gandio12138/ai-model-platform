import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

type Platform = "ios" | "android" | "web" | "api";

const platforms: Platform[] = ["ios", "android", "web", "api"];

interface ResolutionContext {
  tenant: any;
  project: any | null;
  platform: Platform;
  appVersion: string | null;
  packageName: string | null;
  bundleId: string | null;
  distributionChannel: string;
  region: string;
  deviceId: string | null;
}

interface AppDownloadRelease {
  id: string;
  platform: "ios" | "android";
  distribution_channel: string;
  version: string;
  build_number: number | null;
  release_status: string;
  min_supported_version: string | null;
  force_update: boolean;
  download_url: string | null;
  changelog: string | null;
  file_size_bytes: number | null;
  checksum_sha256: string | null;
  published_at: string | null;
  metadata: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function stringOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

@Injectable()
export class ConfigResolutionService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async resolveContext(query: Record<string, unknown>, headers: Record<string, unknown> = {}): Promise<ResolutionContext> {
    const platform = this.resolvePlatform(query.platform ?? headers["x-platform"] ?? "web");
    const tenant = await this.resolveTenant(query);
    const project = await this.resolveProject(tenant.id, platform, query);
    const packageName = stringOrNull(
      query.package_name ?? query.package ?? headers["x-package-name"] ?? headers["x-package"]
    );
    const bundleId = stringOrNull(query.bundle_id ?? headers["x-bundle-id"]);
    return {
      tenant,
      project,
      platform,
      appVersion: stringOrNull(query.app_version ?? headers["x-app-version"]),
      packageName,
      bundleId,
      distributionChannel: String(
        query.distribution_channel ?? headers["x-distribution-channel"] ?? "official"
      ),
      region: String(query.region ?? headers["x-region"] ?? "CN").toUpperCase(),
      deviceId: stringOrNull(query.device_id ?? headers["x-device-id"])
    };
  }

  async resolveSiteConfig(
    query: Record<string, unknown>,
    headers: Record<string, unknown> = {},
    overrides: Record<string, unknown> = {}
  ) {
    const context = await this.resolveContext({ ...query, platform: query.platform ?? "web" }, headers);
    const [siteConfig, appDownloadConfig, webPaymentEntry, featureFlags, paymentMethods, releases] =
      await Promise.all([
        this.findPublishedConfig("site_config"),
        this.findPublishedConfig("app_download"),
        this.findPublishedConfig("web_payment_entry"),
        this.findPublishedConfig("feature_flags"),
        this.listPaymentMethods(context),
        this.findPublishedAppReleases(context.tenant.id, null)
      ]);

    const effectiveSiteConfig = overrides.site_config ?? siteConfig;
    const effectiveAppDownload = overrides.app_download ?? appDownloadConfig;
    const effectiveWebPaymentEntry = overrides.web_payment_entry ?? webPaymentEntry;
    const effectiveFeatureFlags = overrides.feature_flags ?? featureFlags;
    const flags = this.normalizedFeatureFlags(effectiveFeatureFlags);
    const resolvedAppDownload = this.resolveAppDownloadConfig(asRecord(effectiveAppDownload), releases);
    const resolvedSiteConfig = this.resolveSiteConfigValue(asRecord(effectiveSiteConfig));
    return {
      tenant: context.tenant,
      project: context.project,
      platform: context.platform,
      context: this.publicContext(context),
      site_config: resolvedSiteConfig,
      app_download: resolvedAppDownload,
      web_payment_entry: this.resolveWebPaymentEntry(asRecord(effectiveWebPaymentEntry), "web"),
      payment_methods: paymentMethods,
      maintenance_mode: Boolean(asRecord(effectiveFeatureFlags).maintenance_mode ?? false),
      feature_flags: {
        checkout_web_v1: true,
        app_download: resolvedAppDownload.enabled,
        ...flags
      },
      resolved_at: new Date().toISOString()
    };
  }

  async resolveAppConfig(query: Record<string, unknown>, headers: Record<string, unknown> = {}) {
    const context = await this.resolveContext(query, headers);
    const [policy, paymentMethods, webPaymentEntry, siteConfig, appDownloadConfig, featureFlags, releases] =
      await Promise.all([
        this.findDistributionPolicy(context),
        this.listPaymentMethods(context),
        this.findPublishedConfig("web_payment_entry"),
        this.findPublishedConfig("site_config"),
        this.findPublishedConfig("app_download"),
        this.findPublishedConfig("feature_flags"),
        this.findPublishedAppReleases(context.tenant.id, context.platform === "ios" || context.platform === "android" ? context.platform : null)
      ]);

    const methodCodes = this.resolvePaymentMethodCodes(context.platform, paymentMethods, policy);
    const legalApproved = Boolean(policy?.legal_approved);
    const reviewMode = Boolean(policy?.review_mode);
    const policyShowWeb = Boolean(policy?.show_web_payment_link);
    const paymentEntry = this.resolveWebPaymentEntry(asRecord(webPaymentEntry), context.platform);
    const showWebPaymentLink =
      context.platform === "ios"
        ? legalApproved && policyShowWeb && paymentEntry.enabled
        : context.platform === "android"
          ? Boolean(policyShowWeb || paymentEntry.show_in_android_app)
          : paymentEntry.enabled;
    const webPaymentUrl =
      showWebPaymentLink
        ? String(policy?.web_payment_url ?? paymentEntry.url ?? process.env.WEB_PAYMENT_URL ?? "")
        : "";
    const site = this.resolveSiteConfigValue(asRecord(siteConfig));
    const flags = this.normalizedFeatureFlags(featureFlags);
    const appDownload = this.resolveAppDownloadConfig(asRecord(appDownloadConfig), releases);
    const mobilePlatform = context.platform === "ios" || context.platform === "android" ? context.platform : null;

    return {
      tenant_id: context.tenant.id,
      project_id: context.project?.id ?? null,
      tenant_billing_mode: context.tenant.billing_mode ?? "prepaid",
      tenant_plan_code: context.tenant.current_plan_code ?? null,
      platform: context.platform,
      app_version: context.appVersion,
      package_name: context.packageName,
      bundle_id: context.bundleId,
      distribution_channel: context.distributionChannel,
      region: context.region,
      review_mode: reviewMode,
      legal_approved: legalApproved,
      available_payment_methods: methodCodes,
      show_web_payment_link: Boolean(showWebPaymentLink && webPaymentUrl),
      web_payment_url: webPaymentUrl || null,
      payment_page_notice:
        policy?.payment_page_notice ??
        this.defaultPaymentNotice(context.platform, methodCodes),
      settlement_notice: this.settlementNotice(context.tenant.billing_mode ?? "prepaid"),
      ios_iap_enabled: context.platform === "ios" && methodCodes.includes("apple_iap"),
      android_unified_checkout_enabled:
        context.platform === "android" &&
        paymentMethods.some((method) => method.channel_type === "android_unified_checkout"),
      developer_api_enabled: !reviewMode && Boolean(flags.developer_api_enabled ?? site.modules.developer_api ?? true),
      referral_enabled: !reviewMode && Boolean(flags.referral_enabled ?? site.modules.referral ?? false),
      model_list_enabled: Boolean(flags.model_list_enabled ?? true),
      chat_enabled: !reviewMode && Boolean(flags.chat_enabled ?? true),
      support_contact: site.support,
      branding: site.branding,
      legal: site.legal,
      copy: site.copy,
      announcement:
        policy?.metadata?.announcement ??
        site.announcements.find((item: any) => item.visible !== false)?.content ??
        "OneToken 平台余额、API Key 和模型调用数据已在 Web 与 App 端共享。",
      privacy_notice_variant: policy?.metadata?.privacy_notice_variant ?? "standard_cn",
      content_safety_notice:
        policy?.metadata?.content_safety_notice ??
        "AI 生成内容可能存在不准确或不完整，请勿用于违法、侵权或高风险决策场景。",
      min_supported_app_version:
        policy?.metadata?.min_supported_app_version ??
        (mobilePlatform ? appDownload[mobilePlatform]?.min_supported_version : null) ??
        null,
      maintenance_mode: Boolean(policy?.metadata?.maintenance_mode ?? asRecord(featureFlags).maintenance_mode ?? false),
      app_download: appDownload,
      feature_flags: {
        app_config_v1: true,
        fake_provider_allowed: process.env.NODE_ENV !== "production",
        web_payment_entry: Boolean(showWebPaymentLink && webPaymentUrl),
        review_safe_copy: reviewMode,
        content_report_enabled: Boolean(flags.content_report_enabled ?? site.modules.content_report ?? true),
        account_deletion_enabled: Boolean(flags.account_deletion_enabled ?? site.modules.account_deletion ?? true),
        referral_enabled: !reviewMode && Boolean(flags.referral_enabled ?? site.modules.referral ?? false),
        developer_api_enabled: !reviewMode && Boolean(flags.developer_api_enabled ?? site.modules.developer_api ?? true),
        model_list_enabled: Boolean(flags.model_list_enabled ?? true),
        chat_enabled: !reviewMode && Boolean(flags.chat_enabled ?? true),
        ...flags
      }
    };
  }

  async previewConfig(configId: string, query: Record<string, unknown> = {}) {
    const { rows } = await this.db.query(
      `select id, config_key, config_type, draft_value, published_value, status, config_version
         from configs
        where id = $1`,
      [configId]
    );
    const config = rows[0];
    if (!config) {
      throw new NotFoundException("Config not found");
    }
    const affected = await this.resolveAffectedScopes(config.config_key, query);
    return {
      config,
      affected,
      preview: await this.resolveSiteConfig(query, {}, { [config.config_key]: config.draft_value })
    };
  }

  validateConfigValue(configKey: string, value: unknown) {
    const data = asRecord(value);
    if (configKey === "site_config") {
      if (data.branding && typeof data.branding !== "object") {
        throw new BadRequestException("site_config.branding must be an object");
      }
      if (data.navigation && !Array.isArray(data.navigation)) {
        throw new BadRequestException("site_config.navigation must be an array");
      }
      if (data.announcements && !Array.isArray(data.announcements)) {
        throw new BadRequestException("site_config.announcements must be an array");
      }
      if (data.faq && !Array.isArray(data.faq)) {
        throw new BadRequestException("site_config.faq must be an array");
      }
    }
    if (configKey === "app_download") {
      if (data.enabled !== undefined && typeof data.enabled !== "boolean") {
        throw new BadRequestException("app_download.enabled must be boolean");
      }
      for (const platform of ["ios", "android"]) {
        if (data[platform] && typeof data[platform] !== "object") {
          throw new BadRequestException(`app_download.${platform} must be an object`);
        }
      }
    }
    if (configKey === "web_payment_entry") {
      if (data.enabled && !data.url) {
        throw new BadRequestException("web_payment_entry.url is required when enabled");
      }
    }
  }

  private publicContext(context: ResolutionContext) {
    return {
      tenant_id: context.tenant.id,
      tenant_code: context.tenant.tenant_code,
      project_id: context.project?.id ?? null,
      project_code: context.project?.project_code ?? null,
      platform: context.platform,
      app_version: context.appVersion,
      package_name: context.packageName,
      bundle_id: context.bundleId,
      distribution_channel: context.distributionChannel,
      region: context.region
    };
  }

  private resolvePlatform(value: unknown): Platform {
    const platform = String(value ?? "web").toLowerCase();
    if (!platforms.includes(platform as Platform)) {
      throw new BadRequestException("platform must be one of ios, android, web, api");
    }
    return platform as Platform;
  }

  private async resolveTenant(query: Record<string, unknown>) {
    if (query.tenant_id) {
      const { rows } = await this.db.query(
        `select id, tenant_code, name, tenant_type, billing_mode, current_plan_code
           from tenants
          where id = $1
            and status = 'active'`,
        [query.tenant_id]
      );
      if (rows[0]) return rows[0];
      throw new NotFoundException("Tenant not found");
    }
    const tenantCode = String(query.tenant_code ?? "platform_default_tenant");
    const { rows } = await this.db.query(
      `select id, tenant_code, name, tenant_type, billing_mode, current_plan_code
         from tenants
        where tenant_code = $1
          and status = 'active'`,
      [tenantCode]
    );
    if (!rows[0]) {
      throw new NotFoundException("Tenant not found");
    }
    return rows[0];
  }

  private async resolveProject(tenantId: string, platform: Platform, query: Record<string, unknown>) {
    if (query.project_id) {
      const { rows } = await this.db.query(
        `select id, tenant_id, project_code, name, project_type, platform, payment_policy
           from tenant_projects
          where id = $1
            and tenant_id = $2
            and status = 'active'`,
        [query.project_id, tenantId]
      );
      if (rows[0]) return rows[0];
      throw new NotFoundException("Project not found");
    }
    if (query.project_code) {
      const { rows } = await this.db.query(
        `select id, tenant_id, project_code, name, project_type, platform, payment_policy
           from tenant_projects
          where tenant_id = $1
            and project_code = $2
            and platform = $3
            and status = 'active'`,
        [tenantId, query.project_code, platform]
      );
      if (rows[0]) return rows[0];
      throw new NotFoundException("Project not found");
    }
    const { rows } = await this.db.query(
      `select id, tenant_id, project_code, name, project_type, platform, payment_policy
         from tenant_projects
        where tenant_id = $1
          and platform = $2
          and status = 'active'
        order by created_at asc
        limit 1`,
      [tenantId, platform]
    );
    return rows[0] ?? null;
  }

  private async findDistributionPolicy(context: ResolutionContext) {
    const packageName = context.packageName ?? context.bundleId ?? "";
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
        context.tenant.id,
        context.platform,
        context.distributionChannel,
        context.region,
        context.project?.id ?? null,
        packageName
      ]
    );
    return rows[0] ?? null;
  }

  private async listPaymentMethods(context: ResolutionContext): Promise<any[]> {
    const { rows } = await this.db.query(
      `select channel_code,
              channel_type,
              display_name,
              platform,
              payment_method,
              settlement_mode,
              fee_rate_bps,
              sort_order,
              config
         from payment_channels
        where tenant_id = $1
          and platform = $2
          and enabled = true
          and (project_id is null or project_id = $3)
        order by case when project_id = $3 then 0 else 1 end,
                 sort_order asc,
                 display_name asc`,
      [context.tenant.id, context.platform, context.project?.id ?? null]
    );
    return rows.map((row) => ({
      ...row,
      internal_payment_method: row.payment_method,
      payment_method: this.toPublicPaymentMethodCode(row.payment_method),
      fee_rate_bps: row.fee_rate_bps === null ? null : Number(row.fee_rate_bps),
      config: undefined
    }));
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

  private async findPublishedAppReleases(tenantId: string, platform: "ios" | "android" | null) {
    const params: unknown[] = [tenantId];
    const platformSql = platform ? "and platform = $2" : "";
    if (platform) params.push(platform);
    const { rows } = await this.db.query<AppDownloadRelease>(
      `select distinct on (platform, distribution_channel)
              id,
              tenant_id,
              project_id,
              platform,
              distribution_channel,
              version,
              build_number,
              release_status,
              min_supported_version,
              force_update,
              download_url,
              changelog,
              file_size_bytes,
              checksum_sha256,
              published_at,
              metadata,
              updated_at
         from app_releases
        where tenant_id = $1
          ${platformSql}
          and release_status = 'published'
          and coalesce(download_url, '') <> ''
        order by platform,
                 distribution_channel,
                 published_at desc nulls last,
                 created_at desc`,
      params
    );
    return rows.map((row) => ({
      ...row,
      file_size_bytes: row.file_size_bytes === null ? null : Number(row.file_size_bytes),
      metadata: asRecord(row.metadata)
    }));
  }

  private resolveSiteConfigValue(config: Record<string, any>) {
    const branding = asRecord(config.branding);
    const modules = this.resolveModules(asRecord(config.modules));
    const copy = this.resolveCopyConfig(asRecord(config.copy));
    return {
      branding: {
        site_name: String(branding.site_name ?? "OneToken"),
        short_name: String(branding.short_name ?? "OneToken"),
        logo_url: stringOrNull(branding.logo_url),
        slogan: String(branding.slogan ?? "企业级大模型服务平台"),
        hero_badge: String(branding.hero_badge ?? "AI API Gateway"),
        hero_title: String(branding.hero_title ?? "一个 API Key，调用多家顶尖模型"),
        hero_subtitle: String(
          branding.hero_subtitle ??
            "统一接入 OpenAI、Claude、Gemini、DeepSeek、Qwen 等模型。按量计费、余额共享、账单透明，Web 与 App 共用同一个账户体系。"
        ),
        primary_cta: String(branding.primary_cta ?? "立即接入"),
        secondary_cta: String(branding.secondary_cta ?? "查看文档"),
        footer_text: String(branding.footer_text ?? "© 2026 OneToken. 版权所有"),
        icp_text: stringOrNull(branding.icp_text)
      },
      navigation:
        asArray(config.navigation).length > 0
          ? asArray(config.navigation)
          : [
              { key: "home", label: "首页", visible: true },
              { key: "console", label: "控制台", visible: true },
              { key: "models", label: "模型目录", visible: true },
              { key: "docs", label: "文档", visible: true }
            ],
      announcements:
        asArray(config.announcements).length > 0
          ? asArray(config.announcements)
          : [
              {
                title: "模型网关已上线",
                content: "Token API 接入采用 OpenAI 兼容格式，调用时使用 Bearer API Key。",
                level: "info",
                visible: true
              }
            ],
      faq:
        asArray(config.faq).length > 0
          ? asArray(config.faq)
          : [
              { question: "中转站的计费模式是怎样的？", answer: "按模型实际消耗和后台价格配置扣费。", sort_order: 1, visible: true },
              { question: "如何将现有 OpenAI 代码迁移？", answer: "替换 Base URL 和 API Key 即可复用原有 Chat Completions 调用。", sort_order: 2, visible: true }
            ],
      modules,
      support: {
        email: stringOrNull(config.support?.email) ?? process.env.SUPPORT_EMAIL ?? "support@onetoken.one",
        work_time: stringOrNull(config.support?.work_time) ?? "工作日 09:00-18:00",
        help_center_url: stringOrNull(config.support?.help_center_url),
        telegram: stringOrNull(config.support?.telegram),
        discord: stringOrNull(config.support?.discord)
      },
      legal: {
        terms_url: stringOrNull(config.legal?.terms_url),
        privacy_url: stringOrNull(config.legal?.privacy_url),
        ai_disclaimer_url: stringOrNull(config.legal?.ai_disclaimer_url),
        content_policy_url: stringOrNull(config.legal?.content_policy_url)
      },
      copy
    };
  }

  private normalizedFeatureFlags(value: unknown) {
    const record = asRecord(value);
    return {
      ...record,
      ...asRecord(record.flags)
    };
  }

  private resolveModules(config: Record<string, any>) {
    return {
      landing_model_coverage: Boolean(config.landing_model_coverage ?? true),
      landing_integrations: Boolean(config.landing_integrations ?? true),
      landing_app_download: Boolean(config.landing_app_download ?? true),
      dashboard_announcements: Boolean(config.dashboard_announcements ?? true),
      dashboard_faq: Boolean(config.dashboard_faq ?? true),
      referral: Boolean(config.referral ?? false),
      developer_api: Boolean(config.developer_api ?? true),
      app_download: Boolean(config.app_download ?? true),
      content_report: Boolean(config.content_report ?? true),
      account_deletion: Boolean(config.account_deletion ?? true)
    };
  }

  private resolveCopyConfig(config: Record<string, any>) {
    return {
      api_base_url_label: String(config.api_base_url_label ?? "API Base URL"),
      public_api_base_url: stringOrNull(config.public_api_base_url ?? process.env.PUBLIC_TOKEN_API_BASE) ?? "https://api.onetoken.one/v1",
      wallet_balance_label: String(config.wallet_balance_label ?? "可用余额"),
      cash_balance_label: String(config.cash_balance_label ?? "现金余额"),
      gift_balance_label: String(config.gift_balance_label ?? "赠送额度"),
      frozen_balance_label: String(config.frozen_balance_label ?? "冻结金额"),
      estimated_cost_title: String(config.estimated_cost_title ?? "发送前预估费用"),
      payment_notice: String(config.payment_notice ?? "支付成功和权益到账以服务端确认、查单和钱包入账为准。"),
      ai_disclaimer: String(config.ai_disclaimer ?? "AI 生成内容仅供参考，请遵守当地法律法规并避免输入敏感个人信息。"),
      model_catalog_intro: String(config.model_catalog_intro ?? "按模型类型和模型公司浏览后台同步的真实供应商模型，价格、权限和上下文以后台配置为准。")
    };
  }

  private resolveAppDownloadConfig(config: Record<string, any>, releases: AppDownloadRelease[]) {
    const iosReleases = releases.filter((item) => item.platform === "ios");
    const androidReleases = releases.filter((item) => item.platform === "android");
    const iosPrimary = iosReleases[0] ?? null;
    const androidPrimary = androidReleases[0] ?? null;
    const enabled = Boolean(config.enabled ?? (iosPrimary || androidPrimary));
    return {
      enabled,
      show_on_web_home: Boolean(config.show_on_web_home ?? enabled),
      show_on_console: Boolean(config.show_on_console ?? enabled),
      show_on_payment_success: Boolean(config.show_on_payment_success ?? enabled),
      title: String(config.title ?? "移动端随时使用 OneToken"),
      subtitle: String(config.subtitle ?? "App、Web 与 API 共用同一个客户账号和余额。"),
      ios: {
        enabled: Boolean(config.ios?.enabled ?? Boolean(iosPrimary)),
        app_store_url: stringOrNull(config.ios?.app_store_url ?? iosPrimary?.metadata?.app_store_url),
        testflight_url: stringOrNull(config.ios?.testflight_url ?? (iosPrimary?.distribution_channel === "testflight" ? iosPrimary.download_url : null)),
        download_url: stringOrNull(iosPrimary?.download_url),
        version: stringOrNull(config.ios?.version ?? iosPrimary?.version),
        min_supported_version: stringOrNull(config.ios?.min_supported_version ?? iosPrimary?.min_supported_version),
        release_notes: stringOrNull(iosPrimary?.changelog)
      },
      android: {
        enabled: Boolean(config.android?.enabled ?? Boolean(androidPrimary)),
        apk_url: stringOrNull(config.android?.apk_url ?? (androidPrimary?.distribution_channel === "official_apk" ? androidPrimary.download_url : null)),
        official_url: stringOrNull(config.android?.official_url ?? androidPrimary?.download_url),
        markets: asArray(config.android?.markets).filter((item) => item?.enabled !== false),
        version: stringOrNull(config.android?.version ?? androidPrimary?.version),
        min_supported_version: stringOrNull(config.android?.min_supported_version ?? androidPrimary?.min_supported_version),
        release_notes: stringOrNull(androidPrimary?.changelog)
      },
      qr_code_url: stringOrNull(config.qr_code_url),
      release_notes: stringOrNull(config.release_notes ?? iosPrimary?.changelog ?? androidPrimary?.changelog),
      releases
    };
  }

  private resolveWebPaymentEntry(config: Record<string, any>, platform: string) {
    const enabled = Boolean(config.enabled ?? false);
    return {
      enabled,
      url: String(config.url ?? process.env.WEB_PAYMENT_URL ?? ""),
      show_on_web: Boolean(config.show_on_web ?? enabled),
      show_in_android_app: Boolean(config.show_in_android_app ?? enabled),
      show_in_ios_app: Boolean(config.show_in_ios_app ?? false),
      legal_approved: Boolean(config.legal_approved ?? false),
      review_mode: Boolean(config.review_mode ?? false),
      regions: asArray(config.regions),
      platform
    };
  }

  private resolvePaymentMethodCodes(platform: Platform, methods: any[], policy: any | null) {
    const configured = methods.map((method) => String(method.payment_method)).filter(Boolean);
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

  private async resolveAffectedScopes(configKey: string, query: Record<string, unknown>) {
    const { rows } = await this.db.query(
      `select t.id as tenant_id,
              t.tenant_code,
              t.name as tenant_name,
              tp.id as project_id,
              tp.project_code,
              tp.platform
         from tenants t
         left join tenant_projects tp on tp.tenant_id = t.id and tp.status = 'active'
        where t.status = 'active'
          and ($1::text = '' or t.tenant_code = $1)
        order by t.created_at asc, tp.platform asc
        limit 100`,
      [String(query.tenant_code ?? "")]
    );
    return {
      config_key: configKey,
      scope_count: rows.length,
      scopes: rows
    };
  }
}
