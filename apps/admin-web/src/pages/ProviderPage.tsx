import { Button, Form, Input, InputNumber, Modal, Select, Space, message } from "antd";
import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiList, apiFetch } from "../api.js";
import ResourcePage from "./ResourcePage.js";

export default function ProviderPage() {
  const [open, setOpen] = useState(false);
  const [providerOptions, setProviderOptions] = useState<{ label: string; value: string }[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    apiFetch<ApiList>("/api/admin/providers?pageSize=100")
      .then((res) =>
        setProviderOptions(
          res.data.map((provider) => ({ value: provider.id, label: provider.name ?? provider.code }))
        )
      )
      .catch((error) => message.error((error as Error).message));
  }, []);

  async function submit(values: any) {
    try {
      await apiFetch(`/api/admin/providers/${values.provider_id}/credentials`, {
        method: "POST",
        body: JSON.stringify(values)
      });
      message.success("密钥已加密保存，不会再次明文展示");
      setOpen(false);
      form.resetFields();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <>
      <div className="action-bar">
        <Button type="primary" icon={<KeyRound size={16} />} onClick={() => setOpen(true)}>
          添加 Provider 密钥
        </Button>
      </div>
      <ResourcePage
        title="Provider 管理"
        endpoint="/api/admin/providers"
        rowKey="id"
        columns={[
          ["code", "编码"],
          ["name", "名称"],
          ["provider_type", "类型"],
          ["region", "区域"],
          ["status", "状态"],
          ["health_status", "健康状态"],
          ["health_score", "健康分"],
          ["monthly_budget", "月预算"]
        ]}
        editableFields={[
          ["code", "编码"],
          ["name", "名称"],
          ["provider_type", "类型"],
          ["base_url", "Base URL"],
          ["region", "区域"],
          ["legal_scope", "合规范围"],
          ["status", "状态"],
          ["cost_currency", "成本币种"],
          ["monthly_budget", "月预算分"],
          ["rpm_limit", "RPM"],
          ["tpm_limit", "TPM"],
          ["timeout_ms", "超时 ms"],
          ["retry_count", "重试次数"],
          ["health_status", "健康状态"],
          ["health_score", "健康分"],
          ["metadata", "元数据 JSON", "json"]
        ]}
        canCreate
      />
      <ResourcePage
        title="Provider 密钥"
        endpoint="/api/admin/provider-credentials"
        rowKey="id"
        columns={[
          ["provider_id", "Provider ID"],
          ["name", "名称"],
          ["credential_type", "类型"],
          ["secret_last4", "last4"],
          ["status", "状态"],
          ["rpm_limit", "RPM"],
          ["tpm_limit", "TPM"],
          ["last_used_at", "最后使用"]
        ]}
      />
      <Modal title="添加 Provider 密钥" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item label="Provider ID" name="provider_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={providerOptions} />
          </Form.Item>
          <Form.Item label="密钥名称" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="密钥类型" name="credential_type" initialValue="api_key">
            <Input />
          </Form.Item>
          <Form.Item label="Secret" name="secret" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Space>
            <Form.Item label="RPM" name="rpm_limit">
              <InputNumber />
            </Form.Item>
            <Form.Item label="TPM" name="tpm_limit">
              <InputNumber />
            </Form.Item>
          </Space>
          <Button type="primary" htmlType="submit">
            加密保存
          </Button>
        </Form>
      </Modal>
    </>
  );
}
