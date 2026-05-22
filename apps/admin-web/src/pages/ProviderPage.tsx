import { Button, Form, Input, InputNumber, Modal, Select, Space, message } from "antd";
import { KeyRound, RefreshCw, TestTube2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiList, apiFetch } from "../api";
import ResourcePage from "./ResourcePage";

const providerTypeOptions = [
  { value: "aws_bedrock", label: "AWS Bedrock" },
  { value: "google_vertex_ai", label: "Google Vertex AI" },
  { value: "openai_compatible", label: "OpenAI-Compatible" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "azure_openai", label: "Azure OpenAI" },
  { value: "vertex_ai", label: "Vertex AI（兼容旧配置）" }
];

const credentialTypeOptions = [
  { value: "iam_role", label: "EC2 / ECS IAM Role" },
  { value: "bedrock_api_key", label: "AWS Bedrock API Key" },
  { value: "iam_access_key", label: "AWS IAM Access Key" },
  { value: "assume_role", label: "AWS Assume Role（预留）" },
  { value: "azure_openai_api_key", label: "Azure OpenAI API Key" },
  { value: "vertex_service_account", label: "Vertex AI Service Account JSON" },
  { value: "vertex_access_token", label: "Vertex AI Access Token（临时调试）" },
  { value: "openai_compatible_api_key", label: "OpenAI-Compatible API Key" },
  { value: "anthropic_api_key", label: "Anthropic API Key" },
  { value: "gemini_api_key", label: "Gemini API Key" }
];

const authMethodOptions = [
  { value: "iam_role", label: "EC2 / ECS IAM Role" },
  { value: "bedrock_api_key", label: "Bedrock API Key" },
  { value: "iam_access_key", label: "IAM Access Key" },
  { value: "assume_role", label: "Assume Role（预留）" },
  { value: "service_account_json", label: "GCP Service Account JSON" },
  { value: "api_key", label: "通用 API Key / Bearer Token" }
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
  const [testOpen, setTestOpen] = useState(false);
  const [providerOptions, setProviderOptions] = useState<{ label: string; value: string }[]>([]);
  const [credentialOptions, setCredentialOptions] = useState<{ label: string; value: string }[]>([]);
  const [credentialForm] = Form.useForm();
  const [syncForm] = Form.useForm();
  const [testForm] = Form.useForm();
  const credentialType = Form.useWatch("credential_type", credentialForm);
  const authMethod = Form.useWatch("auth_method", credentialForm);
  const usesIamRole = credentialType === "iam_role" || authMethod === "iam_role";
  const usesIamAccessKey = credentialType === "iam_access_key" || authMethod === "iam_access_key";
  const usesAssumeRole = credentialType === "assume_role" || authMethod === "assume_role";

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

  async function testProviderConnection(values: any) {
    try {
      const result = await apiFetch<{ ok: boolean; message: string; error_message?: string }>(
        `/api/admin/providers/${values.provider_id}/test-connection`,
        {
          method: "POST",
          body: JSON.stringify(values)
        }
      );
      if (result.ok) {
        message.success(result.message || "Provider 连接测试通过");
      } else {
        message.error(result.error_message || result.message || "Provider 连接测试失败");
      }
      setTestOpen(false);
      testForm.resetFields();
      loadOptions();
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
            <Button icon={<TestTube2 size={16} />} onClick={() => setTestOpen(true)}>
              测试 Provider 连接
            </Button>
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
          initialValues={{ credential_type: "iam_role", auth_method: "iam_role", aws_region: "us-east-1" }}
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
            <Select options={authMethodOptions} />
          </Form.Item>
          {usesIamRole ? (
            <Form.Item
              label="凭证来源"
              extra="使用服务端运行环境的默认 AWS Credential Chain，例如 EC2 Instance Profile / ECS Task Role。不会保存任何密钥。"
            >
              <Input disabled value="IAM Role（无密钥入库）" />
            </Form.Item>
          ) : usesIamAccessKey ? (
            <>
              <Form.Item label="AWS Access Key ID" name="aws_access_key_id" rules={[{ required: true }]}>
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item label="AWS Secret Access Key" name="aws_secret_access_key" rules={[{ required: true }]}>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </>
          ) : usesAssumeRole ? (
            <Form.Item label="Assume Role ARN" name="role_arn" extra="后端已预留 assume_role 类型，正式 STS 接入在第二阶段启用。">
              <Input disabled placeholder="arn:aws:iam::123456789012:role/OneTokenBedrockRole" />
            </Form.Item>
          ) : (
            <Form.Item label="API Key / Bearer Token / Service Account JSON" name="secret" rules={[{ required: true }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          )}
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
        <Form form={syncForm} layout="vertical" onFinish={syncModels} initialValues={{ aws_region: "us-east-1" }}>
          <Form.Item label="Provider" name="provider_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={providerOptions} />
          </Form.Item>
          <Form.Item label="使用的密钥" name="credential_id" extra="AWS IAM Role / GCP 本地 ADC 可留空；生产环境建议使用运行环境身份或加密保存的 Service Account JSON。">
            <Select allowClear showSearch optionFilterProp="label" options={credentialOptions} />
          </Form.Item>
          <Form.Item label="AWS 区域，可选" name="aws_region">
            <Input placeholder="us-east-1" />
          </Form.Item>
          <Form.Item label="GCP Project ID，可选" name="gcp_project_id" extra="Google Vertex AI Provider 同步时使用；留空读取 Provider 元数据或环境变量 GCP_PROJECT_ID。">
            <Input placeholder="your-gcp-project-id" />
          </Form.Item>
          <Form.Item label="Vertex 区域，可选" name="vertex_regions" extra="多个区域用逗号分隔；留空默认扫描 global、us-central1、us-east5。">
            <Input placeholder="global,us-central1,us-east5" />
          </Form.Item>
          <Form.Item label="Vertex Publisher，可选" name="publishers" extra="多个 Publisher 用逗号分隔；留空默认扫描 google、anthropic、mistralai、xai、meta。">
            <Input placeholder="google,anthropic,mistralai" />
          </Form.Item>
          <Form.Item label="操作原因" name="reason">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<RefreshCw size={16} />}>
            开始同步
          </Button>
        </Form>
      </Modal>
      <Modal title="测试 Provider 连接" open={testOpen} onCancel={() => setTestOpen(false)} footer={null} destroyOnClose>
        <Form form={testForm} layout="vertical" onFinish={testProviderConnection}>
          <Form.Item label="Provider" name="provider_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={providerOptions} />
          </Form.Item>
          <Form.Item label="使用的密钥" name="credential_id" extra="使用 IAM Role 时可留空。填写测试模型 ID 会产生一次真实 Bedrock 调用。">
            <Select allowClear showSearch optionFilterProp="label" options={credentialOptions} />
          </Form.Item>
          <Form.Item
            label="测试模型 ID"
            name="model_id"
            extra="建议填写后台路由里的 provider_model_code，例如 us.anthropic.claude-3-5-haiku-20241022-v1:0。留空只校验凭证格式。"
          >
            <Input placeholder="us.anthropic.claude-3-5-haiku-20241022-v1:0" />
          </Form.Item>
          <Form.Item label="操作原因" name="reason">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<TestTube2 size={16} />}>
            开始测试
          </Button>
        </Form>
      </Modal>
    </>
  );
}
