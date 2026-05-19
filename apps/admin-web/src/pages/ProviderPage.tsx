import { Button, Form, Input, InputNumber, Modal, Select, Space, message } from "antd";
import { KeyRound, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiList, apiFetch } from "../api";
import ResourcePage from "./ResourcePage";

const providerTypeOptions = [
  { value: "aws_bedrock", label: "AWS Bedrock" },
  { value: "openai_compatible", label: "OpenAI-Compatible" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "azure_openai", label: "Azure OpenAI" }
];

const credentialTypeOptions = [
  { value: "bedrock_api_key", label: "AWS Bedrock API Key" },
  { value: "openai_compatible_api_key", label: "OpenAI-Compatible API Key" },
  { value: "anthropic_api_key", label: "Anthropic API Key" },
  { value: "gemini_api_key", label: "Gemini API Key" }
];

export default function ProviderPage({
  canWrite,
  canWriteCredential,
  canSyncModels
}: {
  canWrite: boolean;
  canWriteCredential: boolean;
  canSyncModels: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [providerOptions, setProviderOptions] = useState<{ label: string; value: string }[]>([]);
  const [credentialOptions, setCredentialOptions] = useState<{ label: string; value: string }[]>([]);
  const [credentialForm] = Form.useForm();
  const [syncForm] = Form.useForm();

  function loadOptions() {
    Promise.all([
      apiFetch<ApiList>("/api/admin/providers?pageSize=100"),
      apiFetch<ApiList>("/api/admin/provider-credentials?pageSize=100")
    ])
      .then(([providers, credentials]) => {
        setProviderOptions(
          providers.data.map((provider) => ({ value: provider.id, label: provider.name ?? provider.code }))
        );
        setCredentialOptions(
          credentials.data.map((credential) => ({
            value: credential.id,
            label: `${credential.name} / ${credential.credential_type}`
          }))
        );
      })
      .catch((error) => message.error((error as Error).message));
  }

  useEffect(() => {
    loadOptions();
  }, []);

  async function submitCredential(values: any) {
    try {
      await apiFetch(`/api/admin/providers/${values.provider_id}/credentials`, {
        method: "POST",
        body: JSON.stringify(values)
      });
      message.success("密钥已加密保存，不会再次明文展示");
      setOpen(false);
      credentialForm.resetFields();
      loadOptions();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  async function syncModels(values: any) {
    try {
      const result = await apiFetch<{ synced_count: number }>(`/api/admin/providers/${values.provider_id}/sync-models`, {
        method: "POST",
        body: JSON.stringify(values)
      });
      message.success(`模型同步完成：${result.synced_count} 个模型`);
      setSyncOpen(false);
      syncForm.resetFields();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <>
      {(canWriteCredential || canSyncModels) && (
        <div className="action-bar">
          <Space>
            {canWriteCredential && (
              <Button type="primary" icon={<KeyRound size={16} />} onClick={() => setOpen(true)}>
                添加 Provider 密钥
              </Button>
            )}
            {canSyncModels && (
              <Button icon={<RefreshCw size={16} />} onClick={() => setSyncOpen(true)}>
                同步模型目录
              </Button>
            )}
          </Space>
        </div>
      )}
      <ResourcePage
        title="Provider 管理"
        endpoint="/api/admin/providers"
        rowKey="id"
        columns={[
          ["code", "Provider 编码"],
          ["name", "名称"],
          ["provider_type", "类型", "select", undefined, undefined, providerTypeOptions],
          ["region", "区域"],
          ["status", "状态"],
          ["health_status", "健康状态"],
          ["health_score", "健康分"],
          ["monthly_budget", "月预算"]
        ]}
        editableFields={[
          ["code", "Provider 编码"],
          ["name", "名称"],
          ["provider_type", "类型", "select", undefined, undefined, providerTypeOptions],
          ["base_url", "API Endpoint"],
          ["region", "区域"],
          ["legal_scope", "合规范围"],
          ["status", "状态"],
          ["cost_currency", "成本币种"],
          ["monthly_budget", "月预算分", "number"],
          ["rpm_limit", "RPM", "number"],
          ["tpm_limit", "TPM", "number"],
          ["timeout_ms", "超时 ms", "number"],
          ["retry_count", "重试次数", "number"],
          ["health_status", "健康状态"],
          ["health_score", "健康分", "number"],
          ["metadata", "元数据 JSON", "json"]
        ]}
        canCreate={canWrite}
        canEdit={canWrite}
      />
      <ResourcePage
        title="Provider 密钥"
        endpoint="/api/admin/provider-credentials"
        rowKey="id"
        columns={[
          ["provider_id", "Provider", "select", "/api/admin/providers", "name"],
          ["name", "名称"],
          ["credential_type", "密钥类型", "select", undefined, undefined, credentialTypeOptions],
          ["auth_method", "认证方式"],
          ["aws_region", "AWS 区域"],
          ["secret_last4", "密钥后四位"],
          ["status", "状态"],
          ["rpm_limit", "RPM"],
          ["tpm_limit", "TPM"],
          ["last_used_at", "最后使用"]
        ]}
      />
      <Modal title="添加 Provider 密钥" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form
          form={credentialForm}
          layout="vertical"
          onFinish={submitCredential}
          initialValues={{ credential_type: "bedrock_api_key", auth_method: "api_key", aws_region: "us-east-1" }}
        >
          <Form.Item label="Provider" name="provider_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={providerOptions} />
          </Form.Item>
          <Form.Item label="密钥名称" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="密钥类型" name="credential_type" rules={[{ required: true }]}>
            <Select options={credentialTypeOptions} />
          </Form.Item>
          <Form.Item label="认证方式" name="auth_method" rules={[{ required: true }]}>
            <Select options={[{ value: "api_key", label: "API Key / Bearer Token" }]} />
          </Form.Item>
          <Form.Item label="API Key / Bearer Token" name="secret" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="AWS 区域" name="aws_region">
            <Input placeholder="us-east-1" />
          </Form.Item>
          <Form.Item label="Endpoint，可选" name="endpoint_url">
            <Input placeholder="https://bedrock.us-east-1.amazonaws.com" />
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
      <Modal title="同步模型目录" open={syncOpen} onCancel={() => setSyncOpen(false)} footer={null} destroyOnClose>
        <Form form={syncForm} layout="vertical" onFinish={syncModels}>
          <Form.Item label="Provider" name="provider_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={providerOptions} />
          </Form.Item>
          <Form.Item label="使用的密钥" name="credential_id">
            <Select allowClear showSearch optionFilterProp="label" options={credentialOptions} />
          </Form.Item>
          <Form.Item label="AWS 区域，可选" name="aws_region">
            <Input placeholder="us-east-1" />
          </Form.Item>
          <Form.Item label="操作原因" name="reason">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<RefreshCw size={16} />}>
            开始同步
          </Button>
        </Form>
      </Modal>
    </>
  );
}
