import { Button, Form, Input, InputNumber, Modal, Select, Space, message } from "antd";
import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiList, apiFetch } from "../api.js";
import ResourcePage from "./ResourcePage.js";

export default function WalletPage() {
  const [open, setOpen] = useState(false);
  const [userOptions, setUserOptions] = useState<{ label: string; value: string }[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    apiFetch<ApiList>("/api/admin/users?exclude_user_type=admin&pageSize=100")
      .then((res) =>
        setUserOptions(
          res.data.map((user) => ({ value: user.id, label: user.email ?? user.phone ?? user.id }))
        )
      )
      .catch((error) => message.error((error as Error).message));
  }, []);

  async function submit(values: any) {
    try {
      await apiFetch(`/api/admin/wallets/${values.user_id}/adjust`, {
        method: "POST",
        body: JSON.stringify(values)
      });
      message.success("余额调整已写入流水");
      setOpen(false);
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <>
      <div className="action-bar">
        <Space>
          <Button type="primary" danger icon={<ShieldAlert size={16} />} onClick={() => setOpen(true)}>
            余额调整
          </Button>
        </Space>
      </div>
      <ResourcePage
        title="钱包流水"
        endpoint="/api/admin/wallets/ledger"
        rowKey="id"
        columns={[
          ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
          ["user_id", "客户账号", "select", "/api/admin/users", "email"],
          ["event_type", "类型"],
          ["direction", "方向"],
          ["balance_type", "余额类型"],
          ["amount", "金额分"],
          ["balance_after", "变更后"],
          ["related_type", "关联类型"],
          ["related_id", "关联记录"],
          ["created_at", "时间"]
        ]}
      />
      <Modal title="余额调整" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ direction: "credit", balance_type: "cash" }}>
          <Form.Item label="客户账号" name="user_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={userOptions} />
          </Form.Item>
          <Form.Item label="方向" name="direction" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "credit", label: "增加" },
                { value: "debit", label: "扣减" },
                { value: "freeze", label: "冻结" },
                { value: "unfreeze", label: "解冻" }
              ]}
            />
          </Form.Item>
          <Form.Item label="余额类型" name="balance_type" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "cash", label: "现金余额" },
                { value: "bonus", label: "赠送余额" },
                { value: "frozen", label: "冻结余额" },
                { value: "credit", label: "信用额度" }
              ]}
            />
          </Form.Item>
          <Form.Item label="金额，单位分" name="amount" rules={[{ required: true }]}>
            <InputNumber className="full-width" min={1} />
          </Form.Item>
          <Form.Item label="原因" name="reason" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="审批单号" name="approval_no">
            <Input />
          </Form.Item>
          <Button type="primary" danger htmlType="submit">
            确认调整
          </Button>
        </Form>
      </Modal>
    </>
  );
}
