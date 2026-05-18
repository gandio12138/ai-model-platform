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

const menuItems = [
  { key: "/dashboard", icon: <DashboardOutlined />, label: "仪表盘" },
  { key: "/users", icon: <TeamOutlined />, label: "用户管理" },
  { key: "/customer-assignments", icon: <TeamOutlined />, label: "客户分配" },
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
            <Route
              path="/customer-assignments"
              element={
                <ResourcePage
                  title="客户分配"
                  endpoint="/api/admin/customer-assignments"
                  rowKey="id"
                  columns={[
                    ["admin_email", "后台账号"],
                    ["customer_email", "客户账号"],
                    ["customer_type", "客户类型"],
                    ["status", "状态"],
                    ["scope_note", "备注"],
                    ["created_at", "创建时间"]
                  ]}
                  editableFields={[
                    ["admin_user_id", "后台账号", "select", "/api/admin/users?user_type=admin", "email"],
                    ["customer_user_id", "客户账号", "select", "/api/admin/users?exclude_user_type=admin", "email"],
                    ["status", "状态"],
                    ["scope_note", "备注"]
                  ]}
                  canCreate
                />
              }
            />
            <Route path="/payment-orders" element={<PaymentOrdersPage />} />
            <Route
              path="/payment-products"
              element={
                <ResourcePage
                  title="支付商品"
                  endpoint="/api/admin/payment/products"
                  rowKey="id"
                  columns={[
                    ["product_code", "商品编码"],
                    ["name", "名称"],
                    ["product_type", "类型"],
                    ["face_value_amount", "面值"],
                    ["bonus_amount", "赠送"],
                    ["sale_amount", "售价"],
                    ["status", "状态"]
                  ]}
                  editableFields={[
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
                    ["channel_code", "渠道编码"],
                    ["channel_type", "渠道类型"],
                    ["display_name", "展示名"],
                    ["platform", "平台"],
                    ["enabled", "启用"]
                  ]}
                  editableFields={[
                    ["channel_code", "渠道编码"],
                    ["channel_type", "渠道类型"],
                    ["display_name", "展示名"],
                    ["platform", "平台"],
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
                    ["model_id", "模型 ID"],
                    ["provider_id", "Provider ID"],
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
                    ["request_id", "request_id"],
                    ["source", "来源"],
                    ["public_model_code", "模型"],
                    ["status", "状态"],
                    ["total_tokens", "tokens"],
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
