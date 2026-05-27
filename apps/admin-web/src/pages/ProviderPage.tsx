import { Alert, Button, Form, Input, Modal, Select, Space, Switch, message } from "antd";
import { KeyRound, RefreshCw, TestTube2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiList, apiFetch } from "../api";
import ResourcePage from "./ResourcePage";

const providerTypeOptions = [
  {
    value: "openai",
    label: "OpenAI 官方 API",
    meta: {
      default_code: "openai-main",
      default_base_url: "https://api.openai.com/v1",
      default_region: "global",
      default_currency: "USD"
    }
  },
  {
    value: "anthropic",
    label: "Anthropic 官方 API",
    meta: {
      default_code: "anthropic-main",
      default_base_url: "https://api.anthropic.com/v1",
      default_region: "global",
      default_currency: "USD"
    }
  },
  {
    value: "gemini",
    label: "Gemini 官方 API",
    meta: {
      default_code: "gemini-main",
      default_base_url: "https://generativelanguage.googleapis.com/v1beta",
      default_region: "global",
      default_currency: "USD"
    }
  },
  {
    value: "openai_compatible",
    label: "OpenAI-Compatible",
    meta: {
      default_code: "openai-compatible-main",
      default_base_url: "https://api.example.com/v1",
      default_region: "global",
      default_currency: "USD"
    }
  }
];

const providerRegionOptions = [
  { value: "global", label: "Global" },
  { value: "us-central1", label: "Vertex us-central1" },
  { value: "us-east1", label: "Vertex us-east1" },
  { value: "us-east4", label: "Vertex us-east4" },
  { value: "us-east5", label: "Vertex us-east5" },
  { value: "us-south1", label: "Vertex us-south1" },
  { value: "us-west1", label: "Vertex us-west1" },
  { value: "us-west2", label: "Vertex us-west2" },
  { value: "us-west3", label: "Vertex us-west3" },
  { value: "us-west4", label: "Vertex us-west4" },
  { value: "northamerica-northeast1", label: "Vertex northamerica-northeast1" },
  { value: "northamerica-northeast2", label: "Vertex northamerica-northeast2" },
  { value: "southamerica-east1", label: "Vertex southamerica-east1" },
  { value: "southamerica-west1", label: "Vertex southamerica-west1" },
  { value: "africa-south1", label: "Vertex africa-south1" },
  { value: "europe-central2", label: "Vertex europe-central2" },
  { value: "europe-west1", label: "Vertex europe-west1" },
  { value: "europe-west2", label: "Vertex europe-west2" },
  { value: "europe-west3", label: "Vertex europe-west3" },
  { value: "europe-west4", label: "Vertex europe-west4" },
  { value: "europe-west6", label: "Vertex europe-west6" },
  { value: "europe-west8", label: "Vertex europe-west8" },
  { value: "europe-west9", label: "Vertex europe-west9" },
  { value: "europe-west12", label: "Vertex europe-west12" },
  { value: "europe-north1", label: "Vertex europe-north1" },
  { value: "europe-southwest1", label: "Vertex europe-southwest1" },
  { value: "asia-east1", label: "Vertex asia-east1" },
  { value: "asia-east2", label: "Vertex asia-east2" },
  { value: "asia-northeast1", label: "Vertex asia-northeast1" },
  { value: "asia-northeast2", label: "Vertex asia-northeast2" },
  { value: "asia-northeast3", label: "Vertex asia-northeast3" },
  { value: "asia-south1", label: "Vertex asia-south1" },
  { value: "asia-south2", label: "Vertex asia-south2" },
  { value: "asia-southeast1", label: "Vertex asia-southeast1" },
  { value: "asia-southeast2", label: "Vertex asia-southeast2" },
  { value: "australia-southeast1", label: "Vertex australia-southeast1" },
  { value: "australia-southeast2", label: "Vertex australia-southeast2" },
  { value: "me-central1", label: "Vertex me-central1" },
  { value: "me-central2", label: "Vertex me-central2" },
  { value: "me-west1", label: "Vertex me-west1" }
];

const legalScopeOptions = [
  { value: "global", label: "Global" },
  { value: "us", label: "美国" },
  { value: "eu", label: "欧盟" },
  { value: "asia", label: "亚洲" },
  { value: "cn", label: "中国大陆" }
];

const statusOptions = [
  { value: "active", label: "启用" },
  { value: "suspended", label: "停用" },
  { value: "archived", label: "归档" },
  { value: "draft", label: "草稿" }
];

const currencyOptions = [
  { value: "USD", label: "USD" },
  { value: "CNY", label: "CNY" },
  { value: "EUR", label: "EUR" },
  { value: "JPY", label: "JPY" },
  { value: "GBP", label: "GBP" }
];

