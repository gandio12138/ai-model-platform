import { Button, Form, Input, InputNumber, Modal, message } from "antd";
import { FileSearch, RefreshCw, Undo2, WalletCards } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "../api";
import ResourcePage from "./ResourcePage";

export default function PaymentOrdersPage({ canRefund, canReconcile }: { canRefund: boolean; canReconcile: boolean }) {
  const [action, setAction] = useState<{ type: "refund" | "sync"; order: any; reload: () => void } | null>(null);
  const [form] = Form.useForm();

  async function submit(values: any) {
    if (!action) return;
    try {
      await apiFetch(`/api/admin/payment/orders/${action.order.id}/${action.type}`, {
        method: "POST",
        body: JSON.stringify({
          ...values,
          amount: values.amount === undefined || values.amount === null ? undefined : Math.round(Number(values.amount) * 100)
        })
      });
      message.success(action.type === "refund" ? "退款申请已记录" : "查单同步已记录");
      action.reload();
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
          ["amount", "金额（元）", "money"],
          ["status", "状态"],
          ["channel_trade_no", "渠道单号"],
          ["created_at", "创建时间"]
        ]}
        editableFields={[["status", "状态"], ["metadata", "备注 JSON", "json"]]}
        canEdit={false}
        rowActions={(row, reload) => (
          <>
            {canReconcile ? (
              <Button size="small" icon={<RefreshCw size={14} />} onClick={() => setAction({ type: "sync", order: row, reload })}>
                查单
              </Button>
            ) : null}
            {canRefund ? (
              <Button size="small" danger icon={<Undo2 size={14} />} onClick={() => setAction({ type: "refund", order: row, reload })}>
                退款
              </Button>
            ) : null}
            <Button size="small" icon={<FileSearch size={14} />} onClick={() => window.open(`/payment-order-events?payment_order_id=${row.id}`, "_self")}>
              事件
            </Button>
            <Button size="small" icon={<FileSearch size={14} />} onClick={() => window.open(`/payment-callbacks?payment_order_id=${row.id}`, "_self")}>
              回调
            </Button>
            <Button size="small" icon={<WalletCards size={14} />} onClick={() => window.open(`/wallet-ledger?related_id=${row.id}`, "_self")}>
              流水
            </Button>
          </>
        )}
      />
      <Modal title={action?.type === "refund" ? "申请退款" : "主动查单"} open={!!action} onCancel={() => setAction(null)} footer={null}>
        <Form form={form} layout="vertical" onFinish={submit}>
          {action?.type === "refund" && (
            <Form.Item label="退款金额（元）" name="amount">
              <InputNumber className="full-width" min={0} precision={2} step={1} addonAfter="元" />
            </Form.Item>
          )}
          <Form.Item label="操作原因" name="reason" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" danger={action?.type === "refund"} htmlType="submit">
            提交
          </Button>
        </Form>
      </Modal>
    </>
  );
}
