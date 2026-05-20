import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  QRCode as AntQRCode,
  Spin,
  Switch,
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

const paymentMethodNames: Record<string, string> = {
  alipay_qr: "支付宝",
  alipay_web: "支付宝",
  wechat_native: "微信支付",
  card_checkout: "银行卡",
  enterprise_transfer: "对公转账",
  apple_iap: "Apple IAP",
  alipay_app: "支付宝 App",
  wechat_app: "微信 App"
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

export default function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [context] = useState(() => checkoutContextFromUrl());
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
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
        return Promise.all([loadApiKeys(), loadWalletLedger(), loadUsageLogs(), loadReferral()]);
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
      const [checkoutPayload, modelPayload] = await Promise.all([
        apiFetch<BootstrapPayload>(`/api/public/bootstrap?${toQuery(context)}`),
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

  async function createApiKey(values: { name: string }) {
    setSubmitting(true);
    try {
      const payload = await apiFetch<{ key: string; record: ApiKeyRecord }>("/api/public/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: values.name, ...context })
      });
      setCreatedKey(payload.key);
      setShowKeyModal(false);
      setApiKeys((items) => [payload.record, ...items]);
      messageApi.success("令牌已创建");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "创建令牌失败");
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
      messageApi.success("令牌已停用");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "停用令牌失败");
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
        body: JSON.stringify({ ...values, ...context, requested_from: "web" })
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
        user={user}
      >
        {contextHolder}
        <HomePage
          appReleases={bootstrap?.app_releases ?? []}
          models={models}
          setActive={setSiteSection}
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
        user={user}
      >
        {contextHolder}
        <section className="site-page market-page">
          <ModelMarket models={models} copyText={copyText} />
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
        user={user}
      >
        {contextHolder}
        <DocsPage models={models} copyText={copyText} />
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
      user={user}
    >
      {contextHolder}
      <div className={`console-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <SideNav
          active={view}
          collapsed={sidebarCollapsed}
          setActive={setView}
          toggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />
        <section className="console-main">
          {view === "dashboard" ? (
            <Dashboard
              apiKeys={apiKeys}
              models={models}
              setView={setView}
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
          {view === "models" ? <ModelMarket models={models} copyText={copyText} /> : null}
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
            复制令牌
          </Button>
        ]}
        open={Boolean(createdKey)}
        title="令牌已生成"
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
  user
}: {
  active: SiteSection;
  children: React.ReactNode;
  logout: () => void;
  setActive: (section: SiteSection) => void;
  setAuthMode: (mode: AuthMode) => void;
  user: any;
}) {
  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
    setActive("auth");
  }
  const displayName = user ? String(user.email ?? "victor").split("@")[0] : "";

  return (
    <main className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <button className="site-brand" onClick={() => setActive("home")} type="button">
            <span className="site-brand-mark">O</span>
            <span>OneToken</span>
          </button>
          <nav className="top-links" aria-label="主导航">
            <button className={active === "home" ? "active" : ""} onClick={() => setActive("home")} type="button">
              首页
            </button>
            <button
              className={active === "console" ? "active" : ""}
              onClick={() => setActive(user ? "console" : "auth")}
              type="button"
            >
              控制台
            </button>
            <button className={active === "models" ? "active" : ""} onClick={() => setActive("models")} type="button">
              模型广场
            </button>
            <button className={active === "docs" ? "active" : ""} onClick={() => setActive("docs")} type="button">
              文档
            </button>
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
  user
}: {
  appReleases: AppRelease[];
  models: ModelInfo[];
  setActive: (section: SiteSection) => void;
  user: SessionPayload["user"] | null;
}) {
  const iosRelease = appReleases.find((release) => release.platform === "ios");
  const androidRelease = appReleases.find((release) => release.platform === "android");
  const iosDownloadUrl = iosRelease?.download_url || iosAppDownloadUrl;
  const androidDownloadUrl = androidRelease?.download_url || androidAppDownloadUrl;

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
          <span className="landing-eyebrow">Enterprise AI Gateway</span>
          <h1>
            <span>一站式企业级大</span>
            <span>模型服务平台</span>
          </h1>
          <p>
            <span>通过一个高速、稳定、统一的接口，轻松调用所有主流大模型。</span>
            <span>不限时间、按量计费、明细透明，在线充值后即可使用所有模型。</span>
          </p>
          <div className="landing-actions">
            <Button className="landing-doc-button" size="large" onClick={() => setActive("docs")}>
              文档中心
            </Button>
            <Button
              className="landing-primary-button"
              size="large"
              type="primary"
              onClick={() => setActive(user ? "console" : "auth")}
            >
              立即体验
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>

        <section className="capability-row" aria-label="平台核心能力">
          <article className="capability-card coverage-card">
            <div className="capability-heading">
              <span className="capability-icon"><DatabaseZap size={18} /></span>
              <h3>主流模型全覆盖</h3>
            </div>
            <p>统一维护 OpenAI、Claude、Gemini、DeepSeek、Qwen 等模型目录。客户侧只需要接入一套协议。</p>
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
              <span className="capability-icon"><Code2 size={18} /></span>
              <h3>统一接口，模型轻松切换</h3>
            </div>
            <div className="code-window">
              <div className="code-window-bar">
                <span />
                <span />
                <span />
              </div>
              <pre>{`from openai import OpenAI
client = OpenAI(
  base_url="https://onetoken.one",
  api_key="sk-***"
)

response = client.chat.completions.create(
  model="${models[0]?.model_code ?? "gpt-4o"}",
  # Gemini 3 Pro / DeepSeek V3 / Claude
)`}</pre>
            </div>
          </article>

          <article className="capability-card route-card">
            <div className="capability-heading">
              <span className="capability-icon"><Gauge size={18} /></span>
              <h3>无限并发，永远在线</h3>
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

        <section className="app-configs" aria-labelledby="integration-title">
          <div className="app-config-copy">
            <span>Integrations</span>
            <h2 id="integration-title">常见应用配置</h2>
            <p>Cursor、Claude Code、Qwen Code、OpenAI Codex 等客户端可复用同一组 Base URL 和 API Key。</p>
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
        </section>

        <section className="mobile-downloads" aria-labelledby="mobile-download-title">
          <div className="mobile-download-copy">
            <span>Mobile App</span>
            <h2 id="mobile-download-title">移动端随时使用 OneToken</h2>
            <p>App 端优先承载 AI 对话、模型切换、钱包充值和账单查看，Web、App 与 API 共用同一个客户账号和余额。</p>
          </div>
          <div className="mobile-download-grid">
            <article className="mobile-download-card">
              <div className="mobile-download-icon">
                <Phone size={22} />
              </div>
              <div>
                <h3>iOS App</h3>
                <p>支持 iPhone 真机、TestFlight 内测和 Apple IAP 充值链路。</p>
              </div>
              {iosRelease?.version && <span className="mobile-release-meta">{iosRelease.version} · {iosRelease.distribution_channel}</span>}
              {iosDownloadUrl ? (
                <a className="mobile-download-button" href={iosDownloadUrl} target="_blank" rel="noreferrer">
                  下载 iOS
                </a>
              ) : (
                <button className="mobile-download-button" disabled type="button">
                  iOS 待配置
                </button>
              )}
            </article>
            <article className="mobile-download-card">
              <div className="mobile-download-icon">
                <Smartphone size={22} />
              </div>
              <div>
                <h3>Android App</h3>
                <p>支持官网 APK、应用市场包和安卓统一收银台支付链路。</p>
              </div>
              {androidRelease?.version && <span className="mobile-release-meta">{androidRelease.version} · {androidRelease.distribution_channel}</span>}
              {androidDownloadUrl ? (
                <a className="mobile-download-button" href={androidDownloadUrl} target="_blank" rel="noreferrer">
                  下载 Android
                </a>
              ) : (
                <button className="mobile-download-button" disabled type="button">
                  Android 待配置
                </button>
              )}
            </article>
          </div>
        </section>

        <footer className="landing-footer">
          <span>© 2026 OneToken. 版权所有</span>
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
  setActive,
  toggleCollapsed
}: {
  active: ConsoleView;
  collapsed: boolean;
  setActive: (view: ConsoleView) => void;
  toggleCollapsed: () => void;
}) {
  const items: Array<{ key: ConsoleView; icon: React.ReactNode; label: string }> = [
    { key: "dashboard", icon: <LayoutDashboard size={17} />, label: "数据看板" },
    { key: "tokens", icon: <KeyRound size={17} />, label: "令牌管理" },
    { key: "logs", icon: <History size={17} />, label: "使用日志" },
    { key: "models", icon: <Boxes size={17} />, label: "模型广场" },
    { key: "wallet", icon: <WalletCards size={17} />, label: "钱包管理" },
    { key: "referral", icon: <CircleDollarSign size={17} />, label: "代理佣金" },
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
  usageLogs,
  usageSummary,
  user,
  wallet
}: {
  apiKeys: ApiKeyRecord[];
  copyText: (text: string) => void;
  models: ModelInfo[];
  setView: (view: ConsoleView) => void;
  usageLogs: UsageLogItem[];
  usageSummary: UsageSummary | null;
  user: any;
  wallet: Wallet | null;
}) {
  const activeKeys = apiKeys.filter((item) => item.status === "active").length;
  const trend = usageSummary?.trend ?? [];
  const maxTrendRequests = Math.max(...trend.map((item) => item.requests), 1);
  return (
    <div className="dashboard-page">
      <div className="page-heading dashboard-heading">
        <div>
          <span className="page-kicker">Customer Console</span>
          <h1>早上好，{String(user.email).split("@")[0]}</h1>
          <p>集中查看钱包余额、调用趋势、模型消耗和 API 接入状态。</p>
        </div>
        <div className="page-actions">
          <Button aria-label="搜索" shape="circle" icon={<Search size={17} />} />
          <Button aria-label="刷新" shape="circle" icon={<RefreshCw size={17} />} />
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          title="账户数据"
          items={[
            { icon: <CircleDollarSign size={18} />, label: "当前余额", value: money(wallet?.available_balance ?? 0) },
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
          title="资源消耗"
          items={[
            { icon: <CircleDollarSign size={18} />, label: "统计额度", value: money(usageSummary?.total_cost ?? 0) },
            { icon: <Code2 size={18} />, label: "统计 Tokens", value: numberText(usageSummary?.total_tokens ?? 0) }
          ]}
        />
        <StatCard
          title="性能指标"
          items={[
            { icon: <Gauge size={18} />, label: "平均耗时", value: `${usageSummary?.avg_latency_ms ?? 0} ms` },
            { icon: <Server size={18} />, label: "近 1 小时 TPM", value: numberText(usageSummary?.tpm ?? 0) }
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
          <ApiEndpoint label="主线路" note="核心线路" url={tokenApiBase} copyText={copyText} />
          <ApiEndpoint label="日本优化线路" note="适合长任务" url="https://api.onetoken.one" copyText={copyText} />
          <div className="mini-summary">
            <div>
              <strong>{models.length}</strong>
              <span>模型范围</span>
            </div>
            <div>
              <strong>{activeKeys}</strong>
              <span>活跃令牌</span>
            </div>
          </div>
        </section>
      </div>

      <div className="bottom-grid">
        <section className="panel">
          <PanelTitle icon={<Bell size={17} />} title="系统公告" extra={<Tag>显示最新20条</Tag>} />
          <div className="timeline">
            {announcements.map((item) => (
              <div className="timeline-item" key={item.date}>
                <span className={`dot ${item.status}`} />
                <p>{item.text}</p>
                <small>{item.date}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<BookOpen size={17} />} title="常见问答" />
          <div className="faq-list">
            {faqs.map((item) => (
              <button key={item} type="button">
                {item}
                <Plus size={16} />
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<Gauge size={17} />} title="服务可用性" extra={<RefreshCw size={16} />} />
          <ServiceStatus name="token.local" />
          <ServiceStatus name="api.local" />
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
  return (
    <section className="panel page-panel">
      <div className="table-title">
        <PanelTitle icon={<KeyRound size={17} />} title="令牌管理" />
        <Button size="small">紧凑列表</Button>
      </div>
      <div className="toolbar">
        <Button icon={<Plus size={16} />} type="primary" onClick={openCreate}>
          添加令牌
        </Button>
        <Button icon={<Copy size={16} />} onClick={() => copyText(apiKeys.map((item) => item.masked_key).join("\n"))}>
          复制所选令牌
        </Button>
        <Button danger icon={<Trash2 size={16} />}>
          删除所选令牌
        </Button>
        <span className="toolbar-spacer" />
        <Input className="toolbar-input" prefix={<Search size={16} />} placeholder="搜索关键字" />
        <Input className="toolbar-input" prefix={<Search size={16} />} placeholder="密钥" />
        <Button>查询</Button>
        <Button>重置</Button>
      </div>
      <div className="data-table">
        <div className="table-head token-grid">
          <span />
          <span>名称</span>
          <span>状态</span>
          <span>剩余额度/总额度</span>
          <span>分组</span>
          <span>密钥</span>
          <span>可用模型</span>
          <span>IP限制</span>
          <span>创建时间</span>
          <span>最后使用时间</span>
          <span>过期时间</span>
          <span />
        </div>
        {apiKeys.length ? (
          apiKeys.map((item) => (
            <div className="table-row token-grid" key={item.id}>
              <input type="checkbox" />
              <strong>{item.name}</strong>
              <Tag color={item.status === "active" ? "green" : "default"}>{item.status === "active" ? "启用" : "已停用"}</Tag>
              <span>- / -</span>
              <span>default</span>
              <code>{item.masked_key}</code>
              <span>全部已授权模型</span>
              <span>{item.ip_whitelist.length || "-"}</span>
              <span>{dateText(item.created_at)}</span>
              <span>{dateText(item.last_used_at)}</span>
              <span>{dateText(item.expires_at)}</span>
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
          ))
        ) : (
          <div className="empty-table">
            <KeyRound size={48} />
            <span>搜索无结果</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ModelMarket({ copyText, models }: { copyText: (text: string) => void; models: ModelInfo[] }) {
  const [provider, setProvider] = useState("全部供应商");
  const [keyword, setKeyword] = useState("");
  const providers = useMemo(() => {
    const counts = new Map<string, number>();
    models.forEach((model) => counts.set(model.family ?? "未知供应商", (counts.get(model.family ?? "未知供应商") ?? 0) + 1));
    return [["全部供应商", models.length] as const, ...Array.from(counts.entries())];
  }, [models]);
  const filtered = models.filter((model) => {
    const providerOk = provider === "全部供应商" || (model.family ?? "未知供应商") === provider;
    const keywordOk = !keyword || model.model_code.toLowerCase().includes(keyword.toLowerCase()) || model.display_name.toLowerCase().includes(keyword.toLowerCase());
    return providerOk && keywordOk;
  });
  return (
    <div className="market-layout">
      <aside className="filter-panel">
        <div className="filter-title">
          <strong>筛选</strong>
          <Button size="small" onClick={() => setProvider("全部供应商")}>重置</Button>
        </div>
        <FilterGroup title="供应商" items={providers} active={provider} setActive={setProvider} />
        <FilterGroup
          title="计费类型"
          items={[
            ["全部类型", models.length],
            ["按量计费", models.length],
            ["按次计费", 0]
          ]}
          active="全部类型"
          setActive={() => undefined}
        />
        <FilterGroup
          title="端点类型"
          items={[
            ["全部端点", models.length],
            ["openai", models.length],
            ["anthropic", models.filter((model) => /claude|anthropic/i.test(model.model_code)).length]
          ]}
          active="全部端点"
          setActive={() => undefined}
        />
      </aside>
      <section className="market-main">
        <div className="market-hero">
          <div>
            <span className="market-kicker">Model Marketplace</span>
            <h2>{provider}</h2>
            <p>查看当前租户可用的 AI 模型、价格、能力和接入端点。</p>
            <div className="market-hero-stats">
              <span>{filtered.length} 个模型</span>
              <span>{providers.length - 1} 个供应商</span>
              <span>OpenAI Compatible</span>
            </div>
          </div>
          <span className="hero-orbit">AI</span>
        </div>
        <div className="market-toolbar">
          <Input prefix={<Search size={16} />} placeholder="模糊搜索模型名称" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Button icon={<Copy size={16} />} onClick={() => copyText(filtered.map((model) => model.model_code).join("\n"))}>
            复制
          </Button>
          <span>充值价格显示</span>
          <Switch size="small" />
          <span>倍率</span>
          <Switch size="small" />
          <Button>表格视图</Button>
        </div>
        <div className="model-card-grid">
          {filtered.length ? (
            filtered.map((model) => (
              <article className="model-card" key={model.id}>
                <div className="model-icon">{model.display_name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <div className="model-card-head">
                    <div>
                      <h3>{model.display_name}</h3>
                      <code>{model.model_code}</code>
                    </div>
                    <div>
                      <Button aria-label="复制模型编码" size="small" icon={<Copy size={14} />} onClick={() => copyText(model.model_code)} />
                    </div>
                  </div>
                  <dl className="model-price-grid">
                    <div>
                      <dt>输入</dt>
                      <dd>{priceText(model.price?.input_per_1k)} / 1K</dd>
                    </div>
                    <div>
                      <dt>补全</dt>
                      <dd>{priceText(model.price?.output_per_1k)} / 1K</dd>
                    </div>
                    <div>
                      <dt>上下文</dt>
                      <dd>{numberText(model.max_context_tokens)}</dd>
                    </div>
                  </dl>
                  <div className="tag-row">
                    <Tag color="purple">按量计费</Tag>
                    {model.capabilities.stream ? <Tag>流式</Tag> : null}
                    {model.capabilities.tools ? <Tag>工具</Tag> : null}
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
  const methodUnavailable = selectedMethodMeta?.payment_method === "card_checkout";
  const billingCopy = tenantBillingModeCopy(props.tenantBillingMode);
  return (
    <>
      <div className="page-heading compact-heading">
        <div>
          <h1>钱包管理</h1>
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
      <div className="wallet-stats">
        <MetricBlock value={money(props.wallet?.available_balance ?? 0)} label="当前余额" />
        <MetricBlock value={money(props.wallet?.cash_balance ?? 0)} label="现金余额" />
        <MetricBlock value={money(props.wallet?.bonus_balance ?? 0)} label="赠送额度" />
      </div>
      <section className="panel wallet-panel">
        <PanelTitle icon={<CreditCard size={17} />} title="在线充值" />
        <Alert
          className="payment-note"
          message="扫码支付以服务端确认为准"
          description="支付宝和微信会通过服务端回调或主动查单确认结果。页面只轮询订单状态，不会由前端自报支付成功。"
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
          {props.availableMethods.map((method) => (
            <button
              className={props.selectedMethod === method.payment_method ? "active" : ""}
              disabled={method.payment_method === "card_checkout"}
              key={method.payment_method}
              onClick={() => props.setSelectedMethod(method.payment_method)}
              type="button"
            >
              {paymentIcon(method.payment_method)}
              {paymentName(method)}
              {method.payment_method === "card_checkout" ? <small>待接入</small> : null}
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
  return (
    <section className="panel page-panel">
      <div className="table-title">
        <PanelTitle icon={<ClipboardList size={17} />} title="使用日志" />
        <Button size="small">紧凑列表</Button>
      </div>
      <div className="log-summary">
        <MetricBlock value={money(summary?.total_cost ?? 0)} label="消耗额度" />
        <MetricBlock value={String(summary?.rpm ?? 0)} label="近 1 小时 RPM" />
        <MetricBlock value={numberText(summary?.tpm ?? 0)} label="近 1 小时 TPM" />
      </div>
      <div className="toolbar">
        <Input className="toolbar-input" placeholder="开始时间" value="2026-05-19 00:00:00" readOnly />
        <Input className="toolbar-input" placeholder="结束时间" value="2026-05-19 23:59:59" readOnly />
        <Input className="toolbar-input" placeholder="令牌名称" />
        <Input className="toolbar-input" placeholder="模型名称" />
        <Input className="toolbar-input" placeholder="Request ID" />
        <Button>查询</Button>
        <Button>重置</Button>
        <Button>列设置</Button>
      </div>
      <div className="data-table">
        <div className="table-head log-grid">
          <span>时间</span>
          <span>令牌</span>
          <span>分组</span>
          <span>类型</span>
          <span>模型</span>
          <span>用时/首字</span>
          <span>输入</span>
          <span>输出</span>
          <span>花费</span>
          <span>IP</span>
          <span>详情</span>
        </div>
        {logs.length ? (
          logs.map((log) => (
            <div className="table-row log-grid" key={log.id}>
              <span>{dateText(log.created_at)}</span>
              <code>{log.request_id.slice(0, 14)}...</code>
              <span>default</span>
              <Tag color={log.source === "app_chat" ? "blue" : "purple"}>
                {log.source === "app_chat" ? "聊天" : "API"}
              </Tag>
              <span>{log.model_code}</span>
              <span>{log.latency_ms ?? 0} ms</span>
              <span>{numberText(log.prompt_tokens)}</span>
              <span>{numberText(log.completion_tokens)}</span>
              <span>{money(log.cost_amount)}</span>
              <span>127.0.0.1</span>
              <Tag color={log.status === "success" ? "green" : "red"}>{log.status === "success" ? "成功" : "失败"}</Tag>
            </div>
          ))
        ) : (
          <div className="empty-table">
            <ClipboardList size={48} />
            <span>暂无使用日志</span>
          </div>
        )}
      </div>
    </section>
  );
}

function DocsPage({ copyText, models }: { copyText: (text: string) => void; models: ModelInfo[] }) {
  const [activeDoc, setActiveDoc] = useState("quickstart");
  const modelCode = models[0]?.model_code ?? "gpt-4o-mini";
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
      code: `curl ${tokenApiBase}/chat/completions \\
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
  baseURL: "${tokenApiBase}"
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
    base_url="${tokenApiBase}"
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
          <p>兼容 OpenAI Chat Completions 格式。创建令牌后，把 SDK 的 Base URL 指向当前服务即可开始调用。</p>
        </div>
        <div className="docs-hero-meta" aria-label="接入摘要">
          <span>OpenAI Compatible</span>
          <strong>{tokenApiBase}</strong>
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
                  <strong>{tokenApiBase}</strong>
                  <Button size="small" icon={<Copy size={14} />} onClick={() => copyText(tokenApiBase)}>复制</Button>
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
                <p>在控制台创建 API 令牌，令牌明文只显示一次。</p>
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
                    <strong>{model.display_name}</strong>
                    <code>{model.model_code}</code>
                    <span>{priceText(model.price?.input_per_1k)} / 1K 输入</span>
                    <Button size="small" onClick={() => copyText(model.model_code)}>复制</Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {activeDoc === "errors" ? (
            <section className="panel docs-block">
              <PanelTitle icon={<Shield size={17} />} title="错误处理" />
              <div className="notice-list">
                <p>401：令牌缺失、令牌错误或令牌已停用。</p>
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
                <p>Web 端支持支付宝、微信、银行卡托管收银台和对公转账；当前开发环境只提供模拟支付。</p>
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
  submitting,
  updateProfile,
  user
}: {
  changePassword: (values: { current_password: string; new_password: string }) => void;
  submitting: boolean;
  updateProfile: (values: { email: string; phone?: string }) => void;
  user: SessionPayload["user"] | null;
}) {
  return (
    <section className="panel page-panel settings-panel">
      <PanelTitle icon={<Settings size={17} />} title="个人设置" />
      <div className="settings-forms">
        <section>
          <h3>
            <Mail size={17} />
            认证邮箱和手机号
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
            修改密码
          </h3>
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
  return (
    <section className="panel page-panel">
      <PanelTitle icon={<CircleDollarSign size={17} />} title="代理佣金" />
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
            邀请码
          </h3>
          <p className="muted">客户注册时填写邀请码后，会形成邀请关系。佣金到账以后台结算和审核为准。</p>
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
            <Form.Item label="提现金额，单位分" name="amount" rules={[{ required: true, message: "请输入提现金额" }]}>
              <Input type="number" min={1} placeholder="例如 2400" />
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
          <div className="log-list">
            {commissions.map((item) => (
              <div className="log-row" key={item.id}>
                <span>{item.created_at.replace("T", " ").slice(0, 19)}</span>
                <strong>{money(item.commission_amount)}</strong>
                <span>{item.source_email ?? item.source_user_id ?? "来源客户"}</span>
                <Tag>{item.status}</Tag>
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
  onCreate: (values: { name: string }) => void;
  open: boolean;
  submitting: boolean;
}) {
  return (
    <Modal title="添加令牌" open={open} onCancel={onCancel} footer={null}>
      <Form layout="vertical" onFinish={onCreate}>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入令牌名称" }]}>
          <Input placeholder="例如：生产环境" />
        </Form.Item>
        <Alert
          className="key-scope-note"
          message="默认可调用全部已授权模型"
          description="对话页和 API 调用时直接传 model 切换模型，不同模型会按后台配置的价格消耗余额。"
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
    const bankName = typeof account?.bank_name === "string" ? account.bank_name : "待配置收款银行";
    const accountNo = typeof account?.account_no === "string" ? account.account_no : "待配置账号";
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

function numberText(value?: number | null) {
  return value === undefined || value === null ? "-" : new Intl.NumberFormat("zh-CN").format(value);
}

function dateText(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
