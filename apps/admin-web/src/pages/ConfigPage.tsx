import { Alert, Button, Descriptions, Drawer, Form, Input, Modal, Select, Space, Switch, Tabs, Tag, Typography, message } from "antd";
import { Eye, History, RotateCcw, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiList, apiFetch } from "../api";
import ResourcePage from "./ResourcePage";

const configTabs = [
  { key: "web_site", configKey: "site_config", label: "Web 站点", type: "site" },
  { key: "app_download", configKey: "app_download", label: "App 下载", type: "app_download" },
  { key: "web_payment_entry", configKey: "web_payment_entry", label: "Web 付费入口", type: "checkout" },
  { key: "announcements_faq", configKey: "site_config", label: "公告 / FAQ", type: "site" },
  { key: "feature_flags", configKey: "feature_flags", label: "功能开关", type: "feature_flags" },
  { key: "review_policy", configKey: "review_policy", label: "审核策略", type: "review" }
];

const configKeyOptions = [
  { value: "site_config", label: "Web 站点 / 公告 / FAQ" },
  { value: "app_download", label: "App 下载" },
  { value: "web_payment_entry", label: "Web 付费入口" },
  { value: "feature_flags", label: "功能开关" },
  { value: "review_policy", label: "审核策略" }
];

const configTypeOptions = [
  { value: "site", label: "Web 站点" },
  { value: "app_download", label: "App 下载" },
  { value: "checkout", label: "Web 付费入口" },
  { value: "feature_flags", label: "功能开关" },
  { value: "review", label: "审核策略" }
];

function toAppDownloadFormValues(value: any) {
  return {
    enabled: value?.enabled ?? true,
    show_on_web_home: value?.show_on_web_home ?? true,
    show_on_console: value?.show_on_console ?? true,
    show_on_payment_success: value?.show_on_payment_success ?? true,
    title: value?.title ?? "移动端随时使用 OneToken",
    subtitle: value?.subtitle ?? "App、Web 与 API 共用同一个客户账号和余额。",
    qr_code_url: value?.qr_code_url ?? "",
    release_notes: value?.release_notes ?? "",
    ios_enabled: value?.ios?.enabled ?? true,
    ios_app_store_url: value?.ios?.app_store_url ?? "",
    ios_testflight_url: value?.ios?.testflight_url ?? "",
    ios_version: value?.ios?.version ?? "",
    ios_min_supported_version: value?.ios?.min_supported_version ?? "",
    android_enabled: value?.android?.enabled ?? true,
    android_apk_url: value?.android?.apk_url ?? "",
    android_official_url: value?.android?.official_url ?? "",
    android_market_url: value?.android?.markets?.[0]?.url ?? "",
    android_market_name: value?.android?.markets?.[0]?.name ?? "",
    android_market_channel: value?.android?.markets?.[0]?.channel ?? "official_market",
    android_version: value?.android?.version ?? "",
    android_min_supported_version: value?.android?.min_supported_version ?? "",
    reason: ""
  };
}

function fromAppDownloadFormValues(values: any) {
  const markets = values.android_market_url
    ? [
        {
          channel: values.android_market_channel || "official_market",
          name: values.android_market_name || "应用市场",
          url: values.android_market_url,
          enabled: true
        }
      ]
    : [];
  return {
    enabled: Boolean(values.enabled),
    show_on_web_home: Boolean(values.show_on_web_home),
    show_on_console: Boolean(values.show_on_console),
    show_on_payment_success: Boolean(values.show_on_payment_success),
    title: values.title || "移动端随时使用 OneToken",
    subtitle: values.subtitle || "",
    qr_code_url: values.qr_code_url || null,
    release_notes: values.release_notes || null,
    ios: {
      enabled: Boolean(values.ios_enabled),
      app_store_url: values.ios_app_store_url || null,
      testflight_url: values.ios_testflight_url || null,
      version: values.ios_version || null,
      min_supported_version: values.ios_min_supported_version || null
    },
    android: {
      enabled: Boolean(values.android_enabled),
      apk_url: values.android_apk_url || null,
      official_url: values.android_official_url || null,
      markets,
      version: values.android_version || null,
      min_supported_version: values.android_min_supported_version || null
    }
  };
}

