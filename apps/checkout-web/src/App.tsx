import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  QRCode as AntQRCode,
  Select,
  Spin,
  Tag,
  message
} from "antd";
import {
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Code2,
  Copy,
  CreditCard,
  DatabaseZap,
  Gauge,
  Globe2,
  History,
  KeyRound,
  Languages,
  LayoutDashboard,
  LockKeyhole,
  LineChart,
  Mail,
  Monitor,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Smartphone,
  Trash2,
  WalletCards,
  Zap
} from "lucide-react";
import {
  ApiKeyRecord,
  AppRelease,
  BootstrapPayload,
  CommissionRecord,
  ModelInfo,
  PaymentMethod,
  PaymentOrder,
  ReferralSummary,
  SessionPayload,
  SiteConfigPayload,
  UsageLogItem,
  UsageSummary,
  Wallet,
  WalletLedgerItem,
  apiFetch,
  checkoutContextFromUrl,
  clearSession,
  getSessionUser,
  getToken,
  setSession,
  toQuery,
  updateSessionUser
} from "./api";

type ConsoleView = "dashboard" | "tokens" | "logs" | "wallet" | "models" | "referral" | "settings";
type SiteSection = "home" | "console" | "models" | "docs" | "auth";
type AuthMode = "login" | "register";

const tokenApiBase =
  import.meta.env.VITE_TOKEN_API_BASE ?? (typeof window !== "undefined" ? `${window.location.origin}/v1` : "/v1");
const iosAppDownloadUrl = import.meta.env.VITE_IOS_APP_DOWNLOAD_URL ?? "";
const androidAppDownloadUrl = import.meta.env.VITE_ANDROID_APP_DOWNLOAD_URL ?? "";
const isProductionBuild = import.meta.env.PROD;

const paymentMethodNames: Record<string, string> = {
  alipay_qr: "支付宝",
  alipay_web: "支付宝",
  wechat_native: "微信支付",
  card_checkout: "银行卡",
  enterprise_transfer: "对公转账",
  apple_iap: "Apple IAP",
  alipay_app: "支付宝 App",
  alipay_app_pay: "支付宝 App",
  wechat_app: "微信 App",
  wechat_app_pay: "微信 App"
};

const announcements = [
  {
    status: "进行中",
    text: "计划维护期间系统保持在线，可能出现短暂连接异常，遇到失败可稍后重试。",
    date: "2026-05-19 10:00"
  },
  {
    status: "成功",
    text: "新增模型同步、租户套餐展示、Web 支付渠道和客户 API Key 管理。",
    date: "2026-05-18 21:30"
  },
  {
    status: "默认",
    text: "Token API 接入采用 OpenAI 兼容格式，调用时使用 Bearer API Key。",
    date: "2026-05-17 09:15"
  }
];

const faqs = [
  "中转站的计费模式是怎样的？",
  "支持哪些编程语言调用？",
  "如何将现有 OpenAI 代码迁移？",
  "API 请求失败怎么办？",
  "数据安全如何保障？"
];

function siteModules(config: SiteConfigPayload | null) {
  return config?.site_config.modules ?? {
    landing_model_coverage: true,
    landing_integrations: true,
    landing_app_download: true,
    dashboard_announcements: true,
    dashboard_faq: true,
    referral: true,
    developer_api: true,
    app_download: true,
    content_report: true,
    account_deletion: true
  };
}

function appDownloadTargets(appDownload: SiteConfigPayload["app_download"] | null | undefined) {
  const iosUrl =
    appDownload?.ios.app_store_url ||
    appDownload?.ios.testflight_url ||
    appDownload?.ios.download_url ||
    (!isProductionBuild ? iosAppDownloadUrl : "");
  const androidUrl =
    appDownload?.android.apk_url ||
    appDownload?.android.official_url ||
    appDownload?.android.markets?.find((item) => item.enabled !== false)?.url ||
    (!isProductionBuild ? androidAppDownloadUrl : "");
  const qrUrl = appDownload?.qr_code_url ?? "";
  return { iosUrl, androidUrl, qrUrl, hasAny: Boolean(iosUrl || androidUrl || qrUrl) };
}

function shouldShowAppDownload(
  appDownload: SiteConfigPayload["app_download"] | null | undefined,
  placement: "home" | "console" | "payment_success"
) {
  if (!appDownload?.enabled) return false;
  if (placement === "home" && !appDownload.show_on_web_home) return false;
  if (placement === "console" && !appDownload.show_on_console) return false;
  if (placement === "payment_success" && !appDownload.show_on_payment_success) return false;
  return appDownloadTargets(appDownload).hasAny;
}

function configuredApiBase(siteConfig: SiteConfigPayload | null) {
  const configured = siteConfig?.site_config.copy?.public_api_base_url;
  if (configured) return configured;
  if (isProductionBuild && /localhost|127\.0\.0\.1/i.test(tokenApiBase)) {
    return "https://api.onetoken.one/v1";
  }
  return tokenApiBase;
}

function modelCompany(model: Pick<ModelInfo, "display_name" | "family" | "model_code" | "model_company">) {
  const raw = `${model.model_company ?? ""} ${model.family ?? ""} ${model.model_code} ${model.display_name}`.toLowerCase();
  if (raw.includes("deepseek")) return "DeepSeek";
  if (raw.includes("openai") || raw.includes("gpt-")) return "OpenAI";
  if (raw.includes("anthropic") || raw.includes("claude")) return "Claude";
  if (raw.includes("gemini") || raw.includes("google")) return "Gemini";
  if (raw.includes("qwen") || raw.includes("alibaba") || raw.includes("阿里")) return "阿里巴巴";
  if (raw.includes("midjourney")) return "Midjourney";
  if (raw.includes("grok") || raw.includes("xai")) return "xAI";
  return model.model_company ?? model.family ?? "其他";
}

