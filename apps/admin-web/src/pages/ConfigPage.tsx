import { Button, Form, Input, Modal, Space, message } from "antd";
import { Rocket, RotateCcw } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "../api.js";
import ResourcePage from "./ResourcePage.js";

export default function ConfigPage({ canWrite, canPublish }: { canWrite: boolean; canPublish: boolean }) {
  const [configId, setConfigId] = useState("");
  const [action, setAction] = useState<"publish" | "rollback" | null>(null);
  const [form] = Form.useForm();

  async function submit(values: any) {
    if (!action) return;
    try {
      await apiFetch(`/api/admin/configs/${configId}/${action}`, {
        method: "POST",
        body: JSON.stringify(values)
      });
      message.success(action === "publish" ? "配置已发布" : "配置已回滚为草稿");
      setAction(null);
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <>
      <ResourcePage
        title="配置发布"
        endpoint="/api/admin/configs"
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
          ["config_key", "配置键"],
          ["config_type", "类型"],
          ["draft_value", "草稿 JSON", "json"],
          ["status", "状态"],
          ["metadata", "元数据 JSON", "json"]
        ]}
        canCreate={canWrite}
        canEdit={canWrite}
      />
      {canPublish && (
        <div className="floating-tools">
          <Space>
            <Input placeholder="配置 UUID" value={configId} onChange={(event) => setConfigId(event.target.value)} />
            <Button type="primary" icon={<Rocket size={16} />} onClick={() => setAction("publish")} disabled={!configId}>
              发布
            </Button>
            <Button icon={<RotateCcw size={16} />} onClick={() => setAction("rollback")} disabled={!configId}>
              回滚
            </Button>
          </Space>
        </div>
      )}
      <Modal title={action === "publish" ? "发布配置" : "回滚配置"} open={!!action} onCancel={() => setAction(null)} footer={null}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item label="操作原因" name="reason" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            确认
          </Button>
        </Form>
      </Modal>
    </>
  );
}
