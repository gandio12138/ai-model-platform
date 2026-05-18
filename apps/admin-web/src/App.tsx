import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { AdminSessionUser } from "@ai-platform/shared-types";
import { Button, ConfigProvider, Layout, Menu, Segmented, Tag, Typography, theme as antdTheme } from "antd";
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
  PayCircleOutlined,
  SettingOutlined,
  TeamOutlined,
  WalletOutlined
} from "@ant-design/icons";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import LoginPage from "./pages/LoginPage.js";
import DashboardPage from "./pages/DashboardPage.js";
import ResourcePage from "./pages/ResourcePage.js";
import WalletPage from "./pages/WalletPage.js";
import PaymentOrdersPage from "./pages/PaymentOrdersPage.js";
import ProviderPage from "./pages/ProviderPage.js";
import ConfigPage from "./pages/ConfigPage.js";
import ApiKeysPage from "./pages/ApiKeysPage.js";
import TenantInvoicesPage from "./pages/TenantInvoicesPage.js";
import TenantAccountsPage from "./pages/TenantAccountsPage.js";
import { clearSession, getSessionUser, getToken } from "./api.js";

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
  { value: "alipay_web", label: "支付宝网页支付" },
  { value: "wechat_native", label: "微信 Native 支付" },
  { value: "card_checkout", label: "银行卡/信用卡托管收银台" },
  { value: "enterprise_transfer", label: "企业对公转账" }
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
  { value: "subscription_usage", label: "订阅 + 用量" },
  { value: "prepaid", label: "预付费" },
  { value: "postpaid", label: "后付费" },
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

const pricingModeOptions = [
  { value: "contract_price", label: "合同价" },
  { value: "cost_plus", label: "成本加价" },
  { value: "fixed_margin", label: "固定毛利" }
];

