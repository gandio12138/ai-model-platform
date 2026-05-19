import { Button, Form, Input, Modal, Select, Space, message } from "antd";
import { RefreshCw, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiList, apiFetch } from "../api";
import ResourcePage from "./ResourcePage";

export default function PaymentOrdersPage({ canRefund, canReconcile }: { canRefund: boolean; canReconcile: boolean }) {
  const [action, setAction] = useState<"refund" | "sync" | null>(null);
  const [orderId, setOrderId] = useState("");
  const [orderOptions, setOrderOptions] = useState<{ label: string; value: string }[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!canRefund && !canReconcile) return;
    apiFetch<ApiList>("/api/admin/payment/orders?pageSize=100")
      .then((res) =>
        setOrderOptions(
          res.data.map((order) => ({ value: order.id, label: `${order.order_no} / ${order.status}` }))
        )
      )
      .catch((error) => message.error((error as Error).message));
  }, [canRefund, canReconcile]);

  async function submit(values: any) {
    if (!action) return;
    try {
      await apiFetch(`/api/admin/payment/orders/${orderId}/${action}`, {
        method: "POST",
        body: JSON.stringify(values)
      });
      message.success(action === "refund" ? "退款申请已记录" : "查单同步已记录");
      setAction(null);
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <>
      <ResourcePage
        title="支付订单"
        endpoint="/api/admin/payment/orders"
        rowKey="id"
        columns={[
          ["tenant_id", "租户", "select", "/api/admin/tenants", "name"],
          ["project_id", "项目", "select", "/api/admin/tenant-projects", "name"],
          ["order_no", "订单号"],
          ["user_id", "客户账号", "select", "/api/admin/users", "email"],
          ["platform", "平台"],
          ["checkout_channel", "收银渠道"],
          ["payment_method", "支付方式"],
          ["amount", "金额分"],
          ["status", "状态"],
          ["channel_trade_no", "渠道单号"],
          ["created_at", "创建时间"]
        ]}
        editableFields={[["status", "状态"], ["metadata", "备注 JSON", "json"]]}
        canEdit={false}
      />
      {(canRefund || canReconcile) && (
        <div className="floating-tools">
          <Space>
            <Select
              className="floating-select"
              showSearch
              optionFilterProp="label"
              placeholder="选择订单"
              value={orderId || undefined}
              options={orderOptions}
              onChange={setOrderId}
            />
            {canReconcile && (
              <Button icon={<RefreshCw size={16} />} onClick={() => setAction("sync")} disabled={!orderId}>
                查单
              </Button>
            )}
            {canRefund && (
              <Button danger icon={<Undo2 size={16} />} onClick={() => setAction("refund")} disabled={!orderId}>
                退款
              </Button>
            )}
          </Space>
        </div>
      )}
      <Modal title={action === "refund" ? "申请退款" : "主动查单"} open={!!action} onCancel={() => setAction(null)} footer={null}>
        <Form form={form} layout="vertical" onFinish={submit}>
          {action === "refund" && (
            <Form.Item label="退款金额，单位分" name="amount">
              <Input />
            </Form.Item>
          )}
          <Form.Item label="操作原因" name="reason" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" danger={action === "refund"} htmlType="submit">
            提交
          </Button>
        </Form>
      </Modal>
    </>
  );
}
