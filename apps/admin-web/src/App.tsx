import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { AdminSessionUser } from "@ai-platform/shared-types";
import { Button, ConfigProvider, Layout, Menu, Segmented, Tag, Typography, message, theme as antdTheme } from "antd";
import {
  ApiOutlined,
  AuditOutlined,
  BankOutlined,
  ControlOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  FileTextOutlined,
  FileSearchOutlined,
  KeyOutlined,
  MobileOutlined,
  PayCircleOutlined,
  SettingOutlined,
  TeamOutlined,
  WalletOutlined
} from "@ant-design/icons";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ResourcePage from "./pages/ResourcePage";
import WalletPage from "./pages/WalletPage";
import PaymentOrdersPage from "./pages/PaymentOrdersPage";
import ProviderPage from "./pages/ProviderPage";
import ConfigPage from "./pages/ConfigPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import TenantInvoicesPage from "./pages/TenantInvoicesPage";
import TenantAccountsPage from "./pages/TenantAccountsPage";
import { apiFetch, clearSession, getSessionUser, getToken } from "./api";

const { Header, Sider, Content } = Layout;
type ThemeMode = "system" | "light" | "dark";
type EffectiveTheme = "light" | "dark";

const themeModeLabels: Record<ThemeMode, string> = {
  system: "系统",
  light: "浅色",
  dark: "深色"
};

function readThemeMode(): ThemeMode {
  const value = localStorage.getItem("admin_theme_mode");
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function getSystemTheme(): EffectiveTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function useAdminTheme() {
  const [mode, setMode] = useState<ThemeMode>(readThemeMode);
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(getSystemTheme);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(query.matches ? "dark" : "light");
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const effectiveTheme = mode === "system" ? systemTheme : mode;

  useEffect(() => {
    localStorage.setItem("admin_theme_mode", mode);
    document.documentElement.dataset.adminTheme = effectiveTheme;
  }, [mode, effectiveTheme]);

  return { mode, setMode, effectiveTheme };
}

const statusOptions = [
  { value: "active", label: "启用" },
  { value: "suspended", label: "停用" },
  { value: "archived", label: "归档" },
  { value: "draft", label: "草稿" }
];

const tenantTypeOptions = [
  { value: "standard", label: "标准租户" },
  { value: "enterprise", label: "企业租户" },
  { value: "partner", label: "渠道/代理租户" },
  { value: "internal", label: "内部测试租户" }
];

const projectTypeOptions = [
  { value: "ios_app", label: "iOS App" },
  { value: "android_app", label: "Android App" },
  { value: "web_checkout", label: "Web 收银台" },
  { value: "developer_api", label: "Developer API" }
];

const platformOptions = [
  { value: "ios", label: "iOS App" },
  { value: "android", label: "Android App" },
  { value: "web", label: "Web 收银台" },
  { value: "api", label: "Developer API" }
];

const paymentMethodOptions = [
  { value: "apple_iap", label: "Apple IAP" },
  { value: "alipay_app", label: "支付宝 App 支付" },
  { value: "wechat_app", label: "微信 App 支付" },
  { value: "unionpay_or_bank_card", label: "银联/银行卡" },
  { value: "alipay_qr", label: "支付宝二维码支付" },
  { value: "wechat_native", label: "微信 Native 支付" },
  { value: "card_checkout", label: "银行卡/信用卡托管收银台" },
  { value: "enterprise_transfer", label: "企业对公转账" }
];

const paymentProductTypeOptions = [
  { value: "recharge_credit", label: "余额充值包" },
  { value: "api_credit_pack", label: "API 额度包" },
  { value: "monthly_plan", label: "月套餐" },
  { value: "subscription", label: "订阅" },
  { value: "enterprise_topup", label: "企业充值" },
  { value: "bonus_pack", label: "活动赠送包" }
];

const settlementModeOptions = [
  { value: "platform_collected", label: "平台代收" },
  { value: "tenant_collected", label: "租户自收" },
  { value: "tenant_or_platform_collected", label: "租户或平台收款" },
  { value: "app_store_collected", label: "应用商店收款" }
];

const billingCycleOptions = [
  { value: "monthly", label: "月付" },
  { value: "quarterly", label: "季付" },
  { value: "yearly", label: "年付" }
];

const billingModeOptions = [
  { value: "prepaid", label: "预付钱包（客户先充值后调用）" },
  { value: "postpaid", label: "后付授信（按信用额度出账）" },
  { value: "subscription_usage", label: "SaaS 套餐 + 用量" },
  { value: "revenue_share", label: "收入分成" }
];

const subscriptionStatusOptions = [
  { value: "trialing", label: "试用中" },
  { value: "active", label: "生效中" },
  { value: "past_due", label: "逾期" },
  { value: "canceled", label: "已取消" }
];

const invoiceStatusOptions = [
  { value: "draft", label: "草稿" },
  { value: "issued", label: "已出账" },
  { value: "paid", label: "已支付" },
  { value: "void", label: "已作废" }
];

const priceTypeOptions = [
  { value: "cost_plus", label: "成本加价" },
  { value: "contract_price", label: "合同价" },
  { value: "revenue_share", label: "收入分成" }
];

const revenueShareStatusOptions = [
  { value: "pending", label: "待结算" },
  { value: "settled", label: "已结算" },
  { value: "reversed", label: "已冲正" }
];

const appReleaseStatusOptions = [
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "paused", label: "暂停下载" },
  { value: "archived", label: "归档" }
];

const distributionChannelOptions = [
  { value: "app_store", label: "App Store" },
  { value: "testflight", label: "TestFlight" },
  { value: "official_apk", label: "官网 APK" },
  { value: "huawei_market", label: "华为应用市场" },
  { value: "xiaomi_market", label: "小米应用商店" },
  { value: "yingyongbao", label: "应用宝" },
  { value: "enterprise", label: "企业私发包" }
];

type Permission = AdminSessionUser["permissions"][number];
type AccountType = AdminSessionUser["accountType"];
type MenuItem = {
  key: string;
  icon: ReactElement;
  label: string;
  permission: Permission;
  accountTypes: AccountType[];
};
type MenuSection = {
  key: string;
  icon: ReactElement;
  label: string;
  children: MenuItem[];
};

function hasPermission(user: AdminSessionUser | null, permission?: Permission) {
  return !permission || Boolean(user?.permissions?.includes(permission));
}

function canAccess(user: AdminSessionUser | null, item: Pick<MenuItem, "permission" | "accountTypes">) {
  return hasPermission(user, item.permission) && Boolean(user?.accountType && item.accountTypes.includes(user.accountType));
}

const adminOnly: AccountType[] = ["admin"];
const adminAndTenant: AccountType[] = ["admin", "tenant"];
const enableSaasBilling = import.meta.env.VITE_ENABLE_SAAS_BILLING === "true";
const enableRiskCenter = import.meta.env.VITE_ENABLE_RISK_CENTER === "true";
const enableInternalTenantObjects = import.meta.env.VITE_ENABLE_INTERNAL_TENANT_OBJECTS === "true";
const enableAdvancedModelRouting = import.meta.env.VITE_ENABLE_ADVANCED_MODEL_ROUTING === "true";
const enableTenantModelOverrides = import.meta.env.VITE_ENABLE_TENANT_MODEL_OVERRIDES === "true";