const revenueShareStatusOptions = [
  { value: "pending", label: "待结算" },
  { value: "settled", label: "已结算" },
  { value: "reversed", label: "已冲正" }
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
      { key: "/tenant-memberships", icon: <TeamOutlined />, label: "租户账号", permission: "platform.tenant.read_all", accountTypes: adminOnly },
      { key: "/tenant-projects", icon: <DeploymentUnitOutlined />, label: "项目管理", permission: "tenant.project.read", accountTypes: adminAndTenant },
      { key: "/tenant-customers", icon: <TeamOutlined />, label: "客户账号", permission: "tenant.customer.read", accountTypes: adminAndTenant },
      { key: "/api-keys", icon: <KeyOutlined />, label: "API Key", permission: "api_key.read", accountTypes: adminAndTenant }
    ]
  },
  {
    key: "saas-billing",
    icon: <BankOutlined />,
    label: "SaaS 计费",
    children: [
      { key: "/tenant-plans", icon: <BankOutlined />, label: "套餐配置", permission: "tenant.billing.read", accountTypes: adminOnly },
      { key: "/tenant-subscriptions", icon: <FileTextOutlined />, label: "订阅管理", permission: "tenant.billing.read", accountTypes: adminOnly },
      { key: "/tenant-invoices", icon: <FileTextOutlined />, label: "租户账单", permission: "tenant.billing.read", accountTypes: adminAndTenant },
      { key: "/tenant-billing-rules", icon: <ControlOutlined />, label: "计费规则", permission: "tenant.billing.read", accountTypes: adminOnly },
      { key: "/tenant-usage-aggregates", icon: <FileSearchOutlined />, label: "用量汇总", permission: "tenant.billing.read", accountTypes: adminAndTenant },
      { key: "/tenant-revenue-shares", icon: <PayCircleOutlined />, label: "分成结算", permission: "tenant.billing.read", accountTypes: adminOnly }
    ]
  },
  {
    key: "model-supply",
    icon: <ApiOutlined />,
    label: "模型供给",
    children: [
      { key: "/providers", icon: <DeploymentUnitOutlined />, label: "Provider", permission: "provider.read", accountTypes: adminOnly },
      { key: "/models", icon: <ApiOutlined />, label: "模型目录", permission: "model.read", accountTypes: adminOnly },
      { key: "/model-prices", icon: <BankOutlined />, label: "平台价格", permission: "price.read", accountTypes: adminOnly },
      { key: "/model-routes", icon: <DeploymentUnitOutlined />, label: "模型路由", permission: "route.read", accountTypes: adminOnly },
      { key: "/tenant-model-authorizations", icon: <ApiOutlined />, label: "租户授权", permission: "tenant.model.read", accountTypes: adminAndTenant },
      { key: "/tenant-model-prices", icon: <BankOutlined />, label: "租户价格", permission: "tenant.model.read", accountTypes: adminAndTenant }
    ]
  },
  {
    key: "payment-fund",
    icon: <PayCircleOutlined />,
    label: "支付资金",
    children: [
      { key: "/payment-orders", icon: <PayCircleOutlined />, label: "支付订单", permission: "payment.read", accountTypes: adminAndTenant },
      { key: "/payment-products", icon: <BankOutlined />, label: "商品配置", permission: "payment.read", accountTypes: adminOnly },
      { key: "/payment-channels", icon: <ControlOutlined />, label: "渠道配置", permission: "payment.read", accountTypes: adminOnly },
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
      { key: "/configs", icon: <SettingOutlined />, label: "配置发布", permission: "config.read", accountTypes: adminOnly },
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
  const user = getSessionUser() as AdminSessionUser | null;
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
            <Tag color="red" className="env-tag">DEV</Tag>
            <span className="header-hint">本地开发环境</span>
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
                  endpoint="/api/admin/tenants"
                  rowKey="id"
                  columns={[
                    ["tenant_code", "租户编码"],
                    ["name", "租户名称"],
                    ["tenant_type", "租户类型"],
                    ["billing_mode", "计费模式"],
                    ["current_plan_code", "当前套餐"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["created_at", "创建时间"]
                  ]}
                  editableFields={[
                    ["tenant_code", "租户编码"],
                    ["name", "租户名称"],
                    ["tenant_type", "租户类型"],
                    ["billing_mode", "计费模式"],
                    ["current_plan_code", "当前套餐"],
                    ["credit_limit", "授信额度，单位分", "number"],
                    ["prepaid_balance", "预付余额，单位分", "number"],
                    ["monthly_budget", "月预算，单位分", "number"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["settings", "租户设置 JSON", "json"]
                  ]}
                  canCreate={can("platform.tenant.write_all")}
                  canEdit={can("platform.tenant.write_all")}
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
                adminAndTenant,
                <ResourcePage
                  title="项目管理"
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
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["payment_policy", "支付策略 JSON", "json"],
                    ["metadata", "扩展信息 JSON", "json"]
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
                  title="租户客户"
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
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["source_project_id", "来源项目", "select", "/api/admin/tenant-projects", "name"],
                    ["user_id", "客户账号", "select", "/api/admin/users?account_type=customer", "email"],
                    ["customer_code", "客户编码"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["metadata", "扩展信息 JSON", "json"]
                  ]}
                  canCreate={can("tenant.customer.write")}
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
                  endpoint="/api/admin/tenant-plans"
                  rowKey="id"
                  columns={[
                    ["plan_code", "套餐编码"],
                    ["name", "套餐名称"],
                    ["billing_cycle", "计费周期", "select", undefined, undefined, billingCycleOptions],
                    ["base_fee_amount", "基础服务费，单位分"],
                    ["included_credit", "包含抵扣额度，单位分"],
                    ["included_token_budget", "包含 Token 预算"],
                    ["support_level", "支持等级"],
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  editableFields={[
                    ["plan_code", "套餐编码"],
                    ["name", "套餐名称"],
                    ["billing_cycle", "计费周期", "select", undefined, undefined, billingCycleOptions],
                    ["base_fee_amount", "基础服务费，单位分", "number"],
                    ["currency", "币种"],
                    ["included_credit", "包含抵扣额度，单位分", "number"],
                    ["included_token_budget", "包含 Token 预算", "number"],
                    ["max_projects", "项目数上限", "number"],
                    ["max_customers", "客户数上限", "number"],
                    ["max_members", "成员数上限", "number"],
                    ["log_retention_days", "日志保留天数", "number"],
                    ["support_level", "支持等级"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["metadata", "扩展信息 JSON", "json"]
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
                    ["base_fee_amount", "基础服务费，单位分", "number"],
                    ["included_credit", "包含抵扣额度，单位分", "number"],
                    ["metadata", "扩展信息 JSON", "json"]
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
                    ["base_fee_amount", "基础服务费，单位分"],
                    ["min_commit_amount", "最低消费，单位分"],
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  editableFields={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["rule_code", "规则编码"],
                    ["rule_version", "版本"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["billing_mode", "计费模式", "select", undefined, undefined, billingModeOptions],
                    ["price_type", "计价方式", "select", undefined, undefined, priceTypeOptions],
                    ["base_fee_amount", "基础服务费，单位分", "number"],
                    ["included_credit", "包含抵扣额度，单位分", "number"],
                    ["included_token_budget", "包含 Token 预算", "number"],
                    ["min_commit_amount", "最低消费，单位分", "number"],
                    ["cost_plus_markup_rate", "成本加价率"],
                    ["min_margin_multiplier", "最低毛利倍率"],
                    ["revenue_share_rate", "收入分成比例"],
                    ["revenue_share_base", "收入分成基准"],
                    ["payment_service_fee_rate", "支付服务费率"],
                    ["effective_from", "生效开始 ISO"],
                    ["effective_to", "生效结束 ISO"],
                    ["metadata", "扩展信息 JSON", "json"]
                  ]}
                  canCreate={can("tenant.billing.write")}
                  canEdit={can("tenant.billing.write")}
                />
              )}
            />
            <Route
              path="/tenant-model-authorizations"
              element={page(
                "tenant.model.read",
                adminAndTenant,
                <ResourcePage
                  title="租户模型授权"
                  endpoint="/api/admin/tenant-model-authorizations"
                  rowKey="id"
                  columns={[
                    ["tenant_name", "租户"],
                    ["public_model_code", "模型"],
                    ["model_display_name", "展示名"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["max_context_tokens", "上下文上限"],
                    ["rpm_limit", "RPM"],
                    ["tpm_limit", "TPM"],
                    ["monthly_budget", "月预算，单位分"]
                  ]}
                  editableFields={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["model_id", "模型", "select", "/api/admin/models", "public_model_code"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["max_context_tokens", "上下文上限", "number"],
                    ["rpm_limit", "RPM", "number"],
                    ["tpm_limit", "TPM", "number"],
                    ["daily_budget", "日预算，单位分", "number"],
                    ["monthly_budget", "月预算，单位分", "number"],
                    ["metadata", "扩展信息 JSON", "json"]
                  ]}
                  canCreate={can("tenant.model.write")}
                  canEdit={can("tenant.model.write")}
                />
              )}
            />
            <Route
              path="/tenant-model-prices"
              element={page(
                "tenant.model.read",
                adminAndTenant,
                <ResourcePage
                  title="租户模型价格"
                  endpoint="/api/admin/tenant-model-prices"
                  rowKey="id"
                  columns={[
                    ["tenant_name", "租户"],
                    ["public_model_code", "模型"],
                    ["model_display_name", "展示名"],
                    ["price_version", "价格版本"],
                    ["pricing_mode", "计价模式", "select", undefined, undefined, pricingModeOptions],
                    ["input_price_per_1k", "输入/1K，单位分"],
                    ["output_price_per_1k", "输出/1K，单位分"],
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  editableFields={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["model_id", "模型", "select", "/api/admin/models", "public_model_code"],
                    ["price_version", "价格版本"],
                    ["currency", "币种"],
                    ["pricing_mode", "计价模式", "select", undefined, undefined, pricingModeOptions],
                    ["input_price_per_1k", "输入/1K，单位分", "number"],
                    ["output_price_per_1k", "输出/1K，单位分", "number"],
                    ["min_margin_multiplier", "最低毛利倍率"],
                    ["cost_plus_markup_rate", "成本加价率"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["effective_from", "生效开始 ISO"],
                    ["effective_to", "生效结束 ISO"],
                    ["metadata", "扩展信息 JSON", "json"]
                  ]}
                  canCreate={can("tenant.model.write")}
                  canEdit={can("tenant.model.write")}
                />
              )}
            />
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
                    ["provider_cost_amount", "供应商成本，单位分"],
                    ["tenant_wholesale_amount", "租户批发价，单位分"],
                    ["end_user_revenue_amount", "客户付款金额，单位分"]
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
                    ["payment_gross_amount", "付款总额，单位分"],
                    ["payment_channel_fee", "支付通道费，单位分"],
                    ["platform_share_amount", "平台分成，单位分"],
                    ["tenant_share_amount", "租户分成，单位分"],
                    ["revenue_share_rate", "分成比例"]
                  ]}
                  editableFields={[
                    ["status", "状态", "select", undefined, undefined, revenueShareStatusOptions],
                    ["settled_at", "结算时间 ISO"],
                    ["reversed_at", "冲正时间 ISO"],
                    ["metadata", "扩展信息 JSON", "json"]
                  ]}
                  canEdit={can("tenant.billing.write")}
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
              path="/payment-products"
              element={page(
                "payment.read",
                adminOnly,
                <ResourcePage
                  title="支付商品"
                  endpoint="/api/admin/payment/products"
                  rowKey="id"
                  columns={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["product_code", "商品编码"],
                    ["name", "名称"],
                    ["product_type", "类型"],
                    ["face_value_amount", "面值"],
                    ["bonus_amount", "赠送"],
                    ["sale_amount", "售价"],
                    ["status", "状态"]
                  ]}
                  editableFields={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["product_code", "商品编码"],
                    ["name", "名称"],
                    ["product_type", "类型"],
                    ["face_value_amount", "面值分"],
                    ["bonus_amount", "赠送分"],
                    ["sale_amount", "售价分"],
                    ["status", "状态"]
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
                    ["enabled", "启用"]
                  ]}
                  editableFields={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
                    ["channel_code", "渠道编码"],
                    ["channel_type", "渠道类型"],
                    ["display_name", "展示名"],
                    ["platform", "平台", "select", undefined, undefined, platformOptions],
                    ["payment_method", "支付方式", "select", undefined, undefined, paymentMethodOptions],
                    ["settlement_mode", "结算方式", "select", undefined, undefined, settlementModeOptions],
                    ["fee_rate_bps", "通道费率 BPS", "number"],
                    ["sort_order", "排序", "number"],
                    ["enabled", "启用"],
                    ["config", "配置 JSON", "json"]
                  ]}
                  canCreate={can("payment.reconcile")}
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
                adminOnly,
                <ResourcePage
                  title="模型目录"
                  endpoint="/api/admin/models"
                  rowKey="id"
                  columns={[
                    ["public_model_code", "公开模型名"],
                    ["display_name", "展示名"],
                    ["model_family", "模型族"],
                    ["max_context_tokens", "上下文"],
                    ["supports_stream", "Stream"],
                    ["supports_tools", "Tools"],
                    ["status", "状态"]
                  ]}
                  editableFields={[
                    ["public_model_code", "公开模型名"],
                    ["display_name", "展示名"],
                    ["model_family", "模型族"],
                    ["max_context_tokens", "上下文"],
                    ["default_max_output_tokens", "默认输出"],
                    ["supports_stream", "支持 Stream"],
                    ["supports_tools", "支持 Tools"],
                    ["supports_json_mode", "支持 JSON"],
                    ["status", "状态"]
                  ]}
                  canCreate={can("model.write")}
                  canEdit={can("model.write")}
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
                  endpoint="/api/admin/model-prices"
                  rowKey="id"
                  columns={[
                    ["model_id", "模型", "select", "/api/admin/models", "public_model_code"],
                    ["price_version", "版本"],
                    ["currency", "币种"],
                    ["input_price_per_1k", "输入/1K"],
                    ["output_price_per_1k", "输出/1K"],
                    ["reserve_multiplier", "预留倍率"],
                    ["status", "状态"]
                  ]}
                  editableFields={[
                    ["model_id", "模型", "select", "/api/admin/models", "public_model_code"],
                    ["price_version", "版本"],
                    ["currency", "币种"],
                    ["input_price_per_1k", "输入/1K"],
                    ["output_price_per_1k", "输出/1K"],
                    ["reserve_multiplier", "预留倍率"],
                    ["status", "状态"]
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
                    ["provider_id", "Provider", "select", "/api/admin/providers", "name"],
                    ["provider_model_code", "上游模型"],
                    ["weight", "权重"],
                    ["priority", "优先级"],
                    ["enabled", "启用"]
                  ]}
                  editableFields={[
                    ["route_code", "路由编码"],
                    ["model_id", "模型", "select", "/api/admin/models", "public_model_code"],
                    ["provider_id", "Provider", "select", "/api/admin/providers", "name"],
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
                />
              )}
            />
            <Route path="/configs" element={page("config.read", adminOnly, <ConfigPage canWrite={can("config.write")} canPublish={can("config.publish")} />)} />
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
