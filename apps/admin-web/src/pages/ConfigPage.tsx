import { Alert, Button, Descriptions, Drawer, Form, Input, Modal, Select, Space, Tabs, Tag, Typography, message } from "antd";
import { Eye, History, RotateCcw, Rocket } from "lucide-react";
import { useState } from "react";
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

export default function ConfigPage({ canWrite, canPublish }: { canWrite: boolean; canPublish: boolean }) {
  const [activeKey, setActiveKey] = useState("web_site");
  const [action, setAction] = useState<{ type: "publish" | "rollback"; row: any; reload: () => void } | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [form] = Form.useForm();

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