function AppDownloadConfigEditor({
  canPublish,
  canWrite,
  form,
  loading,
  onRefresh,
  onSave
}: {
  canPublish: boolean;
  canWrite: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  loading: boolean;
  onRefresh: () => void;
  onSave: (values: any, publish: boolean) => void;
}) {
  return (
    <section className="config-quick-editor">
      <div className="config-quick-editor-head">
        <div>
          <Typography.Title level={4}>App 下载配置</Typography.Title>
          <Typography.Text type="secondary">
            这里控制 Web 首页、客户控制台、支付成功页是否展示 iOS / Android 下载入口。关闭总开关后，Web 端入口会消失。
          </Typography.Text>
        </div>
        <Button onClick={onRefresh} loading={loading}>
          刷新
        </Button>
      </div>
      <Form form={form} layout="vertical" className="config-quick-form">
        <div className="config-grid three">
          <Form.Item label="启用 App 下载入口" name="enabled" valuePropName="checked">
            <Switch disabled={!canWrite} />
          </Form.Item>
          <Form.Item label="首页展示" name="show_on_web_home" valuePropName="checked">
            <Switch disabled={!canWrite} />
          </Form.Item>
          <Form.Item label="控制台展示" name="show_on_console" valuePropName="checked">
            <Switch disabled={!canWrite} />
          </Form.Item>
          <Form.Item label="支付成功页展示" name="show_on_payment_success" valuePropName="checked">
            <Switch disabled={!canWrite} />
          </Form.Item>
        </div>

        <div className="config-grid two">
          <Form.Item label="区块标题" name="title" rules={[{ required: true }]}>
            <Input disabled={!canWrite} />
          </Form.Item>
          <Form.Item label="二维码地址" name="qr_code_url">
            <Input disabled={!canWrite} placeholder="可选，统一下载二维码图片地址" />
          </Form.Item>
        </div>
        <Form.Item label="说明文案" name="subtitle">
          <Input.TextArea disabled={!canWrite} rows={2} />
        </Form.Item>

        <div className="config-platform-panels">
          <article>
            <div className="config-platform-title">
              <strong>iOS</strong>
              <Form.Item name="ios_enabled" valuePropName="checked" noStyle>
                <Switch disabled={!canWrite} />
              </Form.Item>
            </div>
            <Form.Item label="App Store 链接" name="ios_app_store_url">
              <Input disabled={!canWrite} placeholder="https://apps.apple.com/..." />
            </Form.Item>
            <Form.Item label="TestFlight 链接" name="ios_testflight_url">
              <Input disabled={!canWrite} placeholder="https://testflight.apple.com/join/..." />
            </Form.Item>
            <div className="config-grid two">
              <Form.Item label="当前版本" name="ios_version">
                <Input disabled={!canWrite} />
              </Form.Item>
              <Form.Item label="最低支持版本" name="ios_min_supported_version">
                <Input disabled={!canWrite} />
              </Form.Item>
            </div>
          </article>

          <article>
            <div className="config-platform-title">
              <strong>Android</strong>
              <Form.Item name="android_enabled" valuePropName="checked" noStyle>
                <Switch disabled={!canWrite} />
              </Form.Item>
            </div>
            <Form.Item label="官网 APK 地址" name="android_apk_url">
              <Input disabled={!canWrite} placeholder="https://download.example.com/onetoken.apk" />
            </Form.Item>
            <Form.Item label="官方下载页" name="android_official_url">
              <Input disabled={!canWrite} placeholder="https://www.example.com/download/android" />
            </Form.Item>
            <div className="config-grid two">
              <Form.Item label="应用市场名称" name="android_market_name">
                <Input disabled={!canWrite} placeholder="应用宝 / 华为应用市场" />
              </Form.Item>
              <Form.Item label="应用市场渠道" name="android_market_channel">
                <Input disabled={!canWrite} placeholder="yingyongbao / huawei_market" />
              </Form.Item>
            </div>
            <Form.Item label="应用市场链接" name="android_market_url">
              <Input disabled={!canWrite} />
            </Form.Item>
            <div className="config-grid two">
              <Form.Item label="当前版本" name="android_version">
                <Input disabled={!canWrite} />
              </Form.Item>
              <Form.Item label="最低支持版本" name="android_min_supported_version">
                <Input disabled={!canWrite} />
              </Form.Item>
            </div>
          </article>
        </div>

        <Form.Item label="统一更新说明" name="release_notes">
          <Input.TextArea disabled={!canWrite} rows={3} />
        </Form.Item>
        <Form.Item label="发布原因" name="reason">
          <Input.TextArea disabled={!canPublish} rows={2} placeholder="保存并发布时必填" />
        </Form.Item>
        <Space>
          <Button disabled={!canWrite} onClick={() => onSave(form.getFieldsValue(true), false)}>
            保存草稿
          </Button>
          <Button
            disabled={!canWrite || !canPublish}
            type="primary"
            onClick={() => onSave(form.getFieldsValue(true), true)}
          >
            保存并发布
          </Button>
        </Space>
      </Form>
    </section>
  );
}

