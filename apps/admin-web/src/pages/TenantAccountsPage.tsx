import { Button, Drawer, Form, Input, Select, Space, message } from "antd";
import { Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiList, apiFetch } from "../api";
import ResourcePage from "./ResourcePage";

type Option = { label: string; value: string };

const statusOptions = [
  { value: "active", label: "启用" },
  { value: "suspended", label: "停用" }
];

export default function TenantAccountsPage() {
  const [open, setOpen] = useState(false);
  const [tenantOptions, setTenantOptions] = useState<Option[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form] = Form.useForm();

  useEffect(() => {
    apiFetch<ApiList>("/api/admin/tenants?pageSize=100")
      .then((res) =>
        setTenantOptions(
          res.data.map((tenant) => ({ value: tenant.id, label: tenant.name ?? tenant.tenant_code ?? tenant.id }))
        )
      )
      .catch((error) => message.error((error as Error).message));
  }, []);

  async function submit(values: Record<string, unknown>) {
    try {
      await apiFetch("/api/admin/tenant-accounts", {
        method: "POST",
        body: JSON.stringify(values)
      });
      message.success("租户账号已创建并绑定租户");
      form.resetFields();
      setOpen(false);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <>
      <div className="action-bar">
        <Space>
          <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            创建租户账号
          </Button>
        </Space>
      </div>
      <ResourcePage
        key={refreshKey}
        title="租户账号列表"
        endpoint="/api/admin/tenant-memberships"
        rowKey="id"
        columns={[
          ["tenant_name", "租户"],
          ["member_email", "租户账号"],
          ["member_user_type", "账号类型"],
          ["role_code", "账号类型"],
          ["status", "状态", "select", undefined, undefined, statusOptions],
          ["created_at", "创建时间"]
        ]}
        editableFields={[
          ["status", "状态", "select", undefined, undefined, statusOptions]
        ]}
        canEdit
      />
      <Drawer title="创建租户账号" width={560} open={open} onClose={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ status: "active" }}>
          <Form.Item label="绑定租户" name="tenant_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={tenantOptions} />
          </Form.Item>
          <Form.Item label="邮箱" name="email" rules={[{ required: true }, { type: "email" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="初始密码" name="password" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}>
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item label="操作原因" name="reason">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<Save size={16} />}>
            创建并绑定
          </Button>
        </Form>
      </Drawer>
    </>
  );
}
