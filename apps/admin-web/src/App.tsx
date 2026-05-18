import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { ReactElement } from "react";
import { Button, Layout, Menu, Tag, Typography } from "antd";
import {
  ApiOutlined,
  AuditOutlined,
  BankOutlined,
  ControlOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  FileSearchOutlined,
  PayCircleOutlined,
  SettingOutlined,
  TeamOutlined,
  WalletOutlined
} from "@ant-design/icons";
import { LogOut } from "lucide-react";
import LoginPage from "./pages/LoginPage.js";
import DashboardPage from "./pages/DashboardPage.js";
import ResourcePage from "./pages/ResourcePage.js";
import WalletPage from "./pages/WalletPage.js";
import PaymentOrdersPage from "./pages/PaymentOrdersPage.js";
import ProviderPage from "./pages/ProviderPage.js";
import ConfigPage from "./pages/ConfigPage.js";
import { clearSession, getSessionUser, getToken } from "./api.js";

const { Header, Sider, Content } = Layout;

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

const menuItems = [
  { key: "/dashboard", icon: <DashboardOutlined />, label: "仪表盘" },
  { key: "/tenants", icon: <TeamOutlined />, label: "租户管理" },
  { key: "/tenant-memberships", icon: <TeamOutlined />, label: "租户成员" },
  { key: "/tenant-projects", icon: <DeploymentUnitOutlined />, label: "项目管理" },
  { key: "/tenant-customers", icon: <TeamOutlined />, label: "租户客户" },
  { key: "/users", icon: <TeamOutlined />, label: "全局账号" },
  { key: "/wallet-ledger", icon: <WalletOutlined />, label: "钱包流水" },
  { key: "/payment-orders", icon: <PayCircleOutlined />, label: "支付订单" },
  { key: "/payment-products", icon: <BankOutlined />, label: "支付商品" },
  { key: "/payment-channels", icon: <ControlOutlined />, label: "支付渠道" },
  { key: "/providers", icon: <DeploymentUnitOutlined />, label: "Provider 管理" },
  { key: "/models", icon: <ApiOutlined />, label: "模型目录" },
  { key: "/model-prices", icon: <BankOutlined />, label: "模型价格" },
  { key: "/model-routes", icon: <DeploymentUnitOutlined />, label: "模型路由" },
  { key: "/request-logs", icon: <FileSearchOutlined />, label: "请求日志" },
  { key: "/configs", icon: <SettingOutlined />, label: "配置发布" },
  { key: "/audit-logs", icon: <AuditOutlined />, label: "审计日志" }
];

function RequireAuth({ children }: { children: ReactElement }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getSessionUser();

  return (
    <Layout className="admin-shell">
      <Sider width={236} theme="light" className="admin-sider">
        <div className="brand">
          <div className="brand-mark">AI</div>
          <div>
            <Typography.Text strong>AI Model Platform</Typography.Text>
            <div className="brand-subtitle">Management Console</div>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
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
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route
              path="/tenants"
              element={
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
                  canCreate
                />
              }
            />
            <Route
              path="/tenant-memberships"
              element={
                <ResourcePage
                  title="租户成员"
                  endpoint="/api/admin/tenant-memberships"
                  rowKey="id"
                  columns={[
                    ["tenant_name", "租户"],
                    ["member_email", "成员账号"],
                    ["role_code", "租户角色"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["created_at", "创建时间"]
                  ]}
                  editableFields={[
                    ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
                    ["user_id", "成员账号", "select", "/api/admin/users?user_type=admin", "email"],
                    ["role_code", "租户角色"],
                    ["status", "状态", "select", undefined, undefined, statusOptions]
                  ]}
                  canCreate
                />
              }
            />
            <Route
              path="/tenant-projects"
              element={
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
                  canCreate
                />
              }
            />
            <Route
              path="/tenant-customers"
              element={
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
                    ["user_id", "客户账号", "select", "/api/admin/users?exclude_user_type=admin", "email"],
                    ["customer_code", "客户编码"],
                    ["status", "状态", "select", undefined, undefined, statusOptions],
                    ["metadata", "扩展信息 JSON", "json"]
                  ]}
                  canCreate
                />
              }
            />
            <Route
              path="/users"
              element={
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
                  editableFields={[
                    ["status", "状态"],
                    ["user_type", "用户类型"]
                  ]}
                />
              }
            />
            <Route path="/wallet-ledger" element={<WalletPage />} />
            <Route path="/payment-orders" element={<PaymentOrdersPage />} />
            <Route
              path="/payment-products"
              element={
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
                  canCreate
                />
              }
            />
            <Route
              path="/payment-channels"
              element={
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
                  canCreate
                />
              }
            />
            <Route path="/providers" element={<ProviderPage />} />
            <Route
              path="/models"
              element={
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
                  canCreate
                />
              }
            />
            <Route
              path="/model-prices"
              element={
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
                  canCreate
                />
              }
            />
            <Route
              path="/model-routes"
              element={
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
                  canCreate
                />
              }
            />
            <Route
              path="/request-logs"
              element={
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
              }
            />
            <Route path="/configs" element={<ConfigPage />} />
            <Route
              path="/audit-logs"
              element={
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
              }
            />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