const menuSections = [
  {
    key: "overview",
    icon: <DashboardOutlined />,
    label: "总览",
    children: [
      { key: "/dashboard", icon: <DashboardOutlined />, label: "仪表盘", permission: "payment.read", accountTypes: adminAndTenant }
    ]
  },
  {
    key: "tenant-ops",
    icon: <TeamOutlined />,
    label: "租户运营",
    children: [
      { key: "/tenants", icon: <TeamOutlined />, label: "租户列表", permission: "platform.tenant.read_all", accountTypes: adminOnly },
      { key: "/tenant-memberships", icon: <TeamOutlined />, label: "租户管理员账号", permission: "platform.tenant.read_all", accountTypes: adminOnly },
      ...(enableInternalTenantObjects ? ([
        { key: "/tenant-projects", icon: <DeploymentUnitOutlined />, label: "应用项目配置", permission: "tenant.project.read", accountTypes: adminOnly },
        { key: "/tenant-customers", icon: <TeamOutlined />, label: "客户关系", permission: "tenant.customer.read", accountTypes: adminAndTenant }
      ] satisfies MenuItem[]) : []),
      { key: "/api-keys", icon: <KeyOutlined />, label: "API Key 管控", permission: "api_key.read", accountTypes: adminAndTenant }
    ]
  },
  ...(enableSaasBilling ? ([{
    key: "saas-billing",
    icon: <BankOutlined />,
    label: "SaaS 计费",
    children: [
      { key: "/tenant-plans", icon: <BankOutlined />, label: "套餐配置", permission: "tenant.billing.read", accountTypes: adminOnly },
      { key: "/tenant-subscriptions", icon: <FileTextOutlined />, label: "订阅管理", permission: "tenant.billing.read", accountTypes: adminOnly },
      { key: "/tenant-invoices", icon: <FileTextOutlined />, label: "租户账单", permission: "tenant.billing.read", accountTypes: adminAndTenant },
      { key: "/tenant-billing-rules", icon: <ControlOutlined />, label: "计费规则", permission: "tenant.billing.read", accountTypes: adminOnly },
      { key: "/tenant-usage-aggregates", icon: <FileSearchOutlined />, label: "用量汇总", permission: "tenant.billing.read", accountTypes: adminAndTenant },
      { key: "/tenant-revenue-shares", icon: <PayCircleOutlined />, label: "分成结算", permission: "tenant.billing.read", accountTypes: adminOnly },
      { key: "/commissions", icon: <PayCircleOutlined />, label: "代理佣金", permission: "commission.read", accountTypes: adminOnly },
      { key: "/commission-withdrawals", icon: <WalletOutlined />, label: "佣金提现", permission: "commission.read", accountTypes: adminOnly }
    ]
  }] satisfies MenuSection[]) : []),
  {
    key: "model-supply",
    icon: <ApiOutlined />,
    label: "模型供给",
    children: [
      { key: "/providers", icon: <DeploymentUnitOutlined />, label: "Provider", permission: "provider.read", accountTypes: adminOnly },
      { key: "/models", icon: <ApiOutlined />, label: "模型目录", permission: "model.read", accountTypes: adminAndTenant },
      { key: "/model-prices", icon: <BankOutlined />, label: "平台价格", permission: "price.read", accountTypes: adminOnly },
      ...(enableAdvancedModelRouting ? ([{ key: "/model-routes", icon: <DeploymentUnitOutlined />, label: "模型路由", permission: "route.read", accountTypes: adminOnly }] satisfies MenuItem[]) : []),
      ...(enableTenantModelOverrides ? ([
        { key: "/tenant-model-authorizations", icon: <ApiOutlined />, label: "租户模型覆盖", permission: "platform.tenant.read_all", accountTypes: adminOnly },
        { key: "/tenant-model-prices", icon: <BankOutlined />, label: "租户价格覆盖", permission: "platform.tenant.read_all", accountTypes: adminOnly }
      ] satisfies MenuItem[]) : [])
    ]
  },
  {
    key: "payment-fund",
    icon: <PayCircleOutlined />,
    label: "支付资金",
    children: [
      { key: "/payment-orders", icon: <PayCircleOutlined />, label: "支付订单", permission: "payment.read", accountTypes: adminAndTenant },
      { key: "/payment-transactions", icon: <FileSearchOutlined />, label: "支付交易", permission: "payment.read", accountTypes: adminAndTenant },
      { key: "/payment-order-events", icon: <FileTextOutlined />, label: "订单事件", permission: "payment.read", accountTypes: adminAndTenant },
      { key: "/payment-refunds", icon: <WalletOutlined />, label: "退款记录", permission: "payment.read", accountTypes: adminAndTenant },
      { key: "/payment-products", icon: <BankOutlined />, label: "充值套餐/付费商品", permission: "payment.read", accountTypes: adminOnly },
      { key: "/payment-product-visibility", icon: <DeploymentUnitOutlined />, label: "套餐上架/展示规则", permission: "payment.read", accountTypes: adminOnly },
      { key: "/payment-channels", icon: <ControlOutlined />, label: "支付渠道", permission: "payment.read", accountTypes: adminOnly },
      { key: "/payment-callbacks", icon: <FileSearchOutlined />, label: "支付回调", permission: "payment.read", accountTypes: adminOnly },
      { key: "/reconciliation-records", icon: <FileSearchOutlined />, label: "对账记录", permission: "payment.reconcile", accountTypes: adminOnly },
      { key: "/wallet-ledger", icon: <WalletOutlined />, label: "钱包流水", permission: "wallet.read", accountTypes: adminOnly }
    ]
  },
  {
    key: "system-risk",
    icon: <SettingOutlined />,
    label: "系统审计",
    children: [
      { key: "/users", icon: <TeamOutlined />, label: "账号管理", permission: "user.read", accountTypes: adminOnly },
      { key: "/request-logs", icon: <FileSearchOutlined />, label: "请求日志", permission: "request_log.read", accountTypes: adminAndTenant },
      { key: "/provider-request-attempts", icon: <FileSearchOutlined />, label: "上游调用尝试", permission: "request_log.read", accountTypes: adminAndTenant },
      { key: "/configs", icon: <SettingOutlined />, label: "配置中心", permission: "config.read", accountTypes: adminOnly },
      { key: "/app-releases", icon: <MobileOutlined />, label: "App 版本", permission: "config.read", accountTypes: adminOnly },
      { key: "/policy-documents", icon: <FileTextOutlined />, label: "协议政策", permission: "config.read", accountTypes: adminOnly },
      ...(enableRiskCenter ? ([
        { key: "/content-reports", icon: <AuditOutlined />, label: "内容举报", permission: "audit.read", accountTypes: adminOnly },
        { key: "/account-deletion-requests", icon: <AuditOutlined />, label: "注销申请", permission: "audit.read", accountTypes: adminOnly },
        { key: "/risk-events", icon: <AuditOutlined />, label: "风控事件", permission: "audit.read", accountTypes: adminOnly }
      ] satisfies MenuItem[]) : []),
      { key: "/audit-logs", icon: <AuditOutlined />, label: "审计日志", permission: "audit.read", accountTypes: adminOnly }
    ]
  }
] satisfies MenuSection[];