function providerTypeLabel(providerType: string) {
  if (providerType === "openai") return "OpenAI";
  if (providerType === "anthropic") return "Anthropic";
  if (providerType === "gemini") return "Gemini";
  if (providerType === "openai_compatible") return "OpenAI-Compatible";
  if (providerType === "google_vertex_ai" || providerType === "vertex_ai") return "Google Vertex";
  return "Provider";
}

const defaultVertexRegionList = [
  "global",
  "us-central1",
  "us-east1",
  "us-east4",
  "us-east5",
  "us-south1",
  "us-west1",
  "us-west2",
  "us-west3",
  "us-west4",
  "northamerica-northeast1",
  "northamerica-northeast2",
  "southamerica-east1",
  "southamerica-west1",
  "africa-south1",
  "europe-central2",
  "europe-west1",
  "europe-west2",
  "europe-west3",
  "europe-west4",
  "europe-west6",
  "europe-west8",
  "europe-west9",
  "europe-west12",
  "europe-north1",
  "europe-southwest1",
  "asia-east1",
  "asia-east2",
  "asia-northeast1",
  "asia-northeast2",
  "asia-northeast3",
  "asia-south1",
  "asia-south2",
  "asia-southeast1",
  "asia-southeast2",
  "australia-southeast1",
  "australia-southeast2",
  "me-central1",
  "me-central2",
  "me-west1"
].join(",");

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
  const [providerOptions, setProviderOptions] = useState<{ label: string; value: string; meta?: Record<string, unknown> }[]>([]);
  const [credentialOptions, setCredentialOptions] = useState<{ label: string; value: string }[]>([]);
  const [credentialRefreshKey, setCredentialRefreshKey] = useState(0);
  const [credentialForm] = Form.useForm();
  const [syncForm] = Form.useForm();
  const [testForm] = Form.useForm();
  const credentialProviderId = Form.useWatch("provider_id", credentialForm);
  const syncProviderId = Form.useWatch("provider_id", syncForm);
  const testProviderId = Form.useWatch("provider_id", testForm);
  const credentialProvider = providerOptions.find((provider) => provider.value === credentialProviderId);
  const credentialProviderType = String(credentialProvider?.meta?.provider_type ?? "");
  const syncProvider = providerOptions.find((provider) => provider.value === syncProviderId);
  const testProvider = providerOptions.find((provider) => provider.value === testProviderId);
  const syncProviderType = String(syncProvider?.meta?.provider_type ?? "");
  const testProviderType = String(testProvider?.meta?.provider_type ?? "");
  const isSyncGoogleVertex = syncProviderType === "google_vertex_ai" || syncProviderType === "vertex_ai";
  const isSyncOpenAi = syncProviderType === "openai";
  const isSyncAnthropic = syncProviderType === "anthropic";
  const isSyncGemini = syncProviderType === "gemini";

  function loadOptions() {
    return Promise.all([
      apiFetch<ApiList>("/api/admin/options/providers?pageSize=100"),
      apiFetch<ApiList>("/api/admin/provider-credentials?pageSize=100")
    ])
      .then(([providers, credentials]) => {
        const providerLabelsById = new Map(
          providers.data.map((provider) => [
            String(provider.value ?? provider.id),
            String(provider.label ?? provider.name ?? provider.code ?? provider.id)
          ])
        );
        setProviderOptions(
          providers.data.map((provider) => ({
            value: String(provider.value ?? provider.id),
            label: String(provider.label ?? provider.name ?? provider.code ?? provider.id),
            meta: provider.meta ?? {}
          }))
        );
        setCredentialOptions(
          credentials.data.map((credential) => ({
            value: credential.id,
            label: `${credential.name} / ${providerLabelsById.get(String(credential.provider_id)) ?? "Provider 密钥"}`
          }))
        );
      });
  }

  useEffect(() => {
    loadOptions().catch((error) => message.error((error as Error).message));
  }, []);

  async function submitCredential(values: any) {
    try {
      await apiFetch(`/api/admin/providers/${values.provider_id}/credentials`, {
        method: "POST",
        body: JSON.stringify({
          provider_id: values.provider_id,
          name: values.name,
          secret: values.secret,
          status: "active"
        })
      });
      message.success("密钥已加密保存，不会再次明文展示");
      setOpen(false);
      credentialForm.resetFields();
      await loadOptions();
      setCredentialRefreshKey((value) => value + 1);
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
      await loadOptions();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  function handleSyncProviderChange(providerId: string) {
    const provider = providerOptions.find((item) => item.value === providerId);
    const providerType = String(provider?.meta?.provider_type ?? "");
    const region = String(provider?.meta?.region ?? "");
    syncForm.setFieldsValue({
      gcp_project_id: undefined,
      organization_id: undefined,
      openai_project_id: undefined,
      vertex_regions: providerType === "google_vertex_ai" || providerType === "vertex_ai" ? region || defaultVertexRegionList : undefined,
      publishers: providerType === "google_vertex_ai" || providerType === "vertex_ai" ? "google,anthropic,mistralai,xai,meta" : undefined,
      anthropic_version: providerType === "anthropic" ? "2023-06-01" : undefined
    });
  }

  function handleTestProviderChange(providerId: string) {
    const provider = providerOptions.find((item) => item.value === providerId);
    const providerType = String(provider?.meta?.provider_type ?? "");
    testForm.setFieldsValue({ model_id: recommendedTestModelId(providerType) });
  }

  function recommendedTestModelId(providerType: string) {
    if (providerType === "google_vertex_ai" || providerType === "vertex_ai") return "gemini-2.5-flash";
    if (providerType === "openai") return "gpt-4o-mini";
    if (providerType === "openai_compatible") return "gpt-4o-mini";
    if (providerType === "anthropic") return "claude-3-5-haiku-20241022";
    if (providerType === "gemini") return "gemini-2.5-flash";
    if (providerType === "azure_openai") return "";
    return "";
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
          ["health_score", "健康分"]
        ]}
        editableFields={[
          { key: "name", label: "名称", required: true, placeholder: "Google Vertex AI 主线路" },
          {
            key: "provider_type",
            label: "类型",
            kind: "select",
            options: providerTypeOptions,
            required: true,
            autofillFromOption: {
              code: "default_code",
              base_url: "default_base_url",
              region: "default_region",
              cost_currency: "default_currency"
            },
            help: "选择上游供应商类型。模型同步会先按对应账号密钥获取可访问模型，再匹配官方可验证的价格和上下文。"
          },
          {
            key: "base_url",
            label: "API Endpoint",
            kind: "url",
            visibleWhen: { provider_type: ["openai", "gemini", "openai_compatible", "azure_openai"] },
            placeholder: "https://api.openai.com/v1",
            help: "官方 Provider 会自动填入默认 Endpoint；OpenAI-Compatible 按供应商填写。"
          },
          { key: "region", label: "区域", kind: "select", options: providerRegionOptions, defaultValue: "global", required: true },
          { key: "legal_scope", label: "合规范围", kind: "select", options: legalScopeOptions, defaultValue: "global" },
          { key: "status", label: "状态", kind: "select", options: statusOptions, defaultValue: "active", required: true },
          { key: "cost_currency", label: "成本币种", kind: "select", options: currencyOptions, defaultValue: "USD", required: true },
          {
            key: "code",
            label: "Provider 编码",
            placeholder: "openai-main",
            advanced: true,
            help: "内部唯一标识。新增时会根据类型自动生成，一般不用手填；只有需要多条线路时再改。"
          },
          { key: "timeout_ms", label: "超时 ms", kind: "number", defaultValue: 60000, advanced: true },
          { key: "retry_count", label: "重试次数", kind: "number", defaultValue: 2, advanced: true },
          { key: "monthly_budget", label: "月预算", kind: "money", advanced: true }
        ]}
        canCreate={canWrite}
        canEdit={canWrite}
        onAfterSave={loadOptions}
      />
      <ResourcePage
        key={`provider-credentials-${credentialRefreshKey}`}
        title="Provider 密钥"
        endpoint="/api/admin/provider-credentials"
        rowKey="id"
        columns={[
          ["provider_id", "Provider", "select", "/api/admin/options/providers", "label"],
          ["name", "名称"],
          ["status", "状态"],
          ["rpm_limit", "RPM"],
          ["tpm_limit", "TPM"],
          ["last_used_at", "最后使用"]
        ]}
        canDelete={canWriteCredential}
        deleteConfirmTitle="删除这个 Provider 密钥？"
        deleteConfirmDescription="删除后不会再保留密钥明文或密文；绑定该密钥的模型路由会同步删除。如果这是该 Provider 的最后一把可用密钥，对应 Provider 同步出来且没有其他路由引用的模型和价格也会一起删除。"
        deleteReason="delete provider credential"
        onAfterSave={loadOptions}
      />
      <Modal title="添加 Provider 密钥" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form
          form={credentialForm}
          layout="vertical"
          onFinish={submitCredential}
          initialValues={{ status: "active" }}
        >
          <Form.Item label="Provider" name="provider_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={providerOptions} />
          </Form.Item>
          <Form.Item label="密钥名称" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label="API Key / Bearer Token"
            name="secret"
            rules={[{ required: true }]}
            extra={`密钥加密保存，保存后不会回显。系统会按 ${providerTypeLabel(credentialProviderType)} 自动识别调用方式。`}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              加密保存
            </Button>
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="同步模型目录" open={syncOpen} onCancel={() => setSyncOpen(false)} footer={null} destroyOnClose>
        <Form form={syncForm} layout="vertical" onFinish={syncModels} initialValues={{ vertex_regions: defaultVertexRegionList, validate_runtime: true }}>
          <Form.Item label="Provider" name="provider_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={providerOptions} onChange={handleSyncProviderChange} />
          </Form.Item>
          <Form.Item
            label="使用的密钥"
            name="credential_id"
            rules={[{ required: isSyncGoogleVertex || isSyncOpenAi || isSyncAnthropic || isSyncGemini, message: "请选择该 Provider 的密钥" }]}
            extra={isSyncGoogleVertex ? "Google Vertex 请选择 Service Account JSON。" : isSyncOpenAi ? "OpenAI 官方 API 请选择 OpenAI API Key。" : isSyncAnthropic ? "Anthropic 官方 API 请选择 Anthropic API Key。" : isSyncGemini ? "Gemini 官方 API 请选择 Gemini API Key。" : "选择该 Provider 对应密钥。"}
          >
            <Select allowClear showSearch optionFilterProp="label" options={credentialOptions} />
          </Form.Item>
          {isSyncOpenAi && (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="OpenAI /models 只返回可访问模型 ID，不包含价格和上下文。同步时会用平台维护的 OpenAI 官方价格/上下文目录补齐；目录缺少元数据的模型不会上架。"
              />
              <Form.Item label="OpenAI Organization，可选" name="organization_id">
                <Input placeholder="org_xxx" />
              </Form.Item>
              <Form.Item label="OpenAI Project，可选" name="openai_project_id">
                <Input placeholder="proj_xxx" />
              </Form.Item>
            </>
          )}
          {isSyncAnthropic && (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="Anthropic 同步会先调用 /v1/models 获取当前 API Key 可访问的模型，再从 Anthropic 官方模型文档匹配价格和上下文；缺少价格或上下文的模型不会写入客户可见目录。"
              />
              <Form.Item label="Anthropic API Version" name="anthropic_version" extra="默认使用 Anthropic 官方推荐版本 2023-06-01。">
                <Input placeholder="2023-06-01" />
              </Form.Item>
            </>
          )}
          {isSyncGemini && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Gemini 同步会先调用 models.list 获取当前 API Key 可访问模型，再从 Google 官方 Gemini API pricing 页面匹配价格；缺少价格或上下文的模型不会写入客户可见目录。"
            />
          )}
          {isSyncGoogleVertex && (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="Google Model Garden 会返回目录模型，其中一部分不是当前项目可直接运行的托管 API 模型。运行时验证使用 countTokens，不生成内容；验证失败的模型默认不会展示给客户。"
              />
              <Form.Item label="GCP Project ID，可选" name="gcp_project_id" extra="留空读取服务端环境变量 GCP_PROJECT_ID。">
                <Input placeholder="praxis-healer-dj5zp" />
              </Form.Item>
              <Form.Item label="Vertex 区域" name="vertex_regions" extra="多个区域用逗号分隔；global 可用于 publisher model catalog。">
                <Input placeholder="global,us-central1,us-east5" />
              </Form.Item>
              <Form.Item label="Vertex Publisher" name="publishers" extra="多个 Publisher 用逗号分隔。">
                <Input placeholder="google,anthropic,mistralai,xai,meta" />
              </Form.Item>
              <Form.Item
                label="验证 Gemini 运行时"
                name="validate_runtime"
                valuePropName="checked"
                extra="使用 Vertex countTokens 校验模型 ID 是否可在当前项目和区域运行，不生成回复内容。"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                label="保留未验证/不可用模型"
                name="include_unverified_runtime"
                valuePropName="checked"
                extra="关闭时，运行时验证失败的 Gemini 模型不会同步到客户可见目录。"
              >
                <Switch />
              </Form.Item>
            </>
          )}
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
            <Select showSearch optionFilterProp="label" options={providerOptions} onChange={handleTestProviderChange} />
          </Form.Item>
          <Form.Item label="使用的密钥" name="credential_id" extra="选择该 Provider 对应密钥；填写测试模型 ID 会产生一次真实调用。">
            <Select allowClear showSearch optionFilterProp="label" options={credentialOptions} />
          </Form.Item>
          <Form.Item
            label="测试模型 ID"
            name="model_id"
            extra={`推荐：${recommendedTestModelId(testProviderType) || "按该 Provider 的部署名填写"}。留空只校验凭证格式。`}
          >
            <Input placeholder={recommendedTestModelId(testProviderType) || "provider model id"} />
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