export default function ConfigPage({ canWrite, canPublish }: { canWrite: boolean; canPublish: boolean }) {
  const [activeKey, setActiveKey] = useState("web_site");
  const [action, setAction] = useState<{ type: "publish" | "rollback"; row: any; reload: () => void } | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [form] = Form.useForm();
  const [appDownloadForm] = Form.useForm();
  const [appDownloadRow, setAppDownloadRow] = useState<any | null>(null);
  const [appDownloadLoading, setAppDownloadLoading] = useState(false);

  useEffect(() => {
    if (activeKey === "app_download") {
      loadAppDownloadConfig();
    }
  }, [activeKey]);

  async function loadAppDownloadConfig() {
    setAppDownloadLoading(true);
    try {
      const payload = await apiFetch<ApiList>(`/api/admin/configs?search=app_download&pageSize=20`);
      const row = payload.data.find((item) => item.config_key === "app_download") ?? null;
      setAppDownloadRow(row);
      const value = row?.draft_value ?? row?.published_value ?? {};
      appDownloadForm.setFieldsValue(toAppDownloadFormValues(value));
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setAppDownloadLoading(false);
    }
  }

  async function openPreview(row: any) {
    try {
      const payload = await apiFetch(`/api/admin/configs/${row.id}/preview`);
      setPreview(payload);
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  async function openVersions(row: any) {
    try {
      const payload = await apiFetch<ApiList>(`/api/admin/configs/${row.id}/versions?pageSize=20`);
      setVersions(payload.data);
      setVersionsOpen(true);
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  async function submit(values: any) {
    if (!action) return;
    try {
      await apiFetch(`/api/admin/configs/${action.row.id}/${action.type}`, {
        method: "POST",
        body: JSON.stringify(values)
      });
      message.success(action.type === "publish" ? "配置已发布" : "配置已回滚并重新发布");
      action.reload();
      setAction(null);
      form.resetFields();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  async function saveAppDownload(values: any, publish: boolean) {
    try {
      const draftValue = fromAppDownloadFormValues(values);
      const body = {
        config_key: "app_download",
        config_type: "app_download",
        draft_value: draftValue,
        status: "draft",
        metadata: {
          edited_from: "config_center_app_download_form"
        }
      };
      const saved = appDownloadRow
        ? await apiFetch<any>(`/api/admin/configs/${appDownloadRow.id}`, {
            method: "PATCH",
            body: JSON.stringify(body)
          })
        : await apiFetch<any>("/api/admin/configs", {
            method: "POST",
            body: JSON.stringify(body)
          });
      setAppDownloadRow(saved);
      if (publish) {
        if (!values.reason) {
          message.warning("保存并发布需要填写发布原因");
          return;
        }
        await apiFetch(`/api/admin/configs/${saved.id}/publish`, {
          method: "POST",
          body: JSON.stringify({ reason: values.reason })
        });
        message.success("App 下载配置已发布，Web/App 公共配置已生效");
        await loadAppDownloadConfig();
      } else {
        message.success("App 下载草稿已保存");
      }
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  const rowActions = (row: any, reload: () => void) => (
    <>
      <Button size="small" icon={<Eye size={14} />} onClick={() => openPreview(row)}>
        预览
      </Button>
      <Button size="small" icon={<History size={14} />} onClick={() => openVersions(row)}>
        版本
      </Button>
      {canPublish ? (
        <>
          <Button size="small" type="primary" icon={<Rocket size={14} />} onClick={() => setAction({ type: "publish", row, reload })}>
            发布
          </Button>
          <Button size="small" icon={<RotateCcw size={14} />} onClick={() => setAction({ type: "rollback", row, reload })}>
            回滚
          </Button>
        </>
      ) : null}
    </>
  );

  return (
    <>
      <div className="page-header config-center-header">
        <div>
          <Typography.Title level={3}>配置中心</Typography.Title>
          <Typography.Text type="secondary">
            站点、下载、付费入口、公告 FAQ 和审核策略统一发布到 Web/App 公共配置接口。
          </Typography.Text>
        </div>
        <Tag color="blue">发布后 /api/public/site-config 与 /api/app/config 立即生效</Tag>
      </div>
      <Tabs
        activeKey={activeKey}
        items={configTabs.map((item) => ({ key: item.key, label: item.label }))}
        onChange={setActiveKey}
      />
      {activeKey === "app_download" ? (
        <AppDownloadConfigEditor
          canPublish={canPublish}
          canWrite={canWrite}
          form={appDownloadForm}
          loading={appDownloadLoading}
          onRefresh={loadAppDownloadConfig}
          onSave={saveAppDownload}
        />
      ) : null}
      <ResourcePage
        title="配置草稿与版本"
        description="配置键只能从固定 schema 中选择。编辑 draft_value 后，先预览影响范围，再发布。"
        endpoint={`/api/admin/configs?search=${encodeURIComponent(configTabs.find((item) => item.key === activeKey)?.configKey ?? activeKey)}`}
        rowKey="id"
        columns={[
          ["config_key", "配置键"],
          ["config_type", "类型"],
          ["status", "状态"],
          ["config_version", "版本"],
          ["published_at", "发布时间"],
          ["rollback_from_version", "回滚来源"]
        ]}
        editableFields={[
          { key: "config_key", label: "配置键", kind: "select", options: configKeyOptions, required: true },
          { key: "config_type", label: "类型", kind: "select", options: configTypeOptions, required: true },
          { key: "draft_value", label: "草稿 JSON", kind: "json", required: true, help: "发布前会按配置键进行 schema 校验。" },
          { key: "status", label: "状态", kind: "select", options: [{ value: "draft", label: "草稿" }, { value: "published", label: "已发布" }] },
          { key: "metadata", label: "元数据 JSON", kind: "json" }
        ]}
        canCreate={canWrite}
        canEdit={canWrite}
        rowActions={rowActions}
      />

      <Modal
        title={action?.type === "publish" ? "发布配置" : "回滚配置"}
        open={!!action}
        onCancel={() => setAction(null)}
        footer={null}
      >
        <Alert
          className="modal-alert"
          message={action?.row?.config_key}
          description={action?.type === "publish" ? "将草稿发布为端侧生效配置。" : "默认回滚到当前已发布值；填写版本号可回滚到历史版本。"}
          type={action?.type === "publish" ? "info" : "warning"}
          showIcon
        />
        <Form form={form} layout="vertical" onFinish={submit}>
          {action?.type === "rollback" ? (
            <Form.Item label="目标版本号" name="version">
              <Input placeholder="留空则回滚到当前已发布值" />
            </Form.Item>
          ) : null}
          <Form.Item label="操作原因" name="reason" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            确认
          </Button>
        </Form>
      </Modal>

      <Drawer title="配置预览" width={860} open={!!preview} onClose={() => setPreview(null)} destroyOnClose>
        {preview ? (
          <Space direction="vertical" size="large" className="full-width">
            <Alert
              message={`影响范围：${preview.affected?.scope_count ?? 0} 个租户/项目/平台组合`}
              description="预览使用当前解析服务生成最终 Web 配置，发布后公开接口会返回同一套结构。"
              type="info"
              showIcon
            />
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="配置键">{preview.config?.config_key}</Descriptions.Item>
              <Descriptions.Item label="当前版本">{preview.config?.config_version}</Descriptions.Item>
              <Descriptions.Item label="生效端">Web / App / API 配置解析服务</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5}>最终 site-config 预览</Typography.Title>
            <pre className="json-preview">{JSON.stringify(preview.preview, null, 2)}</pre>
          </Space>
        ) : null}
      </Drawer>

      <Drawer title="配置版本" width={760} open={versionsOpen} onClose={() => setVersionsOpen(false)} destroyOnClose>
        <div className="version-list">
          {versions.map((item) => (
            <article key={item.id}>
              <strong>v{item.config_version}</strong>
              <span>{item.published_by_email ?? "system"}</span>
              <em>{String(item.published_at ?? item.created_at ?? "").replace("T", " ").slice(0, 19)}</em>
              <p>{item.reason || "无发布说明"}</p>
            </article>
          ))}
          {!versions.length ? <Alert message="暂无历史版本" type="info" showIcon /> : null}
        </div>
      </Drawer>
    </>
  );
}