function RequireAuth({ children }: { children: ReactElement }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PermissionGate({
  user,
  permission,
  fallback,
  accountTypes,
  children
}: {
  user: AdminSessionUser | null;
  permission: Permission;
  fallback: string;
  accountTypes: AccountType[];
  children: ReactElement;
}) {
  if (!canAccess(user, { permission, accountTypes })) {
    return <Navigate to={fallback} replace />;
  }
  return children;
}

function Shell({
  themeMode,
  setThemeMode,
  effectiveTheme
}: {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  effectiveTheme: EffectiveTheme;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<AdminSessionUser | null>(() => getSessionUser() as AdminSessionUser | null);
  useEffect(() => {
    if (!getToken()) return;
    apiFetch<{ user: AdminSessionUser }>("/api/admin/auth/me")
      .then((result) => {
        localStorage.setItem("admin_user", JSON.stringify(result.user));
        setUser(result.user);
      })
      .catch(() => {
        // apiFetch already clears the session for 401. Keep the last local user for transient network errors.
      });
  }, []);
  const visibleMenuSections = menuSections
    .map((section) => ({
      ...section,
      children: section.children.filter((item) => canAccess(user, item))
    }))
    .filter((section) => section.children.length > 0);
  const visibleLeafItems = visibleMenuSections.flatMap((section) => section.children);
  const visibleMenuItems = visibleMenuSections.map(({ children, ...section }) => ({
    ...section,
    children: children.map(({ permission, accountTypes, ...item }) => item)
  }));
  const defaultPath = visibleLeafItems[0]?.key ?? "/login";
  const can = (permission: Permission) => hasPermission(user, permission);
  const accountTypeLabel = user?.accountType === "tenant" ? "租户" : "管理员";
  const showSourceModelPricing = user?.accountType === "admin" && can("platform.tenant.read_all");
  const page = (permission: Permission, accountTypes: AccountType[], element: ReactElement) => (
    <PermissionGate user={user} permission={permission} accountTypes={accountTypes} fallback={defaultPath}>
      {element}
    </PermissionGate>
  );
  return (
    <Layout className="admin-shell">
      <Sider width={236} theme={effectiveTheme === "dark" ? "dark" : "light"} className="admin-sider">
        <div className="brand">
          <div className="brand-mark">AI</div>
          <div>
            <Typography.Text strong>AI Model Platform</Typography.Text>
            <div className="brand-subtitle">Management Console</div>
          </div>
        </div>
        <Menu
          mode="inline"
          theme={effectiveTheme === "dark" ? "dark" : "light"}
          selectedKeys={[location.pathname]}
          defaultOpenKeys={visibleMenuSections.map((section) => section.key)}
          items={visibleMenuItems}
          onClick={(item) => navigate(item.key)}
        />
      </Sider>
      <Layout>
        <Header className="admin-header">
          <div className="header-left">
            {import.meta.env.DEV ? (
              <>
                <Tag color="red" className="env-tag">DEV</Tag>
                <span className="header-hint">本地开发环境</span>
              </>
            ) : null}
          </div>
          <div className="header-right">
            <Segmented
              size="small"
              value={themeMode}
              options={[
                { value: "system", label: <span className="theme-option"><Monitor size={14} />{themeModeLabels.system}</span> },
                { value: "light", label: <span className="theme-option"><Sun size={14} />{themeModeLabels.light}</span> },
                { value: "dark", label: <span className="theme-option"><Moon size={14} />{themeModeLabels.dark}</span> }
              ]}
              onChange={(value) => setThemeMode(value as ThemeMode)}
            />
            <Tag color={user?.accountType === "tenant" ? "blue" : "purple"}>{accountTypeLabel}</Tag>
            <span>{user?.email}</span>
            <Button
              icon={<LogOut size={16} />}
              onClick={() => {
                clearSession();
                navigate("/login");
              }}
            >
              退出
            </Button>
          </div>
        </Header>
        <Content className="admin-content">
          <Routes>
            <Route index element={<Navigate to={defaultPath} replace />} />
            <Route path="/dashboard" element={page("payment.read", adminAndTenant, <DashboardPage />)} />
            <Route
              path="/tenants"
              element={page(
                "platform.tenant.read_all",
                adminOnly,
                <ResourcePage
                  title="租户管理"
                  description="新增租户是创建业务归属；租户管理员账号在单独页面创建。租户编码用于链接、注册归属和 API 上下文，新增时可留空由系统自动生成。删除租户会把客户、钱包、API Key 和历史使用数据迁移到默认租户，默认租户不可删除。"
                  endpoint="/api/admin/tenants"
                  rowKey="id"
                  columns={[
                    ["name", "租户名称"],
                    ["tenant_type", "租户类型"],
                    ["billing_mode", "计费模式", "select", undefined, undefined, billingModeOptions],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["created_at", "创建时间"]
                  ]}
                  editableFields={[
                    ["name", "租户名称"],
                    ["tenant_type", "租户类型", "select", undefined, undefined, tenantTypeOptions],
                    ["billing_mode", "计费模式", "select", undefined, undefined, billingModeOptions],
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  canCreate={can("platform.tenant.write_all")}
                  canEdit={can("platform.tenant.write_all")}
                  canDelete={can("platform.tenant.write_all")}
                  deleteDisabled={(row) => row.tenant_type === "platform_default" || row.tenant_code === "platform_default_tenant" || row.settings?.owned_by_platform === true}
                  deleteConfirmTitle="删除租户并迁移客户？"
                  deleteConfirmDescription="系统会把该租户下的客户、钱包余额、API Key、聊天和账单上下文迁移到默认租户，然后将原租户归档隐藏。默认租户不可删除。"
                  deleteReason="删除租户并迁移客户到默认租户"
                />
              )}
            />
            <Route
              path="/tenant-memberships"
              element={page("platform.tenant.read_all", adminOnly, <TenantAccountsPage />)}
            />
            <Route
              path="/tenant-projects"
              element={page(
                "tenant.project.read",
                adminOnly,
                <ResourcePage
                  title="应用项目配置"
                  description="项目用于区分 Web、iOS、Android 和 API 的配置上下文、支付方式、下载入口和审核策略。普通客户不会直接看到这里。"
                  endpoint="/api/admin/tenant-projects"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_code", "项目编码"],
                    ["name", "项目名称"],
                    ["project_type", "项目类型", "select", undefined, undefined, projectTypeOptions],
                    ["platform", "平台", "select", undefined, undefined, platformOptions],
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  editableFields={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_code", "项目编码"],
                    ["name", "项目名称"],
                    ["project_type", "项目类型", "select", undefined, undefined, projectTypeOptions],
                    ["platform", "平台", "select", undefined, undefined, platformOptions],
                    ["bundle_id", "iOS Bundle ID"],
                    ["package_name", "Android Package Name"],
                    ["web_domain", "Web 域名"],
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  canCreate={can("tenant.project.write")}
                  canEdit={can("tenant.project.write")}
                />
              )}
            />
            <Route
              path="/tenant-customers"
              element={page(
                "tenant.customer.read",
                adminAndTenant,
                <ResourcePage
                  title="客户关系"
                  description="这里展示 Web/App 注册或登录后自动归属到租户的客户关系。后台不手动创建普通客户，只用于查看归属和停用异常关系。"
                  endpoint="/api/admin/tenant-customers"
                  rowKey="id"
                  columns={[
                    ["tenant_name", "租户"],
                    ["project_name", "来源项目"],
                    ["customer_email", "客户账号"],
                    ["customer_user_type", "客户类型"],
                    ["customer_code", "客户编码"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["created_at", "创建时间"]
                  ]}
                  editableFields={[
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  canEdit={can("tenant.customer.write")}
                />
              )}
            />
            <Route path="/api-keys" element={page("api_key.read", adminAndTenant, <ApiKeysPage canWrite={can("api_key.write")} canRevoke={can("api_key.revoke")} />)} />
            <Route
              path="/tenant-plans"
              element={page(
                "tenant.billing.read",
                adminOnly,
                <ResourcePage
                  title="租户套餐"
                  description="这里配置的是卖给租户的 SaaS 服务套餐；Web/App 上展示给客户购买的是“客户套餐 / 付费商品”。金额统一按元录入，后端仍以整数分存储。"
                  endpoint="/api/admin/tenant-plans"
                  rowKey="id"
                  columns={[
                    ["name", "套餐名称"],
                    ["billing_cycle", "计费周期", "select", undefined, undefined, billingCycleOptions],
                    ["base_fee_amount", "基础服务费（元）", "money"],
                    ["included_credit", "包含抵扣额度（元）", "money"],
                    ["included_token_budget", "包含 Token 预算"],
                    ["support_level", "支持等级"],
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  editableFields={[
                    ["name", "套餐名称"],
                    ["billing_cycle", "计费周期", "select", undefined, undefined, billingCycleOptions],
                    ["base_fee_amount", "基础服务费（元）", "money"],
                    ["included_credit", "包含抵扣额度（元）", "money"],
                    ["included_token_budget", "包含 Token 预算", "number"],
                    ["max_projects", "项目数上限", "number"],
                    ["max_customers", "客户数上限", "number"],
                    ["max_members", "成员数上限", "number"],
                    ["log_retention_days", "日志保留天数", "number"],
                    ["support_level", "支持等级"],
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  canCreate={can("tenant.billing.write")}
                  canEdit={can("tenant.billing.write")}
                />
              )}
            />
            <Route
              path="/tenant-subscriptions"
              element={page(
                "tenant.billing.read",
                adminOnly,
                <ResourcePage
                  title="租户订阅"
                  endpoint="/api/admin/tenant-subscriptions"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["plan_id", "套餐", "select", "/api/admin/tenant-plans", "name"],
                    ["subscription_no", "订阅号"],
                    ["billing_mode", "计费模式", "select", undefined, undefined, billingModeOptions],
                    ["status", "状态", "select", undefined, undefined, subscriptionStatusOptions],
                    ["current_period_start", "当前周期开始"],
                    ["current_period_end", "当前周期结束"],
                    ["next_billing_at", "下次出账"]
                  ]}
                  editableFields={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["plan_id", "套餐", "select", "/api/admin/tenant-plans", "name"],
                    ["subscription_no", "订阅号"],
                    ["status", "状态", "select", undefined, undefined, subscriptionStatusOptions],
                    ["billing_mode", "计费模式", "select", undefined, undefined, billingModeOptions],
                    ["current_period_start", "当前周期开始 ISO"],
                    ["current_period_end", "当前周期结束 ISO"],
                    ["next_billing_at", "下次出账 ISO"],
                    ["cancel_at", "取消时间 ISO"],
                    ["seat_count", "席位数", "number"],
                    ["base_fee_amount", "基础服务费（元）", "money"],
                    ["included_credit", "包含抵扣额度（元）", "money"]
                  ]}
                  canCreate={can("tenant.billing.write")}
                  canEdit={can("tenant.billing.write")}
                />
              )}
            />
            <Route path="/tenant-invoices" element={page("tenant.billing.read", adminAndTenant, <TenantInvoicesPage canGenerate={can("tenant.billing.write")} />)} />
            <Route
              path="/tenant-billing-rules"
              element={page(
                "tenant.billing.read",
                adminOnly,
                <ResourcePage
                  title="计费规则"
                  endpoint="/api/admin/tenant-billing-rules"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["rule_code", "规则编码"],
                    ["rule_version", "版本"],
                    ["billing_mode", "计费模式", "select", undefined, undefined, billingModeOptions],
                    ["price_type", "计价方式", "select", undefined, undefined, priceTypeOptions],
                    ["base_fee_amount", "基础服务费（元）", "money"],
                    ["min_commit_amount", "最低消费（元）", "money"],
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  editableFields={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["rule_code", "规则编码"],
                    ["rule_version", "版本"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["billing_mode", "计费模式", "select", undefined, undefined, billingModeOptions],
                    ["price_type", "计价方式", "select", undefined, undefined, priceTypeOptions],
                    ["base_fee_amount", "基础服务费（元）", "money"],
                    ["included_credit", "包含抵扣额度（元）", "money"],
                    ["included_token_budget", "包含 Token 预算", "number"],
                    ["min_commit_amount", "最低消费（元）", "money"],
                    ["cost_plus_markup_rate", "成本加价率"],
                    ["min_margin_multiplier", "最低毛利倍率"],
                    ["revenue_share_rate", "收入分成比例"],
                    ["revenue_share_base", "收入分成基准"],
                    ["payment_service_fee_rate", "支付服务费率"],
                    ["effective_from", "生效开始 ISO"],
                    ["effective_to", "生效结束 ISO"]
                  ]}
                  canCreate={can("tenant.billing.write")}
                  canEdit={can("tenant.billing.write")}
                />
              )}
            />
            {enableTenantModelOverrides ? (
              <>
                <Route
                  path="/tenant-model-authorizations"
                  element={page(
                    "platform.tenant.read_all",
                    adminOnly,
                    <ResourcePage
                      title="租户模型覆盖"
                      description="所有租户默认可使用全部已上架、已定价、有上下文的模型；只有需要对某个业务租户改小上下文或预算时才在这里配置覆盖。"
                      endpoint="/api/admin/tenant-model-authorizations"
                      rowKey="id"
                      columns={[
                        ["tenant_name", "租户"],
                        ["public_model_code", "模型"],
                        ["model_display_name", "展示名"],
                        ["status", "状态", "select", undefined, undefined, statusOptions],
                        ["max_context_tokens", "上下文上限"],
                        ["monthly_budget", "月预算（元）", "money"]
                      ]}
                      editableFields={[
                        { key: "tenant_id", label: "租户", kind: "select", optionsResource: "tenant-model-target-tenants", remoteSearch: true, required: true, help: "默认租户无需配置；业务租户不配置时使用平台默认模型上下文和价格。" },
                        {
                          key: "model_id",
                          label: "模型",
                          kind: "select",
                          optionsResource: "models",
                          remoteSearch: true,
                          required: true,
                          autofillFromOption: { max_context_tokens: "max_context_tokens" },
                          help: "选择模型后会自动带出模型目录中的默认上下文上限；这里只在需要对该租户改小时配置。"
                        },
                        { key: "status", label: "状态", kind: "select", options: statusOptions, required: true },
                        { key: "max_context_tokens", label: "上下文上限", kind: "number", help: "默认来自模型目录。可改小用于控制该租户单次请求上下文；留空表示不额外限制。" },
                        { key: "daily_budget", label: "日预算（元）", kind: "money", help: "可选。不设置表示不做日额度限制，只按钱包余额扣费。" },
                        { key: "monthly_budget", label: "月预算（元）", kind: "money", help: "可选。不设置表示不做月额度限制，一直用到钱包余额不足为止。" }
                      ]}
                      canCreate={can("platform.tenant.write_all")}
                      canEdit={can("platform.tenant.write_all")}
                    />
                  )}
                />
                <Route
                  path="/tenant-model-prices"
                  element={page(
                    "platform.tenant.read_all",
                    adminOnly,
                    <ResourcePage
                      title="租户价格覆盖"
                      description="只有业务租户需要独立售价时才在这里覆盖。未配置覆盖时，Web/App/API 自动使用平台全局模型价格。"
                      endpoint="/api/admin/tenant-model-prices"
                      rowKey="id"
                      columns={[
                        ["tenant_name", "租户"],
                        ["public_model_code", "模型"],
                        ["model_display_name", "展示名"],
                        ["input_price_per_1k_yuan", "输入/1K tokens", "token_price"],
                        ["output_price_per_1k_yuan", "输出/1K tokens", "token_price"],
                        ["status", "状态", "select", undefined, undefined, statusOptions]
                      ]}
                      editableFields={[
                        { key: "tenant_id", label: "租户", kind: "select", optionsResource: "tenant-model-target-tenants", remoteSearch: true, required: true, help: "默认自营租户使用全局模型价格，不在这里配置价格覆盖。" },
                        {
                          key: "model_id",
                          label: "模型",
                          kind: "select",
                          optionsResource: "models",
                          remoteSearch: true,
                          required: true,
                          autofillFromOption: {
                            price_version: "price_version",
                            currency: "currency",
                            input_price_per_1k_yuan: "input_price_per_1k_yuan",
                            output_price_per_1k_yuan: "output_price_per_1k_yuan"
                          },
                          help: "选择模型后会自动带出平台全局价格，管理员可以基于默认价格做租户覆盖。"
                        },
                        { key: "input_price_per_1k_yuan", payloadKey: "input_price_per_1m", submitTransform: "yuan_per_1k_to_cents_per_1m", label: "输入/1K tokens（元）", kind: "token_price", required: true },
                        { key: "output_price_per_1k_yuan", payloadKey: "output_price_per_1m", submitTransform: "yuan_per_1k_to_cents_per_1m", label: "输出/1K tokens（元）", kind: "token_price", required: true },
                        { key: "status", label: "状态", kind: "select", options: statusOptions, required: true }
                      ]}
                      canCreate={can("platform.tenant.write_all")}
                      canEdit={can("platform.tenant.write_all")}
                    />
                  )}
                />
              </>
            ) : null}
            <Route
              path="/tenant-usage-aggregates"
              element={page(
                "tenant.billing.read",
                adminAndTenant,
                <ResourcePage
                  title="租户用量汇总"
                  endpoint="/api/admin/tenant-usage-aggregates"
                  rowKey="id"
                  columns={[
                    ["tenant_name", "租户"],
                    ["project_name", "项目"],
                    ["public_model_code", "模型"],
                    ["period_start", "期间开始"],
                    ["period_end", "期间结束"],
                    ["total_requests", "请求数"],
                    ["total_tokens", "Token 数"],
                    ["provider_cost_amount", "供应商成本（元）", "money"],
                    ["tenant_wholesale_amount", "租户批发价（元）", "money"],
                    ["end_user_revenue_amount", "客户付款金额（元）", "money"]
                  ]}
                />
              )}
            />
            <Route
              path="/tenant-revenue-shares"
              element={page(
                "tenant.billing.read",
                adminOnly,
                <ResourcePage
                  title="租户分成"
                  endpoint="/api/admin/tenant-revenue-shares"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["payment_order_id", "支付订单"],
                    ["status", "状态", "select", undefined, undefined, revenueShareStatusOptions],
                    ["payment_gross_amount", "付款总额（元）", "money"],
                    ["payment_channel_fee", "支付通道费（元）", "money"],
                    ["platform_share_amount", "平台分成（元）", "money"],
                    ["tenant_share_amount", "租户分成（元）", "money"],
                    ["revenue_share_rate", "分成比例"]
                  ]}
                  editableFields={[
                    ["status", "状态", "select", undefined, undefined, revenueShareStatusOptions],
                    ["settled_at", "结算时间 ISO"],
                    ["reversed_at", "冲正时间 ISO"]
                  ]}
                  canEdit={can("tenant.billing.write")}
                />
              )}
            />
            <Route
              path="/commissions"
              element={page(
                "commission.read",
                adminOnly,
                <ResourcePage
                  title="代理佣金"
                  endpoint="/api/admin/commissions"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["beneficiary_user_id", "受益账号", "select", "/api/admin/users", "email"],
                    ["source_user_id", "来源账号", "select", "/api/admin/users", "email"],
                    ["payment_order_id", "支付订单"],
                    ["commission_base_amount", "佣金基数（元）", "money"],
                    ["commission_rate", "佣金比例"],
                    ["commission_amount", "佣金金额（元）", "money"],
                    ["status", "状态"],
                    ["created_at", "创建时间"]
                  ]}
                  editableFields={[
                    ["status", "状态"]
                  ]}
                  canEdit={can("commission.approve")}
                />
              )}
            />
            <Route
              path="/commission-withdrawals"
              element={page(
                "commission.read",
                adminOnly,
                <ResourcePage
                  title="佣金提现申请"
                  endpoint="/api/admin/commission-withdrawals"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["user_id", "客户账号", "select", "/api/admin/users", "email"],
                    ["amount", "提现金额（元）", "money"],
                    ["status", "状态"],
                    ["payout_method", "提现方式"],
                    ["payout_account_mask", "提现账号"],
                    ["requested_from", "来源端"],
                    ["created_at", "创建时间"]
                  ]}
                  editableFields={[
                    ["status", "状态"],
                    ["reviewed_at", "审核时间 ISO"]
                  ]}
                  canEdit={can("commission.approve")}
                />
              )}
            />
            <Route
              path="/users"
              element={page(
                "user.read",
                adminOnly,
                <ResourcePage
                  title="用户管理"
                  endpoint="/api/admin/users"
                  rowKey="id"
                  columns={[
                    ["email", "邮箱"],
                    ["phone", "手机号"],
                    ["user_type", "类型"],
                    ["status", "状态"],
                    ["created_at", "注册时间"]
                  ]}
                />
              )}
            />
            <Route path="/wallet-ledger" element={page("wallet.read", adminOnly, <WalletPage canAdjust={can("wallet.adjust")} />)} />
            <Route path="/payment-orders" element={page("payment.read", adminAndTenant, <PaymentOrdersPage canRefund={can("payment.refund")} canReconcile={can("payment.reconcile")} />)} />
            <Route
              path="/payment-transactions"
              element={page(
                "payment.read",
                adminAndTenant,
                <ResourcePage
                  title="支付交易"
                  endpoint="/api/admin/payment/transactions"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["payment_order_id", "支付订单"],
                    ["transaction_type", "交易类型"],
                    ["channel_code", "渠道编码"],
                    ["channel_trade_no", "渠道交易号"],
                    ["status", "状态"],
                    ["amount", "金额，单位分"],
                    ["verified", "已验证", "boolean"],
                    ["created_at", "创建时间"]
                  ]}
                />
              )}
            />
            <Route
              path="/payment-order-events"
              element={page(
                "payment.read",
                adminAndTenant,
                <ResourcePage
                  title="支付订单状态流转"
                  endpoint="/api/admin/payment/order-events"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["payment_order_id", "支付订单"],
                    ["event_type", "事件类型"],
                    ["from_status", "原状态"],
                    ["to_status", "目标状态"],
                    ["reason", "原因"],
                    ["actor_type", "触发方"],
                    ["created_at", "创建时间"]
                  ]}
                />
              )}
            />
            <Route
              path="/payment-refunds"
              element={page(
                "payment.read",
                adminAndTenant,
                <ResourcePage
                  title="支付退款"
                  endpoint="/api/admin/payment/refunds"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["payment_order_id", "支付订单"],
                    ["refund_no", "退款单号"],
                    ["provider_refund_no", "渠道退款号"],
                    ["channel_code", "渠道编码"],
                    ["amount", "退款金额"],
                    ["status", "状态"],
                    ["reason", "原因"],
                    ["created_at", "创建时间"]
                  ]}
                />
              )}
            />
            <Route
              path="/payment-products"
              element={page(
                "payment.read",
                adminOnly,
                <ResourcePage
                  title="充值套餐 / 付费商品"
                  endpoint="/api/admin/payment/products"
                  rowKey="id"
                  columns={[
                    ["tenant_name", "租户"],
                    ["name", "套餐名称"],
                    ["product_type", "套餐类型", "select", undefined, undefined, paymentProductTypeOptions],
                    ["face_value_amount", "到账额度（元）", "money"],
                    ["bonus_amount", "赠送额度（元）", "money"],
                    ["sale_amount", "售价（元）", "money"],
                    ["visible_platforms", "展示端"],
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  editableFields={[
                    { key: "tenant_id", label: "租户", kind: "select", optionsResource: "tenants", remoteSearch: true, required: true },
                    { key: "project_id", label: "项目", kind: "select", optionsResource: "tenant-projects", dependsOn: ["tenant_id"], remoteSearch: true },
                    { key: "name", label: "套餐名称", required: true },
                    { key: "product_type", label: "套餐类型", kind: "select", options: paymentProductTypeOptions, required: true },
                    { key: "face_value_amount", label: "到账额度（元）", kind: "money", required: true },
                    { key: "bonus_amount", label: "赠送额度（元）", kind: "money" },
                    { key: "sale_amount", label: "售价（元）", kind: "money", required: true },
                    { key: "ios_product_id", label: "App Store 商品 ID", visibleWhen: { product_type: "recharge_credit" } },
                    { key: "status", label: "状态", kind: "select", options: statusOptions, required: true }
                  ]}
                  canCreate={can("payment.reconcile")}
                  canEdit={can("payment.reconcile")}
                />
              )}
            />
            <Route
              path="/payment-product-visibility"
              element={page(
                "payment.read",
                adminOnly,
                <ResourcePage
                  title="套餐上架 / 展示规则"
                  endpoint="/api/admin/payment/product-visibility"
                  rowKey="id"
                  columns={[
                    ["product_name", "充值套餐"],
                    ["tenant_name", "租户"],
                    ["project_name", "展示项目"],
                    ["platform", "展示端", "select", undefined, undefined, platformOptions],
                    ["display_name", "展示名称"],
                    ["badge", "角标"],
                    ["enabled", "启用", "boolean"],
                    ["sort_order", "排序"]
                  ]}
                  editableFields={[
                    { key: "tenant_id", label: "租户", kind: "select", optionsResource: "tenants", remoteSearch: true, required: true },
                    { key: "platform", label: "展示端", kind: "select", optionsResource: "platforms", required: true },
                    { key: "project_id", label: "展示项目", kind: "select", optionsResource: "tenant-projects", dependsOn: ["tenant_id", "platform"], remoteSearch: true },
                    { key: "product_id", label: "充值套餐", kind: "select", optionsResource: "payment-products", dependsOn: ["tenant_id", "project_id"], remoteSearch: true, required: true },
                    { key: "display_name", label: "展示名称" },
                    { key: "display_description", label: "展示说明", kind: "textarea" },
                    { key: "badge", label: "角标" },
                    { key: "sort_order", label: "排序", kind: "number" },
                    { key: "enabled", label: "启用", kind: "boolean" }
                  ]}
                  canCreate={can("payment.reconcile")}
                  canEdit={can("payment.reconcile")}
                />
              )}
            />
            <Route
              path="/payment-channels"
              element={page(
                "payment.read",
                adminOnly,
                <ResourcePage
                  title="支付渠道"
                  endpoint="/api/admin/payment/channels"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["channel_code", "渠道编码"],
                    ["channel_type", "渠道类型"],
                    ["display_name", "展示名"],
                    ["platform", "平台", "select", undefined, undefined, platformOptions],
                    ["payment_method", "支付方式", "select", undefined, undefined, paymentMethodOptions],
                    ["settlement_mode", "结算方式", "select", undefined, undefined, settlementModeOptions],
                    ["enabled", "启用", "boolean"]
                  ]}
                  detailFields={[
                    ["tenant_id", "租户"],
                    ["project_id", "项目"],
                    ["channel_code", "渠道编码"],
                    ["channel_type", "渠道类型"],
                    ["display_name", "展示名"],
                    ["platform", "平台"],
                    ["payment_method", "支付方式"],
                    ["settlement_mode", "结算方式"],
                    ["fee_rate_bps", "通道费率 BPS"],
                    ["sort_order", "排序"],
                    ["enabled", "启用", "boolean"],
                    { key: "config", label: "渠道配置", kind: "json", sensitive: true },
                    ["created_at", "创建时间"],
                    ["updated_at", "更新时间"]
                  ]}
                  editableFields={[
                    { key: "tenant_id", label: "租户", kind: "select", optionsResource: "tenants", remoteSearch: true, required: true },
                    { key: "platform", label: "平台", kind: "select", optionsResource: "platforms", required: true },
                    { key: "project_id", label: "项目", kind: "select", optionsResource: "tenant-projects", dependsOn: ["tenant_id", "platform"], remoteSearch: true },
                    { key: "channel_code", label: "渠道编码", required: true },
                    { key: "channel_type", label: "渠道类型", required: true },
                    { key: "display_name", label: "展示名", required: true },
                    { key: "payment_method", label: "支付方式", kind: "select", optionsResource: "payment-methods", dependsOn: ["platform"], required: true },
                    { key: "settlement_mode", label: "结算方式", kind: "select", options: settlementModeOptions, required: true },
                    { key: "fee_rate_bps", label: "通道费率 BPS", kind: "number" },
                    { key: "sort_order", label: "排序", kind: "number" },
                    { key: "enabled", label: "启用", kind: "boolean" },
                    { key: "config", label: "渠道配置 JSON", kind: "json", sensitive: true, help: "商户密钥、私钥等敏感字段保存后不回显；留空表示不修改。" }
                  ]}
                  canCreate={can("payment.reconcile")}
                  canEdit={can("payment.reconcile")}
                />
              )}
            />
            <Route
              path="/payment-callbacks"
              element={page(
                "payment.read",
                adminOnly,
                <ResourcePage
                  title="支付回调"
                  endpoint="/api/admin/payment/callbacks"
                  rowKey="id"
                  columns={[
                    ["channel_code", "渠道编码"],
                    ["event_type", "事件类型"],
                    ["signature_valid", "签名有效", "boolean"],
                    ["processed", "已处理", "boolean"],
                    ["process_result", "处理结果"],
                    ["created_at", "创建时间"]
                  ]}
                />
              )}
            />
            <Route
              path="/reconciliation-records"
              element={page(
                "payment.reconcile",
                adminOnly,
                <ResourcePage
                  title="支付对账记录"
                  endpoint="/api/admin/reconciliation/records"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["channel_code", "渠道编码"],
                    ["order_no", "订单号"],
                    ["channel_trade_no", "渠道交易号"],
                    ["difference_type", "差异类型"],
                    ["status", "状态"],
                    ["local_amount", "本地金额"],
                    ["channel_amount", "渠道金额"],
                    ["created_at", "创建时间"]
                  ]}
                  editableFields={[
                    ["status", "状态"],
                    ["resolved_note", "处理备注"]
                  ]}
                  canEdit={can("payment.reconcile")}
                />
              )}
            />
            <Route
              path="/providers"
              element={page(
                "provider.read",
                adminOnly,
                <ProviderPage
                  canWrite={can("provider.write")}
                  canWriteCredential={can("provider.credential.write")}
                  canSyncModels={can("provider.sync_models")}
                />
              )}
            />
            <Route
              path="/models"
              element={page(
                "model.read",
                adminAndTenant,
                <ResourcePage
                  title="模型目录"
                  endpoint="/api/admin/models"
                  rowKey="id"
                  columns={[
                    ["public_model_code", "公开模型名"],
                    ["display_name", "模型名称"],
                    ["model_company", "模型公司"],
                    ["provider_source", "接入来源"],
                    ["max_context_tokens", "上下文"],
                    showSourceModelPricing ? ["source_currency", "原始币种"] : ["currency", "币种"],
                    showSourceModelPricing ? ["source_input_price_per_1k_yuan", "原始输入/1K tokens", "token_price"] : ["input_price_per_1k_yuan", "输入/1K tokens", "token_price"],
                    showSourceModelPricing ? ["source_output_price_per_1k_yuan", "原始输出/1K tokens", "token_price"] : ["output_price_per_1k_yuan", "输出/1K tokens", "token_price"],
                    ["supports_stream", "Stream"],
                    ["supports_tools", "Tools"],
                    ["status", "状态"]
                  ]}
                  detailFields={[
                    ["public_model_code", "公开模型名"],
                    ["display_name", "模型名称"],
                    ["model_company", "模型公司"],
                    ["provider_source", "接入来源"],
                    ["model_family", "模型族"],
                    ["max_context_tokens", "上下文"],
                    ["default_max_output_tokens", "默认输出"],
                    showSourceModelPricing ? ["source_currency", "原始币种"] : ["currency", "币种"],
                    showSourceModelPricing ? ["source_input_price_per_1k_yuan", "原始输入/1K tokens", "token_price"] : ["input_price_per_1k_yuan", "输入/1K tokens", "token_price"],
                    showSourceModelPricing ? ["source_output_price_per_1k_yuan", "原始输出/1K tokens", "token_price"] : ["output_price_per_1k_yuan", "输出/1K tokens", "token_price"],
                    ["supports_stream", "支持 Stream"],
                    ["supports_tools", "支持 Tools"],
                    ["supports_json_mode", "支持 JSON"],
                    ["status", "状态"]
                  ]}
                  canCreate={false}
                  canEdit={false}
                />
              )}
            />
            <Route
              path="/model-prices"
              element={page(
                "price.read",
                adminOnly,
                <ResourcePage
                  title="模型价格"
                  description="平台对外生效的全局模型价格和上下文窗口。模型目录保留供应商原始同步数据；这里修改后会同步影响 Web、App 和 API 调用计费展示。"
                  endpoint="/api/admin/model-prices"
                  rowKey="id"
                  columns={[
                    ["model_display_name", "模型名称"],
                    ["public_model_code", "模型 ID"],
                    ["currency", "币种"],
                    ["source_max_context_tokens", "原始上下文"],
                    ["effective_max_context_tokens", "对外上下文"],
                    ["input_price_per_1k_yuan", "输入/1K tokens", "token_price"],
                    ["output_price_per_1k_yuan", "输出/1K tokens", "token_price"],
                    ["status", "状态"]
                  ]}
                  detailFields={[
                    ["model_display_name", "模型名称"],
                    ["public_model_code", "模型 ID"],
                    ["price_version", "价格版本"],
                    ["currency", "币种"],
                    ["source_max_context_tokens", "原始上下文"],
                    ["max_context_tokens", "对外上下文"],
                    ["default_max_output_tokens", "默认输出"],
                    ["input_price_per_1k_yuan", "输入/1K tokens", "token_price"],
                    ["output_price_per_1k_yuan", "输出/1K tokens", "token_price"],
                    ["reserve_multiplier", "预留倍率"],
                    ["status", "状态"]
                  ]}
                  editableFields={[
                    {
                      key: "model_id",
                      label: "模型",
                      kind: "select",
                      optionsResource: "models",
                      remoteSearch: true,
                      required: true,
                      autofillFromOption: {
                        price_version: "price_version",
                        currency: "currency",
                        max_context_tokens: "max_context_tokens",
                        default_max_output_tokens: "default_max_output_tokens",
                        input_price_per_1k_yuan: "input_price_per_1k_yuan",
                        output_price_per_1k_yuan: "output_price_per_1k_yuan"
                      },
                      help: "已有平台价格和上下文会自动带出；不改上下文时默认使用供应商同步的原始上下文。"
                    },
                    { key: "price_version", label: "版本", required: true },
                    { key: "currency", label: "币种", required: true },
                    { key: "max_context_tokens", label: "对外上下文窗口", kind: "number", help: "为空时使用模型目录里的原始上下文；填写后 Web、App 和 API 按这里展示与限制。" },
                    { key: "default_max_output_tokens", label: "默认输出上限", kind: "number" },
                    { key: "input_price_per_1k_yuan", payloadKey: "input_price_per_1m", submitTransform: "yuan_per_1k_to_cents_per_1m", label: "输入/1K tokens（元）", kind: "token_price", required: true },
                    { key: "output_price_per_1k_yuan", payloadKey: "output_price_per_1m", submitTransform: "yuan_per_1k_to_cents_per_1m", label: "输出/1K tokens（元）", kind: "token_price", required: true },
                    { key: "cache_read_price_per_1k_yuan", payloadKey: "cache_read_price_per_1m", submitTransform: "yuan_per_1k_to_cents_per_1m", label: "缓存读取/1K tokens（元）", kind: "token_price" },
                    { key: "cache_write_price_per_1k_yuan", payloadKey: "cache_write_price_per_1m", submitTransform: "yuan_per_1k_to_cents_per_1m", label: "缓存写入/1K tokens（元）", kind: "token_price" },
                    { key: "reserve_multiplier", label: "预留倍率", kind: "number" },
                    { key: "status", label: "状态", kind: "select", options: statusOptions, required: true }
                  ]}
                  canCreate={can("price.write")}
                  canEdit={can("price.write")}
                />
              )}
            />
            <Route
              path="/model-routes"
              element={page(
                "route.read",
                adminOnly,
                <ResourcePage
                  title="模型路由"
                  endpoint="/api/admin/model-routes"
                  rowKey="id"
                  columns={[
                    ["route_code", "路由编码"],
                    ["model_id", "模型", "select", "/api/admin/models", "public_model_code"],
                    ["provider_id", "Provider", "select", "/api/admin/options/providers", "label"],
                    ["provider_model_code", "上游模型"],
                    ["weight", "权重"],
                    ["priority", "优先级"],
                    ["enabled", "启用"]
                  ]}
                  editableFields={[
                    ["route_code", "路由编码"],
                    ["model_id", "模型", "select", "/api/admin/models", "public_model_code"],
                    ["provider_id", "Provider", "select", "/api/admin/options/providers", "label"],
                    ["credential_id", "密钥", "select", "/api/admin/provider-credentials", "name"],
                    ["provider_model_code", "上游模型"],
                    ["weight", "权重"],
                    ["priority", "优先级"],
                    ["strategy", "策略"],
                    ["enabled", "启用"],
                    ["allow_fallback", "允许 fallback"]
                  ]}
                  canCreate={can("route.write")}
                  canEdit={can("route.write")}
                />
              )}
            />
            <Route
              path="/request-logs"
              element={page(
                "request_log.read",
                adminAndTenant,
                <ResourcePage
                  title="请求日志"
                  endpoint="/api/admin/request-logs"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["user_id", "客户账号", "select", "/api/admin/users", "email"],
                    ["request_id", "请求编号"],
                    ["source", "来源"],
                    ["public_model_code", "模型"],
                    ["status", "状态"],
                    ["total_tokens", "Token 数"],
                    ["actual_cost_amount", "实际消耗"],
                    ["latency_ms", "延迟"],
                    ["created_at", "创建时间"]
                  ]}
                  detailFields={[
                    ["tenant_id", "租户"],
                    ["project_id", "项目"],
                    ["user_id", "客户账号"],
                    ["api_key_id", "API Key"],
                    ["request_id", "请求编号"],
                    ["source", "来源"],
                    ["public_model_code", "模型"],
                    ["stream", "流式", "boolean"],
                    ["status", "状态"],
                    ["prompt_tokens", "输入 Tokens"],
                    ["completion_tokens", "输出 Tokens"],
                    ["total_tokens", "总 Tokens"],
                    ["actual_cost_amount", "实际消耗", "money"],
                    ["currency", "币种"],
                    ["latency_ms", "延迟"],
                    ["finish_reason", "结束原因"],
                    ["error_code", "错误码"],
                    ["error_message", "错误信息"],
                    ["created_at", "创建时间"]
                  ]}
                />
              )}
            />
            <Route
              path="/provider-request-attempts"
              element={page(
                "request_log.read",
                adminAndTenant,
                <ResourcePage
                  title="上游调用尝试"
                  endpoint="/api/admin/provider-request-attempts"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["request_log_id", "请求日志"],
                    ["provider_id", "Provider", "select", "/api/admin/options/providers", "label"],
                    ["route_id", "路由"],
                    ["provider_model_code", "上游模型"],
                    ["attempt_no", "尝试次数"],
                    ["status", "状态"],
                    ["latency_ms", "延迟"],
                    ["error_code", "错误码"],
                    ["created_at", "创建时间"]
                  ]}
                  detailFields={[
                    ["tenant_id", "租户"],
                    ["project_id", "项目"],
                    ["request_log_id", "请求日志"],
                    ["provider_id", "Provider"],
                    ["route_id", "路由"],
                    ["provider_request_id", "上游请求编号"],
                    ["provider_model_code", "上游模型"],
                    ["attempt_no", "尝试次数"],
                    ["status", "状态"],
                    ["latency_ms", "延迟"],
                    ["prompt_tokens", "输入 Tokens"],
                    ["completion_tokens", "输出 Tokens"],
                    ["total_tokens", "总 Tokens"],
                    ["provider_cost_amount", "上游成本", "money"],
                    ["error_code", "错误码"],
                    ["error_message", "错误信息"],
                    ["created_at", "创建时间"]
                  ]}
                />
              )}
            />
            <Route path="/configs" element={page("config.read", adminOnly, <ConfigPage canWrite={can("config.write")} canPublish={can("config.publish")} />)} />
            <Route
              path="/app-releases"
              element={page(
                "config.read",
                adminOnly,
                <ResourcePage
                  title="App 版本下载"
                  description="管理 Web 首页展示的 iOS / Android 下载入口。这里只配置版本、渠道、下载地址和更新策略；真实 App Store/TestFlight/官网 APK 文件仍由对应发布平台或对象存储托管。"
                  endpoint="/api/admin/app-releases"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["platform", "平台", "select", undefined, undefined, platformOptions],
                    ["distribution_channel", "分发渠道", "select", undefined, undefined, distributionChannelOptions],
                    ["version", "版本号"],
                    ["build_number", "Build"],
                    ["release_status", "状态", "select", undefined, undefined, appReleaseStatusOptions],
                    ["download_url", "下载地址"],
                    ["published_at", "发布时间"]
                  ]}
                  editableFields={[
                    { key: "tenant_id", label: "租户", kind: "select", optionsResource: "tenants", remoteSearch: true, required: true },
                    { key: "platform", label: "平台", kind: "select", options: platformOptions.filter((item) => item.value === "ios" || item.value === "android"), required: true },
                    { key: "project_id", label: "项目", kind: "select", optionsResource: "tenant-projects", dependsOn: ["tenant_id", "platform"], remoteSearch: true },
                    { key: "distribution_channel", label: "分发渠道", kind: "select", optionsResource: "distribution-channels", dependsOn: ["platform"], required: true },
                    { key: "version", label: "版本号", required: true },
                    { key: "build_number", label: "Build", kind: "number" },
                    { key: "release_status", label: "状态", kind: "select", options: appReleaseStatusOptions, required: true },
                    { key: "min_supported_version", label: "最低支持版本" },
                    { key: "force_update", label: "强制更新", kind: "boolean" },
                    { key: "download_url", label: "下载地址", kind: "url", required: true },
                    { key: "changelog", label: "更新说明", kind: "textarea" },
                    { key: "file_size_bytes", label: "文件大小 Bytes", kind: "number" },
                    { key: "checksum_sha256", label: "SHA-256" },
                    { key: "published_at", label: "发布时间 ISO", kind: "datetime" }
                  ]}
                  canCreate={can("config.write")}
                  canEdit={can("config.write")}
                />
              )}
            />
            <Route
              path="/policy-documents"
              element={page(
                "config.read",
                adminOnly,
                <ResourcePage
                  title="协议政策"
                  endpoint="/api/admin/policy-documents"
                  rowKey="id"
                  columns={[
                    ["policy_type", "政策类型"],
                    ["variant", "版本变体"],
                    ["title", "标题"],
                    ["status", "状态"],
                    ["version", "版本号"],
                    ["effective_at", "生效时间"],
                    ["updated_at", "更新时间"]
                  ]}
                  editableFields={[
                    ["policy_type", "政策类型"],
                    ["variant", "版本变体"],
                    ["title", "标题"],
                    ["content", "正文"],
                    ["status", "状态"],
                    ["version", "版本号", "number"],
                    ["effective_at", "生效时间 ISO"]
                  ]}
                  canCreate={can("config.write")}
                  canEdit={can("config.write")}
                />
              )}
            />
            <Route
              path="/content-reports"
              element={page(
                "audit.read",
                adminOnly,
                <ResourcePage
                  title="内容举报"
                  endpoint="/api/admin/content-reports"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["user_id", "客户账号", "select", "/api/admin/users", "email"],
                    ["target_type", "目标类型"],
                    ["reason", "举报原因"],
                    ["description", "描述"],
                    ["status", "状态"],
                    ["created_at", "创建时间"]
                  ]}
                  editableFields={[
                    ["status", "状态"]
                  ]}
                  canEdit={can("audit.read")}
                />
              )}
            />
            <Route
              path="/account-deletion-requests"
              element={page(
                "audit.read",
                adminOnly,
                <ResourcePage
                  title="账号注销申请"
                  endpoint="/api/admin/account-deletion-requests"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["user_id", "客户账号", "select", "/api/admin/users", "email"],
                    ["requested_from", "来源端"],
                    ["status", "状态"],
                    ["balance_policy", "余额处理规则"],
                    ["created_at", "创建时间"],
                    ["processed_at", "处理时间"]
                  ]}
                  editableFields={[
                    ["status", "状态"],
                    ["balance_policy", "余额处理规则"]
                  ]}
                  canEdit={can("audit.read")}
                />
              )}
            />
            <Route
              path="/risk-events"
              element={page(
                "audit.read",
                adminOnly,
                <ResourcePage
                  title="风控事件"
                  endpoint="/api/admin/risk-events"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["event_type", "风控类型"],
                    ["risk_level", "风控等级"],
                    ["subject_type", "主体类型"],
                    ["subject_id", "主体 ID"],
                    ["ip_address", "IP"],
                    ["distribution_channel", "分发渠道"],
                    ["created_at", "创建时间"]
                  ]}
                  detailFields={[
                    ["tenant_id", "租户"],
                    ["project_id", "项目"],
                    ["user_id", "用户"],
                    ["event_type", "事件类型"],
                    ["risk_type", "风控类型"],
                    ["risk_level", "风控等级"],
                    ["subject_type", "主体类型"],
                    ["subject_id", "主体 ID"],
                    ["ip_address", "IP"],
                    ["device_id", "设备 ID"],
                    ["distribution_channel", "分发渠道"],
                    ["metadata", "扩展信息", "json"],
                    ["created_at", "创建时间"]
                  ]}
                />
              )}
            />
            <Route
              path="/audit-logs"
              element={page(
                "audit.read",
                adminOnly,
                <ResourcePage
                  title="审计日志"
                  endpoint="/api/admin/audit-logs"
                  rowKey="id"
                  columns={[
                    ["action", "动作"],
                    ["target_type", "目标类型"],
                    ["target_id", "目标 ID"],
                    ["ip", "IP"],
                    ["approval_no", "原因/审批号"],
                    ["created_at", "时间"]
                  ]}
                  detailFields={[
                    ["actor_user_id", "操作人"],
                    ["action", "动作"],
                    ["target_type", "目标类型"],
                    ["target_id", "目标 ID"],
                    ["ip", "IP"],
                    ["user_agent", "User Agent"],
                    ["approval_no", "原因/审批号"],
                    ["created_at", "时间"]
                  ]}
                />
              )}
            />
            <Route path="*" element={<Navigate to={defaultPath} replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  const { mode, setMode, effectiveTheme } = useAdminTheme();

  return (
    <ConfigProvider
      theme={{
        algorithm: effectiveTheme === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: "#2563eb",
          borderRadius: 6,
          fontSize: 13
        },
        components: {
          Table: {
            cellPaddingBlock: 9,
            cellPaddingInline: 10
          },
          Card: {
            borderRadiusLG: 8
          }
        }
      }}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Shell themeMode={mode} setThemeMode={setMode} effectiveTheme={effectiveTheme} />
            </RequireAuth>
          }
        />
      </Routes>
    </ConfigProvider>
  );
}
