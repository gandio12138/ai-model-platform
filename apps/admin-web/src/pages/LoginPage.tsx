import { Button, Card, Form, Input, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import { apiFetch, setSession } from "../api";

export default function LoginPage() {
  const navigate = useNavigate();

  async function onFinish(values: { email: string; password: string }) {
    try {
      const res = await apiFetch<{ token: string; user: unknown }>("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify(values)
      });
      setSession(res.token, res.user);
      navigate("/dashboard");
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-copy">
          <div className="brand-mark large">AI</div>
          <Typography.Title level={1}>AI Model Platform</Typography.Title>
          <Typography.Paragraph>
            Provider、模型路由、钱包账本、支付订单和审计日志的统一管理后台。
          </Typography.Paragraph>
        </div>
        <Card className="login-card">
          <Typography.Title level={3}>管理后台登录</Typography.Title>
          <Form layout="vertical" onFinish={onFinish} initialValues={{ email: "admin@example.com" }}>
            <Form.Item label="邮箱" name="email" rules={[{ required: true }]}>
              <Input autoComplete="email" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button htmlType="submit" type="primary" block>
              登录
            </Button>
          </Form>
          <div className="login-default">默认账号：admin@example.com / Admin123456!</div>
        </Card>
      </div>
    </div>
  );
}