function modelPublicName(model: Pick<ModelInfo, "display_name" | "family" | "model_code" | "model_company">) {
  const company = modelCompany(model);
  const raw = (model.display_name || model.model_code).trim();
  const companyPrefixPattern = company === "Claude" || company === "Gemini" ? null : new RegExp(`^${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
  const normalized = companyPrefixPattern ? raw.replace(companyPrefixPattern, "") : raw;
  return normalized
    .replace(/^Google\s+Gemini/i, "Gemini")
    .replace(/^Anthropic\s+Claude/i, "Claude")
    .replace(/^Mistral AI\s+Mistral/i, "Mistral")
    .replace(/\b(Claude\s+(?:Opus|Sonnet|Haiku)\s+\d+)\s+(\d+)\b/i, "$1.$2");
}

function modelCategoryLabel(model: ModelInfo) {
  return model.model_category_label || "文本对话模型";
}

function simplifiedModelCategory(model: ModelInfo) {
  const key = String(model.model_category ?? "").toLowerCase();
  const label = modelCategoryLabel(model);
  if (key === "image" || label.includes("图像") || label.includes("图片")) return "图片模型";
  if (key === "video" || label.includes("视频")) return "视频模型";
  if (key === "text_chat" || label.includes("文本") || label.includes("对话")) return "文本模型";
  return "其他模型";
}

function anonymizedSource(email?: string | null) {
  if (!email) return "来源客户";
  const [name, domain] = email.split("@");
  if (!domain) return "来源客户";
  return `${name.slice(0, 2)}***@${domain}`;
}

export default function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [context] = useState(() => checkoutContextFromUrl());
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [siteConfig, setSiteConfig] = useState<SiteConfigPayload | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [createdKey, setCreatedKey] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [siteSection, setSiteSection] = useState<SiteSection>("home");
  const [view, setView] = useState<ConsoleView>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [user, setUser] = useState(() => getSessionUser());
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletLedger, setWalletLedger] = useState<WalletLedgerItem[]>([]);
  const [usageLogs, setUsageLogs] = useState<UsageLogItem[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary | null>(null);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    apiFetch<{ user: SessionPayload["user"]; wallet: Wallet }>(`/api/public/me?${toQuery(context)}`)
      .then((payload) => {
        setUser(payload.user);
        updateSessionUser(payload.user);
        setWallet(payload.wallet);
        return Promise.all([
          loadApiKeys(),
          loadWalletLedger(),
          loadUsageLogs(),
          loadReferral().catch(() => undefined)
        ]);
      })
      .catch(() => {
        setUser(null);
        setWallet(null);
        setWalletLedger([]);
        setUsageLogs([]);
        setUsageSummary(null);
        setReferralSummary(null);
        setCommissions([]);
        setApiKeys([]);
      });
  }, [context]);

  useEffect(() => {
    const firstProduct = bootstrap?.products[0];
    if (!selectedProductId && firstProduct) {
      setSelectedProductId(firstProduct.id);
    }
  }, [bootstrap, selectedProductId]);

  const selectedProduct = useMemo(
    () => bootstrap?.products.find((product) => product.id === selectedProductId) ?? null,
    [bootstrap, selectedProductId]
  );

  const availableMethods = useMemo(() => {
    if (!bootstrap || !selectedProduct) return [];
    return bootstrap.payment_methods.filter((method) =>
      selectedProduct.payment_methods.includes(method.payment_method)
    );
  }, [bootstrap, selectedProduct]);

  useEffect(() => {
    const firstMethod =
      availableMethods.find((method) => method.payment_method !== "card_checkout")?.payment_method ??
      availableMethods[0]?.payment_method ??
      "";
    if (
      !availableMethods.some((method) => method.payment_method === selectedMethod) ||
      selectedMethod === "card_checkout"
    ) {
      setSelectedMethod(firstMethod);
    }
  }, [availableMethods, selectedMethod]);

  useEffect(() => {
    if (!order || !getToken()) return;
    if (["FULFILLED", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(order.status)) return;
    const timer = window.setInterval(() => {
      apiFetch<PaymentOrder>(`/api/payment/orders/${order.order_no}`)
        .then(async (payload) => {
          setOrder(payload);
          if (payload.status === "FULFILLED") {
            const me = await apiFetch<SessionPayload>(`/api/public/me?${toQuery(context)}`);
            setWallet(me.wallet);
            await loadWalletLedger();
            window.history.pushState({}, "", `/payment/success?order_no=${encodeURIComponent(payload.order_no)}`);
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [context, order?.order_no, order?.status]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [checkoutPayload, , modelPayload] = await Promise.all([
        apiFetch<BootstrapPayload>(`/api/public/bootstrap?${toQuery(context)}`),
        apiFetch<SiteConfigPayload>(`/api/public/site-config?${toQuery(context)}`)
          .then((payload) => {
            setSiteConfig(payload);
            return payload;
          })
          .catch((error) => {
            messageApi.warning(`后台站点配置加载失败，已使用默认展示：${error instanceof Error ? error.message : "未知错误"}`);
            return null;
          }),
        apiFetch<{ data: ModelInfo[] }>(`/api/public/models?${toQuery(context)}`)
      ]);
      setBootstrap(checkoutPayload);
      setModels(modelPayload.data);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "加载客户控制台失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadApiKeys() {
    const payload = await apiFetch<{ data: ApiKeyRecord[] }>(
      `/api/public/api-keys?${toQuery(context)}`
    );
    setApiKeys(payload.data);
  }

  async function loadWalletLedger() {
    const payload = await apiFetch<{ data: WalletLedgerItem[] }>(
      `/api/public/wallet/ledger?${toQuery({ ...context, pageSize: 8 })}`
    );
    setWalletLedger(payload.data);
  }

  async function loadUsageLogs() {
    const payload = await apiFetch<{
      data: UsageLogItem[];
      summary: UsageSummary;
    }>(`/api/public/usage-logs?${toQuery({ ...context, pageSize: 12 })}`);
    setUsageLogs(payload.data);
    setUsageSummary(payload.summary);
  }

  async function loadReferral() {
    const [summary, records] = await Promise.all([
      apiFetch<ReferralSummary>(`/api/referral/summary?${toQuery(context)}`),
      apiFetch<{ data: CommissionRecord[] }>(`/api/referral/commissions?${toQuery({ ...context, pageSize: 20 })}`)
    ]);
    setReferralSummary(summary);
    setCommissions(records.data);
  }

  async function submitAuth(values: { email: string; password: string }) {
    setSubmitting(true);
    try {
      const payload = await apiFetch<SessionPayload>(
        `/api/public/auth/${authMode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          body: JSON.stringify({ ...values, ...context })
        }
      );
      setSession(payload);
      setUser(payload.user);
      setWallet(payload.wallet);
      await Promise.all([loadApiKeys(), loadWalletLedger(), loadUsageLogs()]);
      setSiteSection("console");
      messageApi.success(authMode === "login" ? "登录成功" : "注册成功");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "账号处理失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function createOrder() {
    if (!selectedProduct || !selectedMethod) return;
    setSubmitting(true);
    try {
      const payload = await apiFetch<PaymentOrder>("/api/payment/orders", {
        method: "POST",
        body: JSON.stringify({
          ...context,
          product_id: selectedProduct.id,
          payment_method: selectedMethod,
          client_context: {
            user_agent: navigator.userAgent,
            entry_url: location.href
          }
        })
      });
      setOrder(payload);
      messageApi.success("订单已创建");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "创建订单失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function mockPay() {
    if (!order) return;
    setSubmitting(true);
    try {
      const payload = await apiFetch<{ order: PaymentOrder; wallet: Wallet }>(
        `/api/public/payment/orders/${order.order_no}/mock-pay`,
        { method: "POST" }
      );
      setOrder(payload.order);
      setWallet(payload.wallet);
      await loadWalletLedger();
      messageApi.success("支付已完成，额度已入账");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "支付确认失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function syncPaymentOrder() {
    if (!order) return;
    setSubmitting(true);
    try {
      const payload = await apiFetch<PaymentOrder>(`/api/payment/orders/${order.order_no}/sync`, {
        method: "POST"
      });
      setOrder(payload);
      if (payload.status === "FULFILLED") {
        const me = await apiFetch<SessionPayload>(`/api/public/me?${toQuery(context)}`);
        setWallet(me.wallet);
        await loadWalletLedger();
        window.history.pushState({}, "", `/payment/success?order_no=${encodeURIComponent(payload.order_no)}`);
        messageApi.success("支付已确认，额度已入账");
      } else {
        messageApi.info("暂未查询到支付成功结果");
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "查单失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function createApiKey(values: {
    name: string;
    group?: string;
    ip_whitelist?: string;
    rpm_limit?: string;
    tpm_limit?: string;
    daily_budget?: string;
    monthly_budget?: string;
    expires_at?: string;
    note?: string;
  }) {
    setSubmitting(true);
    try {
      const ipWhitelist = values.ip_whitelist
        ?.split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const payload = await apiFetch<{ key: string; record: ApiKeyRecord }>("/api/public/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          group: values.group,
          ip_whitelist: ipWhitelist?.length ? ipWhitelist : undefined,
          rpm_limit: values.rpm_limit ? Number(values.rpm_limit) : undefined,
          tpm_limit: values.tpm_limit ? Number(values.tpm_limit) : undefined,
          daily_budget: values.daily_budget ? Math.round(Number(values.daily_budget) * 100) : undefined,
          monthly_budget: values.monthly_budget ? Math.round(Number(values.monthly_budget) * 100) : undefined,
          expires_at: values.expires_at || undefined,
          note: values.note,
          ...context
        })
      });
      setCreatedKey(payload.key);
      setShowKeyModal(false);
      setApiKeys((items) => [payload.record, ...items]);
      messageApi.success("API Key 已创建");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "创建 API Key 失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeApiKey(id: string) {
    setSubmitting(true);
    try {
      const revoked = await apiFetch<ApiKeyRecord>(`/api/public/api-keys/${id}/revoke`, {
        method: "POST"
      });
      setApiKeys((items) => items.map((item) => (item.id === id ? revoked : item)));
      messageApi.success("API Key 已停用");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "停用 API Key 失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateProfile(values: { email: string; phone?: string }) {
    setSubmitting(true);
    try {
      const payload = await apiFetch<{ user: SessionPayload["user"] }>("/api/public/profile", {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          phone: values.phone ?? ""
        })
      });
      updateSessionUser(payload.user);
      setUser(payload.user);
      messageApi.success("资料已更新");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新资料失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function changePassword(values: { current_password: string; new_password: string }) {
    setSubmitting(true);
    try {
      await apiFetch<{ ok: true }>("/api/public/password", {
        method: "POST",
        body: JSON.stringify(values)
      });
      messageApi.success("密码已更新");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "修改密码失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestCommissionWithdrawal(values: { amount: number; payout_method?: string; payout_account?: string }) {
    setSubmitting(true);
    try {
      await apiFetch<{ notice: string }>("/api/referral/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          amount: Math.round(Number(values.amount) * 100),
          ...context,
          requested_from: "web"
        })
      });
      await loadReferral();
      messageApi.success("提现申请已提交");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "提交提现失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    messageApi.success("已复制");
  }

  function logout() {
    clearSession();
    setUser(null);
    setWallet(null);
    setWalletLedger([]);
    setUsageLogs([]);
    setUsageSummary(null);
    setOrder(null);
    setApiKeys([]);
    setSiteSection("home");
  }

  if (loading) {
    return (
      <main className="loading-screen">
        {contextHolder}
        <Spin size="large" />
      </main>
    );
  }

  if (siteSection === "home") {
    return (
      <PublicLayout
        active={siteSection}
        logout={logout}
        setActive={setSiteSection}
        setAuthMode={setAuthMode}
        siteConfig={siteConfig}
        user={user}
      >
        {contextHolder}
        <HomePage
          appReleases={bootstrap?.app_releases ?? []}
          models={models}
          setActive={setSiteSection}
          siteConfig={siteConfig}
          user={user}
        />
      </PublicLayout>
    );
  }

  if (siteSection === "models") {
    return (
      <PublicLayout
        active={siteSection}
        logout={logout}
        setActive={setSiteSection}
        setAuthMode={setAuthMode}
        siteConfig={siteConfig}
        user={user}
      >
        {contextHolder}
        <section className="site-page market-page">
          <ModelMarket models={models} copyText={copyText} siteConfig={siteConfig} />
        </section>
      </PublicLayout>
    );
  }

  if (siteSection === "docs") {
    return (
      <PublicLayout
        active={siteSection}
        logout={logout}
        setActive={setSiteSection}
        setAuthMode={setAuthMode}
        siteConfig={siteConfig}
        user={user}
      >
        {contextHolder}
        <DocsPage models={models} copyText={copyText} siteConfig={siteConfig} />
      </PublicLayout>
    );
  }

  if (!user || siteSection === "auth") {
    return (
      <PublicLayout
        active="auth"
        logout={logout}
        setActive={setSiteSection}
        setAuthMode={setAuthMode}
        siteConfig={siteConfig}
        user={user}
      >
        {contextHolder}
        <AuthPage
          authMode={authMode}
          setAuthMode={setAuthMode}
          submitAuth={submitAuth}
          submitting={submitting}
        />
      </PublicLayout>
    );
  }

  return (
    <PublicLayout
      active={siteSection}
      logout={logout}
      setActive={setSiteSection}
      setAuthMode={setAuthMode}
      siteConfig={siteConfig}
      user={user}
    >
      {contextHolder}
      <div className={`console-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <SideNav
          active={view}
          collapsed={sidebarCollapsed}
          siteConfig={siteConfig}
          setActive={setView}
          toggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />
        <section className="console-main">
          {view === "dashboard" ? (
            <Dashboard
              apiKeys={apiKeys}
              models={models}
              setView={setView}
              siteConfig={siteConfig}
              usageLogs={usageLogs}
              usageSummary={usageSummary}
              user={user}
              wallet={wallet}
              copyText={copyText}
            />
          ) : null}
          {view === "tokens" ? (
            <TokenManager
              apiKeys={apiKeys}
              copyText={copyText}
              models={models}
              openCreate={() => setShowKeyModal(true)}
              refreshKeys={loadApiKeys}
              revokeApiKey={revokeApiKey}
              submitting={submitting}
            />
          ) : null}
          {view === "logs" ? <UsageLogs logs={usageLogs} summary={usageSummary} /> : null}
          {view === "wallet" ? (
            <WalletManager
              appDownload={siteConfig?.app_download ?? null}
              availableMethods={availableMethods}
              createOrder={createOrder}
              ledger={walletLedger}
              mockPay={mockPay}
              order={order}
              products={bootstrap?.products ?? []}
              selectedMethod={selectedMethod}
              selectedProduct={selectedProduct}
              selectedProductId={selectedProductId}
              tenantBillingMode={bootstrap?.tenant.billing_mode ?? "prepaid"}
              tenantPlanCode={bootstrap?.tenant.current_plan_code ?? null}
              setOrder={setOrder}
              setSelectedMethod={setSelectedMethod}
              setSelectedProductId={setSelectedProductId}
              syncPaymentOrder={syncPaymentOrder}
              submitting={submitting}
              wallet={wallet}
            />
          ) : null}
          {view === "models" ? <ModelMarket models={models} copyText={copyText} siteConfig={siteConfig} /> : null}
          {view === "referral" ? (
            <ReferralPanel
              commissions={commissions}
              copyText={copyText}
              requestWithdrawal={requestCommissionWithdrawal}
              submitting={submitting}
              summary={referralSummary}
            />
          ) : null}
          {view === "settings" ? (
            <SettingsPage
              changePassword={changePassword}
              submitting={submitting}
              updateProfile={updateProfile}
              siteConfig={siteConfig}
              user={user}
            />
          ) : null}
        </section>
      </div>

      <CreateKeyModal
        open={showKeyModal}
        submitting={submitting}
        onCancel={() => setShowKeyModal(false)}
        onCreate={createApiKey}
      />
      <Modal
        footer={[
          <Button key="copy" icon={<Copy size={16} />} type="primary" onClick={() => copyText(createdKey)}>
            复制 API Key
          </Button>
        ]}
        open={Boolean(createdKey)}
        title="API Key 已生成"
        onCancel={() => setCreatedKey("")}
      >
        <Alert message="密钥只显示一次" description="关闭后只能看到脱敏后的密钥标识。" type="warning" showIcon />
        <pre className="secret-box">{createdKey}</pre>
      </Modal>
    </PublicLayout>
  );
}

function PublicLayout({
  active,
  children,
  logout,
  setActive,
  setAuthMode,
  siteConfig,
  user
}: {
  active: SiteSection;
  children: React.ReactNode;
  logout: () => void;
  setActive: (section: SiteSection) => void;
  setAuthMode: (mode: AuthMode) => void;
  siteConfig: SiteConfigPayload | null;
  user: any;
}) {
  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
    setActive("auth");
  }
  const displayName = user ? String(user.email ?? "victor").split("@")[0] : "";
  const nav = siteConfig?.site_config.navigation?.filter((item) => item.visible !== false) ?? [
    { key: "home", label: "首页" },
    { key: "console", label: "控制台" },
    { key: "models", label: "模型目录" },
    { key: "docs", label: "文档" }
  ];
  const siteName = siteConfig?.site_config.branding.site_name ?? "OneToken";

  return (
    <main className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <button className="site-brand" onClick={() => setActive("home")} type="button">
            <span className="site-brand-mark">O</span>
            <span>{siteName}</span>
          </button>
          <nav className="top-links" aria-label="主导航">
            {nav.map((item) => {
              const key = item.key as SiteSection;
              if (!["home", "console", "models", "docs"].includes(key)) return null;
              return (
                <button
                  className={active === key ? "active" : ""}
                  key={item.key}
                  onClick={() => setActive(key === "console" ? (user ? "console" : "auth") : key)}
                  type="button"
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="header-actions">
            <button aria-label="通知" className="header-icon-button" type="button">
              <Bell size={17} />
              <span className="notice-count">13</span>
            </button>
            <button aria-label="显示设备" className="header-icon-button" type="button">
              <Monitor size={17} />
            </button>
            <button aria-label="语言" className="header-icon-button" type="button">
              <Languages size={17} />
            </button>
            {user ? (
              <button className="user-pill" onClick={logout} title="退出登录" type="button">
                <span>{displayName.slice(0, 1).toUpperCase()}</span>
                {displayName}
                <i>⌄</i>
              </button>
            ) : (
              <>
                <Button onClick={() => openAuth("login")}>登录</Button>
                <Button type="primary" onClick={() => openAuth("register")}>
                  注册
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}

function AuthPage({
  authMode,
  setAuthMode,
  submitAuth,
  submitting
}: {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  submitAuth: (values: { email: string; password: string }) => void;
  submitting: boolean;
}) {
  return (
    <section className="auth-screen">
      <div className="auth-card">
        <div className="auth-title">
          <span className="brand-mark">A</span>
          <h1>{authMode === "login" ? "登 录" : "注 册"}</h1>
        </div>
        <Form layout="vertical" onFinish={submitAuth}>
          <Form.Item
            label="用户名或邮箱"
            name="email"
            rules={[
              { required: true, message: "请输入用户名或邮箱" },
              { type: "email", message: "请输入邮箱格式账号" }
            ]}
          >
            <Input size="large" placeholder="请输入您的用户名或邮箱地址" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, min: 8, message: "请输入至少 8 位密码" }]}
          >
            <Input.Password size="large" placeholder="请输入您的密码" />
          </Form.Item>
          <Button block htmlType="submit" loading={submitting} size="large" type="primary">
            继续
          </Button>
        </Form>
        <div className="auth-switch">
          {authMode === "login" ? "没有账户？" : "已有账户？"}
          <Button type="link" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
            {authMode === "login" ? "注册" : "登录"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function HomePage({
  appReleases,
  models,
  setActive,
  siteConfig,
  user
}: {
  appReleases: AppRelease[];
  models: ModelInfo[];
  setActive: (section: SiteSection) => void;
  siteConfig: SiteConfigPayload | null;
  user: SessionPayload["user"] | null;
}) {
  const appDownload = siteConfig?.app_download;
  const iosRelease = appDownload?.releases?.find((release) => release.platform === "ios") ?? appReleases.find((release) => release.platform === "ios");
  const androidRelease = appDownload?.releases?.find((release) => release.platform === "android") ?? appReleases.find((release) => release.platform === "android");
  const { iosUrl: iosDownloadUrl, androidUrl: androidDownloadUrl, qrUrl: appQrUrl } = appDownloadTargets(appDownload);
  const branding = siteConfig?.site_config.branding;
  const modules = siteModules(siteConfig);
  const apiBase = configuredApiBase(siteConfig);
  const heroTitle = branding?.hero_title ?? "一个 API Key，调用多家顶尖模型";
  const heroSubtitle = branding?.hero_subtitle ?? "统一接入 OpenAI、Claude、Gemini、DeepSeek、Qwen 等模型。按量计费、余额共享、账单透明，Web 与 App 共用同一个账户体系。";
  const showDownloads = modules.landing_app_download && shouldShowAppDownload(appDownload, "home");

  return (
    <section className="home-page landing-home">
      <div className="landing-stage">
        <NetworkPlane />
        <div className="landing-globe" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="landing-halo" aria-hidden="true" />

        <div className="landing-hero">
          <span className="landing-eyebrow">{branding?.hero_badge ?? "AI API Gateway"}</span>
          <h1>{heroTitle}</h1>
          <p>
            {heroSubtitle}
          </p>
          <div className="landing-actions">
            <Button className="landing-doc-button" size="large" onClick={() => setActive("docs")}>
              {branding?.secondary_cta ?? "查看文档"}
            </Button>
            <Button
              className="landing-primary-button"
              size="large"
              type="primary"
              onClick={() => setActive(user ? "console" : "auth")}
            >
              {branding?.primary_cta ?? "立即接入"}
              <ChevronRight size={18} />
            </Button>
          </div>
          <div className="landing-command-panel" aria-label="OneToken 接入预览">
            <div className="landing-command-copy">
              <span>OpenAI Compatible</span>
              <strong>{apiBase}</strong>
              <p>替换 Base URL，使用同一组 API Key 即可在 Web、App 与服务端调用所有可用模型。</p>
            </div>
            <div className="landing-command-code">
              <div className="code-window-bar">
                <span />
                <span />
                <span />
              </div>
              <pre>{`const client = new OpenAI({
  baseURL: "${apiBase}",
  apiKey: process.env.AI_TOKEN_API_KEY
});

await client.chat.completions.create({
  model: "${models[0]?.model_code ?? "gpt-4o"}",
  messages: [{ role: "user", content: "你好" }]
});`}</pre>
            </div>
          </div>
        </div>

        <section className="capability-row" aria-label="平台核心能力">
          <article className="capability-card coverage-card">
            <div className="capability-heading">
              <span className="capability-icon"><DatabaseZap size={18} /></span>
              <h3>主流模型统一接入</h3>
            </div>
            <p>维护多家 Provider 和模型路由，客户端只需要接入一套 OpenAI 兼容协议。</p>
            <div className="model-coverage-line">
              <span>OpenAI</span>
              <span>Claude</span>
              <span>Gemini</span>
              <span>DeepSeek</span>
              <span>Qwen</span>
            </div>
          </article>

          <article className="capability-card code-card">
            <div className="capability-heading">
              <span className="capability-icon"><KeyRound size={18} /></span>
              <h3>API Key 与钱包共享</h3>
            </div>
            <p>同一个账户余额可用于 Web、App 和 API 调用，充值、扣费、赠送额度统一归集。</p>
            <div className="shared-wallet-line">
              <span>Web</span>
              <i />
              <strong>Wallet</strong>
              <i />
              <span>App</span>
            </div>
          </article>

          <article className="capability-card billing-card">
            <div className="capability-heading">
              <span className="capability-icon"><LineChart size={18} /></span>
              <h3>按量计费，明细透明</h3>
            </div>
            <p>每次调用记录输入、输出、模型、耗时和费用，方便对账与成本控制。</p>
            <div className="billing-mini-table" aria-hidden="true">
              <span>模型</span>
              <span>Tokens</span>
              <span>扣费</span>
              <strong>{models[0]?.model_code ?? "gpt-4o"}</strong>
              <strong>3,482</strong>
              <strong>¥0.61</strong>
            </div>
          </article>

          <article className="capability-card route-card">
            <div className="capability-heading">
              <span className="capability-icon"><Gauge size={18} /></span>
              <h3>路由、限流与失败重试</h3>
            </div>
            <p>请求进入网关后自动完成路由、限流、失败重试和账单归集，调用链路保持稳定可观测。</p>
            <div className="route-line">
              <span>Client</span>
              <i />
              <strong>Gateway</strong>
              <i />
              <span>Model</span>
            </div>
          </article>
        </section>

        {modules.landing_integrations ? <section className="app-configs" aria-labelledby="integration-title">
          <div className="app-config-copy">
            <span>Integrations</span>
            <h2 id="integration-title">常见应用配置</h2>
            <p>Cursor、Claude Code、Qwen Code、OpenAI Codex 等客户端可复用同一组 Base URL 和 API Key。</p>
          </div>
          <div className="integration-flow" aria-label="三步接入">
            <div>
              <em>01</em>
              <strong>复制 Base URL</strong>
              <span>{apiBase}</span>
            </div>
            <div>
              <em>02</em>
              <strong>创建 API Key</strong>
              <span>完整密钥只展示一次</span>
            </div>
            <div>
              <em>03</em>
              <strong>指定模型 ID</strong>
              <span>{models[0]?.model_code ?? "gpt-4o"}</span>
            </div>
          </div>
          <div className="integration-tags" aria-label="常见集成工具">
            <span>Cursor</span>
            <span>Claude Code</span>
            <span>Qwen Code</span>
            <span>OpenAI Codex</span>
          </div>
          <div className="integration-actions">
            <button type="button" onClick={() => setActive("docs")}>
              查看配置文档
            </button>
            <button type="button" onClick={() => setActive(user ? "console" : "auth")}>
              管理 API Key
            </button>
          </div>
        </section> : null}

        {showDownloads ? <section className="mobile-downloads" aria-labelledby="mobile-download-title">
          <div className="mobile-download-copy">
            <span>Mobile App</span>
            <h2 id="mobile-download-title">{appDownload?.title ?? "移动端随时使用 OneToken"}</h2>
            <p>{appDownload?.subtitle ?? "App 端优先承载 AI 对话、模型切换、钱包充值和账单查看，Web、App 与 API 共用同一个客户账号和余额。"}</p>
          </div>
          <div className="mobile-download-grid">
            {iosDownloadUrl ? <article className="mobile-download-card">
              <div className="mobile-download-icon">
                <Phone size={22} />
              </div>
              <div>
                <h3>iOS App</h3>
                <p>{appDownload?.ios.release_notes ?? "支持 iPhone 真机、TestFlight 内测和 Apple IAP 充值链路。"}</p>
              </div>
              {(appDownload?.ios.version || iosRelease?.version) && <span className="mobile-release-meta">{appDownload?.ios.version ?? iosRelease?.version} · {iosRelease?.distribution_channel ?? "ios"}</span>}
              <a className="mobile-download-button" href={iosDownloadUrl} target="_blank" rel="noreferrer">
                下载 iOS
              </a>
            </article> : null}
            {androidDownloadUrl ? <article className="mobile-download-card">
              <div className="mobile-download-icon">
                <Smartphone size={22} />
              </div>
              <div>
                <h3>Android App</h3>
                <p>{appDownload?.android.release_notes ?? "支持官网 APK、应用市场包和安卓统一收银台支付链路。"}</p>
              </div>
              {(appDownload?.android.version || androidRelease?.version) && <span className="mobile-release-meta">{appDownload?.android.version ?? androidRelease?.version} · {androidRelease?.distribution_channel ?? "android"}</span>}
              <a className="mobile-download-button" href={androidDownloadUrl} target="_blank" rel="noreferrer">
                下载 Android
              </a>
            </article> : null}
            {appQrUrl ? <article className="mobile-download-card">
              <div className="mobile-download-icon">
                <QrCode size={22} />
              </div>
              <div>
                <h3>扫码下载</h3>
                <p>使用手机扫码打开后台配置的下载页。</p>
              </div>
              <a className="mobile-download-button" href={appQrUrl} target="_blank" rel="noreferrer">
                打开二维码
              </a>
            </article> : null}
          </div>
        </section> : null}

        <footer className="landing-footer">
          <span>{branding?.footer_text ?? "© 2026 OneToken. 版权所有"}</span>
          <span>
            设计与开发由 <strong>OneToken</strong>
          </span>
        </footer>
      </div>
    </section>
  );
}

function NetworkPlane() {
  const dots = [
    [55, 268],
    [135, 226],
    [245, 194],
    [342, 246],
    [426, 180],
    [536, 230],
    [646, 164],
    [742, 222],
    [860, 168],
    [960, 244],
    [1085, 196],
    [1190, 274],
    [1324, 224],
    [1482, 280],
    [172, 432],
    [320, 374],
    [478, 448],
    [638, 390],
    [814, 464],
    [984, 394],
    [1150, 478],
    [1320, 408],
    [1470, 492]
  ];
  return (
    <svg className="network-plane-svg" viewBox="0 0 1600 620" preserveAspectRatio="none" aria-hidden="true">
      <g className="network-lines">
        <polyline points="0,284 135,226 245,194 342,246 426,180 536,230 646,164 742,222 860,168 960,244 1085,196 1190,274 1324,224 1600,300" />
        <polyline points="0,384 172,432 320,374 478,448 638,390 814,464 984,394 1150,478 1320,408 1600,520" />
        <polyline points="55,268 172,432 342,246 478,448 646,164 814,464 960,244 1150,478 1324,224 1470,492" />
        <polyline points="135,226 320,374 426,180 638,390 742,222 984,394 1085,196 1320,408 1482,280" />
        <polyline points="0,512 172,432 478,448 814,464 1150,478 1470,492 1600,548" />
        <polyline points="245,194 426,180 646,164 860,168 1085,196 1324,224 1482,280" />
      </g>
      <g className="network-dots">
        {dots.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" />
        ))}
      </g>
    </svg>
  );
}

function SideNav({
  active,
  collapsed,
  siteConfig,
  setActive,
  toggleCollapsed
}: {
  active: ConsoleView;
  collapsed: boolean;
  siteConfig: SiteConfigPayload | null;
  setActive: (view: ConsoleView) => void;
  toggleCollapsed: () => void;
}) {
  const modules = siteModules(siteConfig);
  const items: Array<{ key: ConsoleView; icon: React.ReactNode; label: string }> = [
    { key: "dashboard", icon: <LayoutDashboard size={17} />, label: "数据看板" },
    { key: "tokens", icon: <KeyRound size={17} />, label: "API Key 管理" },
    { key: "logs", icon: <History size={17} />, label: "使用日志" },
    { key: "models", icon: <Boxes size={17} />, label: "模型目录" },
    { key: "wallet", icon: <WalletCards size={17} />, label: "钱包" },
    ...(modules.referral ? [{ key: "referral" as ConsoleView, icon: <CircleDollarSign size={17} />, label: "邀请返佣" }] : []),
    { key: "settings", icon: <Settings size={17} />, label: "个人设置" }
  ];
  return (
    <aside className="console-sidebar">
      <p className="sidebar-title">控制台</p>
      {items.map((item) => (
        <button
          aria-label={item.label}
          className={`side-link ${active === item.key ? "active" : ""}`}
          key={item.key}
          onClick={() => setActive(item.key)}
          title={collapsed ? item.label : undefined}
          type="button"
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
      <button
        aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        className="collapse-btn"
        onClick={toggleCollapsed}
        title={collapsed ? "展开侧边栏" : undefined}
        type="button"
      >
        <ChevronLeft size={16} />
        <span>{collapsed ? "展开" : "收起侧边栏"}</span>
      </button>
    </aside>
  );
}

function Dashboard({
  apiKeys,
  copyText,
  models,
  setView,
  siteConfig,
  usageLogs,
  usageSummary,
  user,
  wallet
}: {
  apiKeys: ApiKeyRecord[];
  copyText: (text: string) => void;
  models: ModelInfo[];
  setView: (view: ConsoleView) => void;
  siteConfig: SiteConfigPayload | null;
  usageLogs: UsageLogItem[];
  usageSummary: UsageSummary | null;
  user: any;
  wallet: Wallet | null;
}) {
  const activeKeys = apiKeys.filter((item) => item.status === "active").length;
  const trend = usageSummary?.trend ?? [];
  const maxTrendRequests = Math.max(...trend.map((item) => item.requests), 1);
  const siteAnnouncements = siteConfig?.site_config.announcements?.filter((item) => item.visible !== false) ?? [];
  const siteFaqs = siteConfig?.site_config.faq?.filter((item) => item.visible !== false) ?? [];
  const modules = siteModules(siteConfig);
  const apiBase = configuredApiBase(siteConfig);
  const showAppDownload = modules.app_download && shouldShowAppDownload(siteConfig?.app_download, "console");
  const successCount = usageLogs.filter((item) => item.status === "success").length;
  const successRate = usageLogs.length ? `${Math.round((successCount / usageLogs.length) * 1000) / 10}%` : "100%";
  return (
    <div className="dashboard-page">
      <div className="page-heading dashboard-heading">
        <div>
          <span className="page-kicker">Customer Console</span>
          <h1>早上好，{String(user.email).split("@")[0]}</h1>
          <p>查看余额、API Key、调用趋势、模型消耗和服务状态。</p>
        </div>
        <div className="page-actions">
          <Button aria-label="搜索" shape="circle" icon={<Search size={17} />} />
          <Button aria-label="刷新" shape="circle" icon={<RefreshCw size={17} />} />
        </div>
      </div>

      <div className="dashboard-quick-actions" aria-label="快捷操作">
        <Button icon={<KeyRound size={16} />} type="primary" onClick={() => setView("tokens")}>
          新建 API Key
        </Button>
        <Button icon={<Boxes size={16} />} onClick={() => setView("models")}>
          查看模型目录
        </Button>
        <Button icon={<WalletCards size={16} />} onClick={() => setView("wallet")}>
          充值
        </Button>
        <Button icon={<History size={16} />} onClick={() => setView("logs")}>
          查看调用日志
        </Button>
      </div>

      <div className="stats-grid">
        <StatCard
          title="账户余额"
          items={[
            { icon: <CircleDollarSign size={18} />, label: siteConfig?.site_config.copy?.wallet_balance_label ?? "可用余额", value: money(wallet?.available_balance ?? 0) },
            { icon: <BarChart3 size={18} />, label: "历史消耗", value: money(usageSummary?.total_cost ?? 0) }
          ]}
          action={<Button size="small" onClick={() => setView("wallet")}>充值</Button>}
        />
        <StatCard
          title="使用统计"
          items={[
            { icon: <Zap size={18} />, label: "请求次数", value: numberText(usageSummary?.total_requests ?? 0) },
            { icon: <LineChart size={18} />, label: "近 1 小时 RPM", value: String(usageSummary?.rpm ?? 0) }
          ]}
        />
        <StatCard
          title="Token 消耗"
          items={[
            { icon: <CircleDollarSign size={18} />, label: "本期扣费", value: money(usageSummary?.total_cost ?? 0) },
            { icon: <Code2 size={18} />, label: "累计 Tokens", value: numberText(usageSummary?.total_tokens ?? 0) }
          ]}
        />
        <StatCard
          title="性能指标"
          items={[
            { icon: <Gauge size={18} />, label: "平均耗时", value: `${usageSummary?.avg_latency_ms ?? 0} ms` },
            { icon: <Server size={18} />, label: "成功率", value: successRate }
          ]}
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <PanelTitle icon={<BarChart3 size={17} />} title="模型数据分析" />
          <div className="chart-tabs">
            <strong>调用趋势</strong>
            <span>近 7 天</span>
            <span>按当前客户钱包统计</span>
          </div>
          <div className="trend-chart">
            {trend.map((item) => (
              <div className="trend-bar" key={item.day}>
                <span style={{ height: `${Math.max(10, (item.requests / maxTrendRequests) * 100)}%` }} />
                <strong>{item.requests}</strong>
                <em>{item.day}</em>
              </div>
            ))}
            {!trend.length ? <Empty description="暂无趋势数据" /> : null}
          </div>
          <div className="recent-log-list">
            {usageLogs.slice(0, 4).map((log) => (
              <div key={log.id}>
                <span>{log.model_code}</span>
                <strong>{numberText(log.total_tokens)} tokens</strong>
                <em>{money(log.cost_amount)}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel api-info">
          <PanelTitle icon={<Server size={17} />} title="API 信息" />
          <ApiEndpoint label={siteConfig?.site_config.copy?.api_base_url_label ?? "API Base URL"} note="OpenAI 兼容接口" url={apiBase} copyText={copyText} />
          <ApiEndpoint label="日本优化线路" note="适合长任务" url="https://api.onetoken.one" copyText={copyText} />
          <div className="mini-summary">
            <div>
              <strong>{models.length}</strong>
              <span>模型范围</span>
            </div>
            <div>
              <strong>{activeKeys}</strong>
              <span>活跃 API Key</span>
            </div>
          </div>
          {showAppDownload ? <AppDownloadMini appDownload={siteConfig!.app_download} /> : null}
        </section>
      </div>

      <div className="bottom-grid">
        {modules.dashboard_announcements ? <section className="panel">
          <PanelTitle icon={<Bell size={17} />} title="系统公告" extra={<Tag>显示最新20条</Tag>} />
          <div className="timeline">
            {(siteAnnouncements.length ? siteAnnouncements : announcements).map((item: any) => (
              <div className="timeline-item" key={item.title ?? item.date}>
                <span className={`dot ${item.level ?? item.status}`} />
                <p>{item.content ?? item.text}</p>
                <small>{item.start_at ?? item.date ?? "后台配置"}</small>
              </div>
            ))}
          </div>
        </section> : null}
        {modules.dashboard_faq ? <section className="panel">
          <PanelTitle icon={<BookOpen size={17} />} title="常见问答" />
          <div className="faq-list">
            {(siteFaqs.length ? siteFaqs : faqs).map((item: any) => (
              <button key={item.question ?? item} type="button">
                {item.question ?? item}
                <Plus size={16} />
              </button>
            ))}
          </div>
        </section> : null}
        <section className="panel">
          <PanelTitle icon={<Gauge size={17} />} title="服务可用性" extra={<RefreshCw size={16} />} />
          <ServiceStatus name="OneToken Gateway" />
          <ServiceStatus name="Provider Routing" />
        </section>
      </div>
    </div>
  );
}

function StatCard({
  action,
  items,
  title
}: {
  action?: React.ReactNode;
  items: Array<{ icon: React.ReactNode; label: string; value: string }>;
  title: string;
}) {
  return (
    <section className="panel stat-card">
      <div className="panel-title-row">
        <h3>{title}</h3>
        {action}
      </div>
      {items.map((item, index) => (
        <div className="stat-row" key={item.label}>
          <span className={`stat-icon tone-${index}`}>{item.icon}</span>
          <div>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        </div>
      ))}
    </section>
  );
}

function TokenManager({
  apiKeys,
  copyText,
  models,
  openCreate,
  refreshKeys,
  revokeApiKey,
  submitting
}: {
  apiKeys: ApiKeyRecord[];
  copyText: (text: string) => void;
  models: ModelInfo[];
  openCreate: () => void;
  refreshKeys: () => void;
  revokeApiKey: (id: string) => void;
  submitting: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<ApiKeyRecord | null>(null);
  const filtered = apiKeys.filter((item) => {
    const text = `${item.name} ${item.masked_key} ${item.status}`.toLowerCase();
    return !keyword || text.includes(keyword.toLowerCase());
  });
  const selectedKeys = filtered.filter((item) => selectedIds.includes(item.id));
  const toggleId = (id: string) =>
    setSelectedIds((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
  const toggleAll = () =>
    setSelectedIds((items) => (items.length === filtered.length ? [] : filtered.map((item) => item.id)));
  return (
    <section className="panel page-panel">
      <div className="table-title">
        <PanelTitle icon={<KeyRound size={17} />} title="API Key 管理" />
        <span className="table-subtitle">创建和管理用于模型调用的 API Key。完整密钥只会在创建成功后展示一次。</span>
      </div>
      <div className="toolbar">
        <Button icon={<Plus size={16} />} type="primary" onClick={openCreate}>
          新建 API Key
        </Button>
        <Button
          disabled={!selectedKeys.length}
          icon={<Copy size={16} />}
          onClick={() => copyText(selectedKeys.map((item) => item.id).join("\n"))}
        >
          复制选中 Key ID
        </Button>
        <Button
          danger
          disabled={!selectedKeys.some((item) => item.status === "active")}
          icon={<Trash2 size={16} />}
          loading={submitting}
          onClick={() => selectedKeys.filter((item) => item.status === "active").forEach((item) => revokeApiKey(item.id))}
        >
          停用选中 API Key
        </Button>
        <span className="toolbar-spacer" />
        <Input
          className="toolbar-input"
          prefix={<Search size={16} />}
          placeholder="搜索名称 / Key"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Button>查询</Button>
        <Button onClick={() => setKeyword("")}>重置</Button>
      </div>
      <div className="data-table">
        <div className="table-head token-grid">
          <input checked={Boolean(filtered.length && selectedIds.length === filtered.length)} onChange={toggleAll} type="checkbox" />
          <span>名称</span>
          <span>状态</span>
          <span>API Key</span>
          <span>模型范围</span>
          <span>限制</span>
          <span>创建时间</span>
          <span>最后使用时间</span>
          <span>过期时间</span>
          <span>操作</span>
        </div>
        {filtered.length ? (
          filtered.map((item) => (
            <div className="table-row token-grid" key={item.id}>
              <input checked={selectedIds.includes(item.id)} onChange={() => toggleId(item.id)} type="checkbox" />
              <strong>{item.name}</strong>
              <Tag color={item.status === "active" ? "green" : "default"}>{item.status === "active" ? "启用" : "已停用"}</Tag>
              <code>{item.masked_key}</code>
              <span>{item.model_whitelist.length ? `${item.model_whitelist.length} 个模型` : "全部可调用模型"}</span>
              <span>{limitText(item)}</span>
              <span>{dateText(item.created_at)}</span>
              <span>{dateText(item.last_used_at)}</span>
              <span>{dateText(item.expires_at)}</span>
              <div className="table-actions">
                <Button size="small" onClick={() => setDetail(item)}>详情</Button>
                <Button
                  danger
                  disabled={item.status !== "active"}
                  loading={submitting}
                  size="small"
                  onClick={() => revokeApiKey(item.id)}
                >
                  停用
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-table">
            <KeyRound size={48} />
            <strong>还没有 API Key</strong>
            <span>创建一个 API Key 后，即可使用 OpenAI 兼容接口调用模型。</span>
            <Button icon={<Plus size={16} />} type="primary" onClick={openCreate}>新建 API Key</Button>
          </div>
        )}
      </div>
      <Drawer title="API Key 详情" open={Boolean(detail)} onClose={() => setDetail(null)} width={520}>
        {detail ? (
          <div className="detail-stack">
            <DetailItem label="名称" value={detail.name} />
            <DetailItem label="状态" value={detail.status === "active" ? "启用" : "已停用"} />
            <DetailItem label="密钥标识" value={detail.masked_key} />
            <DetailItem label="Key ID" value={detail.id} copyText={copyText} />
            <DetailItem label="模型白名单" value={detail.model_whitelist.length ? detail.model_whitelist.join(", ") : "全部可调用模型"} />
            <DetailItem label="IP 白名单" value={detail.ip_whitelist.length ? detail.ip_whitelist.join(", ") : "未限制"} />
            <DetailItem label="限流" value={limitText(detail)} />
            <DetailItem label="创建时间" value={dateText(detail.created_at)} />
            <DetailItem label="最后使用" value={dateText(detail.last_used_at)} />
            <DetailItem label="过期时间" value={dateText(detail.expires_at)} />
            <Alert
              message="停用 API Key"
              description="停用后，该 Key 将无法继续调用模型。历史账单和调用记录仍会保留。"
              type="warning"
              showIcon
            />
          </div>
        ) : null}
      </Drawer>
    </section>
  );
}

function AppDownloadMini({ appDownload }: { appDownload: SiteConfigPayload["app_download"] }) {
  const { iosUrl, androidUrl } = appDownloadTargets(appDownload);
  if (!iosUrl && !androidUrl) return null;
  return (
    <div className="app-download-mini">
      <div>
        <strong>{appDownload.title}</strong>
        <span>{appDownload.subtitle}</span>
      </div>
      <div className="app-download-mini-actions">
        {appDownload.ios.enabled && iosUrl ? (
          <a href={iosUrl} target="_blank" rel="noreferrer">
            <Phone size={14} />
            iOS {appDownload.ios.version ?? ""}
          </a>
        ) : null}
        {appDownload.android.enabled && androidUrl ? (
          <a href={androidUrl} target="_blank" rel="noreferrer">
            <Smartphone size={14} />
            Android {appDownload.android.version ?? ""}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function ModelMarket({ copyText, models, siteConfig }: { copyText: (text: string) => void; models: ModelInfo[]; siteConfig: SiteConfigPayload | null }) {
  const [company, setCompany] = useState("全部公司");
  const [category, setCategory] = useState("全部模型");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const companies = useMemo(() => {
    const visibleCompanies = ["Claude", "OpenAI", "Gemini"] as const;
    return [
      ["全部公司", models.length] as const,
      ...visibleCompanies.map((name) => [name, models.filter((model) => modelCompany(model) === name).length] as const)
    ];
  }, [models]);
  const categories = useMemo(() => {
    return [
      ["全部模型", models.length] as const,
      ["文本模型", models.filter((model) => simplifiedModelCategory(model) === "文本模型").length] as const,
      ["图片模型", models.filter((model) => simplifiedModelCategory(model) === "图片模型").length] as const,
      ["视频模型", models.filter((model) => simplifiedModelCategory(model) === "视频模型").length] as const
    ];
  }, [models]);
  const filtered = models.filter((model) => {
    const companyName = modelCompany(model);
    const companyOk = company === "全部公司" || companyName === company;
    const categoryName = simplifiedModelCategory(model);
    const categoryOk = category === "全部模型" || categoryName === category;
    const keywordOk =
      !keyword ||
      model.model_code.toLowerCase().includes(keyword.toLowerCase()) ||
      modelPublicName(model).toLowerCase().includes(keyword.toLowerCase()) ||
      companyName.toLowerCase().includes(keyword.toLowerCase()) ||
      modelCategoryLabel(model).toLowerCase().includes(keyword.toLowerCase()) ||
      categoryName.toLowerCase().includes(keyword.toLowerCase());
    return companyOk && categoryOk && keywordOk;
  });
  const toggleFavorite = (modelCode: string) => {
    setFavorites((items) => (items.includes(modelCode) ? items.filter((item) => item !== modelCode) : [...items, modelCode]));
  };
  const copyExample = (modelCode: string) => {
    copyText(`curl ${configuredApiBase(siteConfig)}/chat/completions \\
  -H "Authorization: Bearer $AI_TOKEN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${modelCode}","messages":[{"role":"user","content":"你好"}]}'`);
  };
  return (
    <div className="market-layout">
      <aside className="filter-panel">
        <div className="filter-title">
          <strong>筛选</strong>
          <Button size="small" onClick={() => { setCompany("全部公司"); setCategory("全部模型"); setKeyword(""); }}>重置</Button>
        </div>
        <FilterGroup title="模型公司" items={companies} active={company} setActive={setCompany} />
        <FilterGroup title="模型类型" items={categories} active={category} setActive={setCategory} />
      </aside>
      <section className="market-main">
        <div className="market-hero">
          <div>
            <span className="market-kicker">Model Catalog</span>
            <h2>模型目录</h2>
            <p>{siteConfig?.site_config.copy?.model_catalog_intro ?? "按模型类型和模型公司浏览后台同步的真实供应商模型，价格、权限和上下文以后台配置为准。"}</p>
            <div className="market-hero-stats">
              <span>筛选结果 {filtered.length} 个</span>
              <span>全部 {models.length} 个模型</span>
              <span>{companies.length - 1} 个模型公司</span>
              <span>按官方价格同步</span>
            </div>
          </div>
          <span className="hero-orbit">AI</span>
        </div>
        <div className="market-toolbar">
          <Input allowClear prefix={<Search size={16} />} placeholder="模糊搜索模型名称" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Button icon={<Copy size={16} />} onClick={() => copyText(filtered.map((model) => model.model_code).join("\n"))}>
            复制可调用模型名
          </Button>
        </div>
        <div className="model-card-grid">
          {filtered.length ? (
            filtered.map((model) => (
              <article className="model-card" key={model.id}>
                <div className="model-icon">{model.display_name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <div className="model-card-head">
                    <div>
                      <h3>{modelPublicName(model)}</h3>
                      <code>{model.model_code}</code>
                      <span className="model-company-label">{modelCompany(model)}</span>
                    </div>
                    <div>
                      <Button aria-label="复制可调用模型名" size="small" icon={<Copy size={14} />} onClick={() => copyText(model.model_code)} />
                    </div>
                  </div>
                  <dl className="model-price-grid">
                    <div>
                      <dt>输入</dt>
                      <dd>{modelPriceText(model.price?.input_per_1m, model.price?.input_per_1k)}</dd>
                    </div>
                    <div>
                      <dt>补全</dt>
                      <dd>{modelPriceText(model.price?.output_per_1m, model.price?.output_per_1k)}</dd>
                    </div>
                    <div>
                      <dt>上下文</dt>
                      <dd>{numberText(model.max_context_tokens)}</dd>
                    </div>
                  </dl>
                  <div className="tag-row">
                    <Tag color="purple">按量计费</Tag>
                    <Tag color="blue">{simplifiedModelCategory(model)}</Tag>
                    {model.capabilities.stream ? <Tag>流式</Tag> : null}
                    {model.capabilities.json_mode ? <Tag>JSON</Tag> : null}
                    <Tag color={model.price ? "green" : "default"}>{model.price ? "当前账户可调用" : "待配置价格"}</Tag>
                  </div>
                  <div className="model-card-actions">
                    <Button size="small" icon={<Copy size={14} />} onClick={() => copyText(model.model_code)}>
                      复制可调用模型名
                    </Button>
                    <Button size="small" icon={<Code2 size={14} />} onClick={() => copyExample(model.model_code)}>
                      查看接入示例
                    </Button>
                    <Button size="small" type={favorites.includes(model.model_code) ? "primary" : "default"} onClick={() => toggleFavorite(model.model_code)}>
                      {favorites.includes(model.model_code) ? "已常用" : "加入常用"}
                    </Button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <Empty description="暂无模型" />
          )}
        </div>
      </section>
    </div>
  );
}

function WalletManager(props: {
  appDownload: SiteConfigPayload["app_download"] | null;
  availableMethods: PaymentMethod[];
  createOrder: () => void;
  ledger: WalletLedgerItem[];
  mockPay: () => void;
  order: PaymentOrder | null;
  products: BootstrapPayload["products"];
  selectedMethod: string;
  selectedProduct: BootstrapPayload["products"][number] | null;
  selectedProductId: string;
  tenantBillingMode: string;
  tenantPlanCode: string | null;
  setOrder: (order: PaymentOrder | null) => void;
  setSelectedMethod: (method: string) => void;
  setSelectedProductId: (id: string) => void;
  syncPaymentOrder: () => void;
  submitting: boolean;
  wallet: Wallet | null;
}) {
  const selectedMethodMeta = props.availableMethods.find(
    (method) => method.payment_method === props.selectedMethod
  );
  const visibleMethods = props.availableMethods.filter((method) => method.payment_method !== "card_checkout");
  const methodUnavailable = !selectedMethodMeta || selectedMethodMeta.payment_method === "card_checkout";
  const billingCopy = tenantBillingModeCopy(props.tenantBillingMode);
  return (
    <>
      <div className="page-heading compact-heading">
        <div>
          <h1>钱包</h1>
          <p>{billingCopy.description}</p>
        </div>
        <Button>账单</Button>
      </div>
      <Alert
        className="payment-note"
        message={`当前结算策略：${billingCopy.title}${props.tenantPlanCode ? ` · ${props.tenantPlanCode}` : ""}`}
        description="客户付款先进入同一个钱包，租户收入、SaaS 套餐、分成或后付账单由服务端基于同一笔支付订单和用量记录汇总。"
        type="info"
        showIcon
      />
      <section className="wallet-hero-panel" aria-label="钱包余额概览">
        <div>
          <span>Available Balance</span>
          <strong>{money(props.wallet?.available_balance ?? 0)}</strong>
          <p>Web、App 和 API 共用同一账户钱包。充值后可用于模型对话和 API 调用。</p>
        </div>
        <div className="wallet-hero-breakdown">
          <div>
            <span>现金余额</span>
            <strong>{money(props.wallet?.cash_balance ?? 0)}</strong>
          </div>
          <div>
            <span>赠送额度</span>
            <strong>{money(props.wallet?.bonus_balance ?? 0)}</strong>
          </div>
          <div>
            <span>冻结金额</span>
            <strong>{money(props.wallet?.frozen_balance ?? 0)}</strong>
          </div>
        </div>
      </section>
      <div className="wallet-stats">
        <MetricBlock value={money(props.wallet?.available_balance ?? 0)} label="可用余额" />
        <MetricBlock value={money(props.wallet?.cash_balance ?? 0)} label="现金余额" />
        <MetricBlock value={money(props.wallet?.bonus_balance ?? 0)} label="赠送额度" />
        <MetricBlock value={money(props.wallet?.frozen_balance ?? 0)} label="冻结金额" />
      </div>
      <section className="panel wallet-panel">
        <PanelTitle icon={<CreditCard size={17} />} title="在线充值" />
        <Alert
          className="payment-note"
          message="到账以服务端确认为准"
          description="支付成功和权益到账以服务端回调验签、主动查单和钱包流水为准，前端不会自报支付成功。"
          type="info"
          showIcon
        />
        <div className="product-grid">
          {props.products.map((product) => (
            <button
              className={`product-option ${props.selectedProductId === product.id ? "active" : ""}`}
              key={product.id}
              onClick={() => {
                props.setSelectedProductId(product.id);
                props.setOrder(null);
              }}
              type="button"
            >
              <div className="product-head">
                <strong>{product.display_name}</strong>
                {product.badge ? <Tag color="blue">{product.badge}</Tag> : null}
              </div>
              <div className="price">{money(product.sale_amount)}</div>
              <p>{product.display_description}</p>
              <span>到账 {money(product.face_value_amount)}，赠送 {money(product.bonus_amount)}</span>
              {product.features.length ? (
                <div className="product-features">
                  {product.features.slice(0, 3).map((feature) => (
                    <em key={feature}>{feature}</em>
                  ))}
                </div>
              ) : null}
            </button>
          ))}
        </div>
        <div className="method-row">
          {visibleMethods.map((method) => (
            <button
              className={props.selectedMethod === method.payment_method ? "active" : ""}
              key={method.payment_method}
              onClick={() => props.setSelectedMethod(method.payment_method)}
              type="button"
            >
              {paymentIcon(method.payment_method)}
              {paymentName(method)}
            </button>
          ))}
        </div>
        <Button
          disabled={!props.selectedProduct || methodUnavailable}
          type="primary"
          loading={props.submitting && !props.order}
          onClick={props.createOrder}
        >
          提交订单 {props.selectedProduct ? money(props.selectedProduct.sale_amount) : ""}
        </Button>
        {props.order ? (
          <Alert
            className="order-alert"
            message={`订单 ${props.order.order_no}`}
            description={
              props.order.status === "FULFILLED"
                ? "额度已入账，钱包流水已生成。"
                : paymentActionText(props.order)
            }
            type={props.order.status === "FULFILLED" ? "success" : "info"}
            action={
              props.order.status !== "FULFILLED" ? (
                <div className="payment-actions">
                  <Button size="small" onClick={props.syncPaymentOrder}>
                    我已支付，查单
                  </Button>
                  {import.meta.env.DEV && props.order.payment_action?.provider === "mock" ? (
                    <Button size="small" type="primary" onClick={props.mockPay}>
                      模拟支付完成
                    </Button>
                  ) : null}
                </div>
              ) : null
            }
            showIcon
          />
        ) : null}
        {props.order?.status === "FULFILLED" && props.appDownload && shouldShowAppDownload(props.appDownload, "payment_success") ? (
          <AppDownloadMini appDownload={props.appDownload} />
        ) : null}
        {props.order?.payment_action?.type === "qr_code" && props.order.payment_action.qr_content ? (
          <div className="qr-cashier">
            <AntQRCode value={props.order.payment_action.qr_content} size={184} />
            <div>
              <strong>{selectedMethodMeta ? paymentName(selectedMethodMeta) : "扫码支付"}</strong>
              <p className="muted">请使用对应 App 扫码完成支付。支付成功后本页会自动确认订单状态。</p>
              {props.order.payment_action.expires_at ? (
                <span>二维码有效期至 {dateText(props.order.payment_action.expires_at)}</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
      <section className="panel invite-panel">
        <PanelTitle icon={<WalletCards size={17} />} title="钱包流水" />
        <div className="ledger-list">
          {props.ledger.length ? (
            props.ledger.map((item) => (
              <div key={item.id}>
                <span className={item.direction}>{item.direction === "credit" ? "入账" : "扣减"}</span>
                <strong>{ledgerEventName(item.event_type)}</strong>
                <em>{item.direction === "credit" ? "+" : "-"}{money(item.amount)}</em>
                <small>{dateText(item.created_at)}</small>
              </div>
            ))
          ) : (
            <Empty description="暂无钱包流水" />
          )}
        </div>
      </section>
      <section className="panel invite-panel">
        <PanelTitle icon={<Globe2 size={17} />} title="兑换码充值" />
        <div className="redeem-row">
          <Input placeholder="请输入兑换码" />
          <Button type="primary">兑换额度</Button>
        </div>
      </section>
    </>
  );
}

function UsageLogs({ logs, summary }: { logs: UsageLogItem[]; summary: UsageSummary | null }) {
  const [compact, setCompact] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [range, setRange] = useState<"all" | "today" | "week">("all");
  const [status, setStatus] = useState("all");
  const [detail, setDetail] = useState<UsageLogItem | null>(null);
  const filtered = logs.filter((log) => {
    const createdAt = new Date(log.created_at).getTime();
    const now = Date.now();
    const rangeOk =
      range === "all" ||
      (range === "today" && new Date(log.created_at).toDateString() === new Date().toDateString()) ||
      (range === "week" && now - createdAt <= 7 * 24 * 60 * 60 * 1000);
    const statusOk = status === "all" || log.status === status;
    const text = `${log.request_id} ${log.model_code} ${log.source}`.toLowerCase();
    return rangeOk && statusOk && (!keyword || text.includes(keyword.toLowerCase()));
  });
  const successCount = logs.filter((item) => item.status === "success").length;
  const successRate = logs.length ? `${Math.round((successCount / logs.length) * 1000) / 10}%` : "100%";
  return (
    <section className="panel page-panel">
      <div className="table-title">
        <PanelTitle icon={<ClipboardList size={17} />} title="使用日志" />
        <Button size="small" onClick={() => setCompact((value) => !value)}>
          {compact ? "舒适列表" : "紧凑列表"}
        </Button>
      </div>
      <div className="log-summary">
        <MetricBlock value={money(summary?.total_cost ?? 0)} label="本期扣费" />
        <MetricBlock value={numberText(summary?.total_requests ?? 0)} label="请求数" />
        <MetricBlock value={numberText(summary?.total_tokens ?? 0)} label="Token 数" />
        <MetricBlock value={`${summary?.avg_latency_ms ?? 0} ms`} label="平均耗时" />
        <MetricBlock value={successRate} label="成功率" />
      </div>
      <div className="toolbar">
        <Button size="small" type={range === "today" ? "primary" : "default"} onClick={() => setRange("today")}>今天</Button>
        <Button size="small" type={range === "week" ? "primary" : "default"} onClick={() => setRange("week")}>近 7 天</Button>
        <Button size="small" type={range === "all" ? "primary" : "default"} onClick={() => setRange("all")}>全部</Button>
        <Select
          className="toolbar-select"
          value={status}
          onChange={setStatus}
          options={[
            { label: "全部状态", value: "all" },
            { label: "成功", value: "success" },
            { label: "失败", value: "failed" }
          ]}
        />
        <Input
          className="toolbar-input"
          placeholder="API Key / 模型 / Request ID"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Button>查询</Button>
        <Button onClick={() => { setKeyword(""); setStatus("all"); setRange("all"); }}>重置</Button>
      </div>
      <div className={`data-table ${compact ? "compact-table" : ""}`}>
        <div className="table-head log-grid">
          <span>时间</span>
          <span>API Key</span>
          <span>模型</span>
          <span>类型</span>
          <span>输入/输出</span>
          <span>耗时</span>
          <span>扣费</span>
          <span>状态</span>
          <span>Request ID</span>
          <span>详情</span>
        </div>
        {filtered.length ? (
          filtered.map((log) => (
            <div className="table-row log-grid" key={log.id}>
              <span>{dateText(log.created_at)}</span>
              <code>{log.request_id.slice(0, 14)}...</code>
              <span>{log.model_code}</span>
              <Tag color={log.source === "app_chat" ? "blue" : "purple"}>
                {log.source === "app_chat" ? "聊天" : "API"}
              </Tag>
              <span>{numberText(log.prompt_tokens)} / {numberText(log.completion_tokens)}</span>
              <span>{log.latency_ms ?? 0} ms</span>
              <span>{money(log.cost_amount)}</span>
              <Tag color={log.status === "success" ? "green" : "red"}>{log.status === "success" ? "成功" : "失败"}</Tag>
              <code>{log.request_id}</code>
              <Button size="small" onClick={() => setDetail(log)}>详情</Button>
            </div>
          ))
        ) : (
          <div className="empty-table">
            <ClipboardList size={48} />
            <span>暂无使用日志</span>
          </div>
        )}
      </div>
      <Drawer title="请求详情" open={Boolean(detail)} onClose={() => setDetail(null)} width={520}>
        {detail ? (
          <div className="detail-stack">
            <DetailItem label="Request ID" value={detail.request_id} />
            <DetailItem label="模型" value={detail.model_code} />
            <DetailItem label="调用类型" value={detail.source === "app_chat" ? "聊天" : "API"} />
            <DetailItem label="状态" value={detail.status === "success" ? "成功" : "失败"} />
            <DetailItem label="输入 Tokens" value={numberText(detail.prompt_tokens)} />
            <DetailItem label="输出 Tokens" value={numberText(detail.completion_tokens)} />
            <DetailItem label="总 Tokens" value={numberText(detail.total_tokens)} />
            <DetailItem label="扣费" value={money(detail.cost_amount)} />
            <DetailItem label="耗时" value={`${detail.latency_ms ?? 0} ms`} />
            <DetailItem label="错误码" value={detail.error_code ?? "-"} />
            <DetailItem label="来源 IP" value="已脱敏" />
            <DetailItem label="创建时间" value={dateText(detail.created_at)} />
          </div>
        ) : null}
      </Drawer>
    </section>
  );
}

function DocsPage({ copyText, models, siteConfig }: { copyText: (text: string) => void; models: ModelInfo[]; siteConfig: SiteConfigPayload | null }) {
  const [activeDoc, setActiveDoc] = useState("quickstart");
  const modelCode = models[0]?.model_code ?? "gpt-4o-mini";
  const apiBase = configuredApiBase(siteConfig);
  const navItems = [
    ["quickstart", "快速开始"],
    ["auth", "认证方式"],
    ["models", "模型选择"],
    ["errors", "错误处理"],
    ["billing", "计费说明"]
  ] as const;
  const examples = [
    {
      title: "cURL",
      code: `curl ${apiBase}/chat/completions \\
  -H "Authorization: Bearer $AI_TOKEN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelCode}",
    "messages": [{"role":"user","content":"你好"}]
  }'`
    },
    {
      title: "Node.js",
      code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AI_TOKEN_API_KEY,
  baseURL: "${apiBase}"
});

const result = await client.chat.completions.create({
  model: "${modelCode}",
  messages: [{ role: "user", content: "你好" }]
});`
    },
    {
      title: "Python",
      code: `from openai import OpenAI

client = OpenAI(
    api_key="AI_TOKEN_API_KEY",
    base_url="${apiBase}"
)

resp = client.chat.completions.create(
    model="${modelCode}",
    messages=[{"role": "user", "content": "你好"}]
)`
    }
  ];
  return (
    <section className="docs-page">
      <div className="docs-hero">
        <div>
          <Tag color="blue">开发文档</Tag>
          <h1>Token API 接入文档</h1>
          <p>兼容 OpenAI Chat Completions 格式。创建 API Key 后，把 SDK 的 Base URL 指向当前服务即可开始调用。</p>
        </div>
        <div className="docs-hero-meta" aria-label="接入摘要">
          <span>OpenAI Compatible</span>
          <strong>{apiBase}</strong>
        </div>
      </div>
      <div className="docs-layout">
        <aside className="docs-nav">
          {navItems.map(([key, label]) => (
            <button
              className={activeDoc === key ? "active" : ""}
              key={key}
              onClick={() => setActiveDoc(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </aside>
        <div className="docs-content">
          {activeDoc === "quickstart" ? (
            <>
              <section className="panel docs-block">
                <PanelTitle icon={<Server size={17} />} title="基础信息" />
                <div className="docs-tip">
                  <strong>接入提示</strong>
                  <span>服务端只需要替换 Base URL，并在请求头中携带当前客户 API Key。</span>
                </div>
                <div className="docs-kv">
                  <span>Base URL</span>
                  <strong>{apiBase}</strong>
                  <Button size="small" icon={<Copy size={14} />} onClick={() => copyText(apiBase)}>复制</Button>
                </div>
                <div className="docs-kv">
                  <span>认证头</span>
                  <strong>Authorization: Bearer $AI_TOKEN_API_KEY</strong>
                  <Button size="small" icon={<Copy size={14} />} onClick={() => copyText("Authorization: Bearer $AI_TOKEN_API_KEY")}>复制</Button>
                </div>
              </section>
              <section className="panel docs-block">
                <PanelTitle icon={<Code2 size={17} />} title="调用示例" />
                <div className="example-grid">
                  {examples.map((example) => (
                    <article className="code-example" key={example.title}>
                      <div>
                        <strong>{example.title}</strong>
                        <Button size="small" icon={<Copy size={14} />} onClick={() => copyText(example.code)}>复制</Button>
                      </div>
                      <pre>{example.code}</pre>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : null}
          {activeDoc === "auth" ? (
            <section className="panel docs-block">
              <PanelTitle icon={<KeyRound size={17} />} title="认证方式" />
              <div className="notice-list">
                <p>在控制台创建 API Key，完整密钥只显示一次。</p>
                <p>服务端调用时使用 HTTP Header：Authorization: Bearer $AI_TOKEN_API_KEY。</p>
                <p>一个 API Key 默认可调用当前租户全部已授权模型，不同模型按各自价格消耗钱包余额。</p>
              </div>
            </section>
          ) : null}
          {activeDoc === "models" ? (
            <section className="panel docs-block">
              <PanelTitle icon={<Boxes size={17} />} title="模型选择" />
              <div className="docs-model-table">
                {models.slice(0, 12).map((model) => (
                  <div key={model.id}>
                    <strong>{modelPublicName(model)}</strong>
                    <code>{model.model_code}</code>
                    <span>{modelPriceText(model.price?.input_per_1m, model.price?.input_per_1k)} 输入</span>
                    <Button size="small" onClick={() => copyText(model.model_code)}>复制可调用模型名</Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {activeDoc === "errors" ? (
            <section className="panel docs-block">
              <PanelTitle icon={<Shield size={17} />} title="错误处理" />
              <div className="notice-list">
                <p>401：API Key 缺失、错误或已停用。</p>
                <p>402：钱包余额不足，需要先充值或联系租户管理员调整额度。</p>
                <p>429：触发 RPM/TPM 限制，应指数退避重试。</p>
                <p>5xx：上游供应商或路由异常，可稍后重试或切换模型。</p>
              </div>
            </section>
          ) : null}
          {activeDoc === "billing" ? (
            <section className="panel docs-block">
              <PanelTitle icon={<WalletCards size={17} />} title="计费说明" />
              <div className="notice-list">
                <p>价格和可用模型来自租户后台发布的模型授权与价格配置。</p>
                <p>充值套餐来自租户后台的支付商品和平台可见性配置。</p>
                <p>Web 端可按后台启用的支付渠道展示支付宝、微信、银行卡托管收银台和对公转账；到账以服务端确认和钱包流水为准。</p>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SettingsPage({
  changePassword,
  siteConfig,
  submitting,
  updateProfile,
  user
}: {
  changePassword: (values: { current_password: string; new_password: string }) => void;
  siteConfig: SiteConfigPayload | null;
  submitting: boolean;
  updateProfile: (values: { email: string; phone?: string }) => void;
  user: SessionPayload["user"] | null;
}) {
  const modules = siteModules(siteConfig);
  const support = siteConfig?.site_config.support;
  const legal = siteConfig?.site_config.legal;
  return (
    <section className="panel page-panel settings-panel">
      <PanelTitle icon={<Settings size={17} />} title="个人设置" />
      <div className="settings-overview">
        <div>
          <span className="page-kicker">Account</span>
          <h2>账号资料、安全设置与协议</h2>
          <p>用于登录、找回密码和接收重要通知。建议定期更新密码，不要与其他网站复用同一密码。</p>
        </div>
        <div className="settings-status-list">
          <Tag color={user?.email ? "green" : "default"}>邮箱{user?.email ? "已绑定" : "未绑定"}</Tag>
          <Tag color={user?.phone ? "green" : "orange"}>手机{user?.phone ? "已绑定" : "未绑定"}</Tag>
        </div>
      </div>
      <div className="settings-forms">
        <section>
          <h3>
            <Mail size={17} />
            账号资料
          </h3>
          <Form
            key={`${user?.email ?? ""}-${user?.phone ?? ""}`}
            initialValues={{ email: user?.email, phone: user?.phone ?? "" }}
            layout="vertical"
            onFinish={updateProfile}
          >
            <Form.Item
              label="认证邮箱"
              name="email"
              rules={[
                { required: true, message: "请输入认证邮箱" },
                { type: "email", message: "请输入邮箱格式" }
              ]}
            >
              <Input prefix={<Mail size={15} />} placeholder="email@example.com" />
            </Form.Item>
            <Form.Item label="认证手机号" name="phone">
              <Input prefix={<Phone size={15} />} placeholder="用于后续短信验证和账单通知" />
            </Form.Item>
            <Button htmlType="submit" loading={submitting} type="primary">
              保存认证信息
            </Button>
          </Form>
        </section>

        <section>
          <h3>
            <LockKeyhole size={17} />
            安全设置
          </h3>
          <Alert
            className="settings-security-note"
            message="建议定期更新密码"
            description="不要与其他网站复用同一密码，避免把登录密码发送给客服或他人。"
            type="info"
            showIcon
          />
          <Form layout="vertical" onFinish={changePassword}>
            <Form.Item
              label="当前密码"
              name="current_password"
              rules={[{ required: true, message: "请输入当前密码" }]}
            >
              <Input.Password placeholder="当前登录密码" />
            </Form.Item>
            <Form.Item
              label="新密码"
              name="new_password"
              rules={[{ required: true, min: 8, message: "请输入至少 8 位新密码" }]}
            >
              <Input.Password placeholder="至少 8 位" />
            </Form.Item>
            <Button htmlType="submit" loading={submitting}>
              修改密码
            </Button>
          </Form>
        </section>
      </div>
      <section className="panel wallet-panel">
        <PanelTitle icon={<Shield size={17} />} title="协议与支持" />
        <div className="settings-link-grid">
          {legal?.terms_url ? <a href={legal.terms_url} target="_blank" rel="noreferrer">用户协议</a> : <span>用户协议由后台配置中心维护</span>}
          {legal?.privacy_url ? <a href={legal.privacy_url} target="_blank" rel="noreferrer">隐私政策</a> : <span>隐私政策由后台配置中心维护</span>}
          {legal?.ai_disclaimer_url ? <a href={legal.ai_disclaimer_url} target="_blank" rel="noreferrer">AI 内容声明</a> : <span>{siteConfig?.site_config.copy?.ai_disclaimer ?? "AI 生成内容仅供参考，请遵守当地法律法规。"}</span>}
          {support?.email ? <span>客服邮箱：{support.email}</span> : null}
          {support?.help_center_url ? <a href={support.help_center_url} target="_blank" rel="noreferrer">帮助中心</a> : null}
        </div>
      </section>
      <section className="panel danger-zone">
        <PanelTitle icon={<Shield size={17} />} title="危险操作" />
        <div>
          <p>账号注销后，API Key 将停用，未完成订单会继续处理，历史账单和必要记录将按合规要求保留。</p>
          <Button
            danger
            disabled={!modules.account_deletion}
            onClick={async () => {
              if (!window.confirm("确认提交账号注销申请？")) return;
              await apiFetch("/api/account/delete-request", {
                method: "POST",
                body: JSON.stringify({ reason: "web_user_request" })
              });
              window.alert("注销申请已提交");
            }}
          >
            申请账号注销
          </Button>
          {modules.content_report ? <Button>内容举报</Button> : null}
        </div>
      </section>
    </section>
  );
}

function ReferralPanel({
  commissions,
  copyText,
  requestWithdrawal,
  submitting,
  summary
}: {
  commissions: CommissionRecord[];
  copyText: (text: string) => void;
  requestWithdrawal: (values: { amount: number; payout_method?: string; payout_account?: string }) => void;
  submitting: boolean;
  summary: ReferralSummary | null;
}) {
  const inviteLink = summary?.invite_code
    ? `${window.location.origin}${window.location.pathname}?invite_code=${encodeURIComponent(summary.invite_code)}`
    : "";
  return (
    <section className="panel page-panel">
      <PanelTitle icon={<CircleDollarSign size={17} />} title="邀请返佣" />
      <div className="referral-hero">
        <div>
          <span className="page-kicker">Referral</span>
          <h2>邀请客户注册并完成充值后，可按后台配置比例获得返佣。</h2>
          <p>佣金结算、冻结期和提现处理以后台审核结果为准。</p>
        </div>
        <Button disabled={!inviteLink} type="primary" icon={<Copy size={16} />} onClick={() => inviteLink && copyText(inviteLink)}>
          复制邀请链接
        </Button>
      </div>
      <div className="wallet-stats">
        <MetricBlock value={summary?.invite_code ?? "-"} label="邀请码" />
        <MetricBlock value={String(summary?.invited_customers ?? 0)} label="已邀请客户" />
        <MetricBlock value={money(summary?.available_commission ?? 0)} label="可提现佣金" />
        <MetricBlock value={money(summary?.pending_commission ?? 0)} label="待结算佣金" />
      </div>
      <div className="settings-forms">
        <section>
          <h3>
            <Copy size={17} />
            邀请方式
          </h3>
          <p className="muted">客户注册时填写邀请码后，会形成邀请关系。佣金到账以后台结算和审核为准。</p>
          <div className="invite-copy-box">
            <code>{inviteLink || "暂无邀请链接"}</code>
          </div>
          <Button disabled={!summary?.invite_code} onClick={() => summary?.invite_code && copyText(summary.invite_code)}>
            复制邀请码
          </Button>
        </section>
        <section>
          <h3>
            <WalletCards size={17} />
            提现申请
          </h3>
          <Form layout="vertical" onFinish={requestWithdrawal}>
            <Form.Item
              label="提现金额，单位元"
              name="amount"
              rules={[
                { required: true, message: "请输入提现金额" },
                {
                  validator: (_, value) =>
                    !value || Number(value) >= 10
                      ? Promise.resolve()
                      : Promise.reject(new Error("最低提现金额 10 元"))
                }
              ]}
            >
              <Input type="number" min={10} placeholder="例如 100" />
            </Form.Item>
            <Form.Item label="提现方式" name="payout_method">
              <Input placeholder="支付宝 / 银行卡 / 对公转账" />
            </Form.Item>
            <Form.Item label="收款账号" name="payout_account">
              <Input placeholder="仅提交给后台审核，列表只展示脱敏值" />
            </Form.Item>
            <Button htmlType="submit" loading={submitting} type="primary">
              提交提现申请
            </Button>
          </Form>
        </section>
      </div>
      <section className="panel wallet-panel">
        <PanelTitle icon={<History size={17} />} title="佣金明细" />
        {commissions.length ? (
          <div className="commission-table">
            <div className="commission-head">
              <span>时间</span>
              <span>来源客户</span>
              <span>订单金额</span>
              <span>佣金金额</span>
              <span>状态</span>
              <span>结算时间</span>
            </div>
            {commissions.map((item) => (
              <div className="commission-row" key={item.id}>
                <span>{item.created_at.replace("T", " ").slice(0, 19)}</span>
                <span>{anonymizedSource(item.source_email)}</span>
                <span>{money(item.commission_base_amount)}</span>
                <strong>{money(item.commission_amount)}</strong>
                <Tag>{item.status}</Tag>
                <span>{item.frozen_until ? dateText(item.frozen_until) : "-"}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty description="暂无佣金记录" />
        )}
      </section>
    </section>
  );
}

function CreateKeyModal({
  onCancel,
  onCreate,
  open,
  submitting
}: {
  onCancel: () => void;
  onCreate: (values: {
    name: string;
    group?: string;
    ip_whitelist?: string;
    rpm_limit?: string;
    tpm_limit?: string;
    daily_budget?: string;
    monthly_budget?: string;
    expires_at?: string;
    note?: string;
  }) => void;
  open: boolean;
  submitting: boolean;
}) {
  return (
    <Modal title="新建 API Key" open={open} onCancel={onCancel} footer={null}>
      <Form layout="vertical" onFinish={onCreate}>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入 API Key 名称" }]}>
          <Input placeholder="例如：生产环境" />
        </Form.Item>
        <Form.Item name="group" label="分组">
          <Input placeholder="例如：default / production / mobile" />
        </Form.Item>
        <Form.Item name="model_scope" label="可用模型">
          <Select
            defaultValue="all"
            options={[
              { label: "全部可调用模型", value: "all" },
              { label: "按后台模型授权控制", value: "tenant_authorized" }
            ]}
          />
        </Form.Item>
        <div className="form-two-columns">
          <Form.Item name="rpm_limit" label="RPM 上限">
            <Input type="number" min={1} placeholder="不填表示不限制" />
          </Form.Item>
          <Form.Item name="tpm_limit" label="TPM 上限">
            <Input type="number" min={1} placeholder="不填表示不限制" />
          </Form.Item>
          <Form.Item name="daily_budget" label="每日额度，元">
            <Input type="number" min={0} placeholder="例如 100" />
          </Form.Item>
          <Form.Item name="monthly_budget" label="每月额度，元">
            <Input type="number" min={0} placeholder="例如 3000" />
          </Form.Item>
        </div>
        <Form.Item name="ip_whitelist" label="IP 白名单">
          <Input.TextArea rows={2} placeholder="多个 IP 可用换行或英文逗号分隔；不填表示不限制" />
        </Form.Item>
        <Form.Item name="expires_at" label="过期时间">
          <Input placeholder="例如 2026-12-31T23:59:59+08:00；不填表示长期有效" />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={2} placeholder="用途、负责人或安全说明" />
        </Form.Item>
        <Alert
          className="key-scope-note"
          message="请妥善保存 API Key"
          description="完整密钥只会展示一次，关闭后无法再次查看。对话页和 API 调用时直接传 model 切换模型，不同模型会按后台配置的价格消耗余额。"
          type="info"
          showIcon
        />
        <Button block htmlType="submit" loading={submitting} type="primary">
          创建
        </Button>
      </Form>
    </Modal>
  );
}

function FilterGroup({
  active,
  items,
  setActive,
  title
}: {
  active: string;
  items: Array<readonly [string, number]>;
  setActive: (value: string) => void;
  title: string;
}) {
  return (
    <div className="filter-group">
      <h3>{title}</h3>
      <div>
        {items.map(([name, count]) => (
          <button className={active === name ? "active" : ""} key={name} onClick={() => setActive(name)} type="button">
            <span>{name}</span>
            <em>{count}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function PanelTitle({ extra, icon, title }: { extra?: React.ReactNode; icon: React.ReactNode; title: string }) {
  return (
    <div className="panel-title-row">
      <h3>
        {icon}
        {title}
      </h3>
      {extra}
    </div>
  );
}

function ApiEndpoint({ copyText, label, note, url }: { copyText: (text: string) => void; label: string; note: string; url: string }) {
  return (
    <div className="endpoint-card">
      <span>{label}</span>
      <div>
        <strong>{url}</strong>
        <Button size="small" onClick={() => copyText(url)}>复制</Button>
      </div>
      <p>{note}</p>
    </div>
  );
}

function ServiceStatus({ name }: { name: string }) {
  return (
    <div className="service-row">
      <div>
        <strong>{name}</strong>
        <span>可用率</span>
      </div>
      <em>100.00%</em>
      <i />
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-block">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DetailItem({
  copyText,
  label,
  value
}: {
  copyText?: (text: string) => void;
  label: string;
  value: string;
}) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
      {copyText && value ? <Button size="small" icon={<Copy size={14} />} onClick={() => copyText(value)}>复制</Button> : null}
    </div>
  );
}

function limitText(item: ApiKeyRecord) {
  const values = [
    item.limits?.rpm ? `RPM ${item.limits.rpm}` : "",
    item.limits?.tpm ? `TPM ${item.limits.tpm}` : "",
    item.limits?.daily_budget ? `日 ${money(item.limits.daily_budget)}` : "",
    item.limits?.monthly_budget ? `月 ${money(item.limits.monthly_budget)}` : ""
  ].filter(Boolean);
  return values.length ? values.join(" / ") : "未限制";
}

function paymentName(method: PaymentMethod) {
  return paymentMethodNames[method.payment_method] ?? method.display_name;
}

function paymentIcon(method: string) {
  if (method.includes("wechat")) return <QrCode size={15} />;
  if (method.includes("alipay")) return <Smartphone size={15} />;
  if (method === "enterprise_transfer") return <Building2 size={15} />;
  return <CreditCard size={15} />;
}

function paymentActionText(order: PaymentOrder) {
  if (order.payment_method === "enterprise_transfer") {
    const account = order.payment_action?.account;
    if (!account || typeof account.bank_name !== "string" || typeof account.account_no !== "string") {
      return "对公转账收款信息未开放，请联系客户支持确认付款方式。";
    }
    const bankName = account.bank_name;
    const accountNo = account.account_no;
    return `对公转账需要备注订单号，当前收款信息：${bankName} / ${accountNo}`;
  }
  if (order.payment_method === "card_checkout") {
    return "银行卡托管收银台尚未接入，当前不能真实绑卡或扣款。";
  }
  if (order.payment_action?.type === "qr_code") {
    return "请扫码支付。到账以服务端回调验签或主动查单后的钱包入账结果为准。";
  }
  return "订单已创建，正在等待服务端支付通道返回支付参数。";
}

function ledgerEventName(value: string) {
  const names: Record<string, string> = {
    "payment.fulfill": "充值到账",
    "payment.bonus": "充值赠送",
    "usage.charge": "模型调用扣费",
    "system.grant": "系统赠送"
  };
  return names[value] ?? value;
}

function tenantBillingModeCopy(mode: string) {
  const copies: Record<string, { title: string; description: string }> = {
    prepaid: {
      title: "预付钱包",
      description: "Web、App 和 API 共用同一客户钱包，客户先充值后调用模型。"
    },
    postpaid: {
      title: "后付授信",
      description: "Web、App 和 API 共用客户钱包与授信额度，租户侧按实际用量出账。"
    },
    subscription_usage: {
      title: "SaaS 套餐 + 用量",
      description: "客户充值进入同一钱包，租户侧套餐和模型用量按周期统一汇总。"
    },
    revenue_share: {
      title: "收入分成",
      description: "客户充值进入同一钱包，平台按租户分成规则自动生成结算记录。"
    }
  };
  return copies[mode] ?? copies.prepaid;
}

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY"
  }).format(value / 100);
}

function priceText(value?: number | null) {
  return value === undefined || value === null ? "-" : money(value);
}

function modelPriceText(valuePer1m?: number | null, valuePer1k?: number | null) {
  if (valuePer1m !== undefined && valuePer1m !== null) return `¥${trimDecimal(valuePer1m / 100000)} / 1K`;
  if (valuePer1k !== undefined && valuePer1k !== null) return `¥${trimDecimal(valuePer1k / 100)} / 1K`;
  return "-";
}

function trimDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function numberText(value?: number | null) {
  return value === undefined || value === null ? "-" : new Intl.NumberFormat("zh-CN").format(value);
}

function dateText(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
