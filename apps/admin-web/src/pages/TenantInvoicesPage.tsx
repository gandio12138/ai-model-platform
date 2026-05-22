import { Button, Descriptions, Drawer, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { ApiList, apiFetch, toQuery } from "../api";

type Option = { label: string; value: string };

function formatTime(value?: string) {
  return value ? value.replace("T", " ").slice(0, 19) : "-";
}

function formatMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return `¥${(amount / 100).toFixed(2)}`;
}

export default function TenantInvoicesPage({ canGenerate }: { canGenerate: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tenants, setTenants] = useState<Option[]>([]);
  const [previewForm] = Form.useForm();
  const latestLoadRef = useRef(0);

  async function load(page = 1, pageSize = 20, searchOverride?: string) {
    const loadId = latestLoadRef.current + 1;
    latestLoadRef.current = loadId;
    setLoading(true);
    try {
      const keyword = searchOverride ?? search;
      const query = toQuery({ page, pageSize, search: keyword });
      const res = await apiFetch<ApiList>(`/api/admin/tenant-invoices?${query}`);
      if (loadId !== latestLoadRef.current) return;
      setRows(res.data);
      setTotal(res.total);
    } catch (error) {
      if (loadId === latestLoadRef.current) {
        message.error((error as Error).message);
      }
    } finally {
      if (loadId === latestLoadRef.current) {
        setLoading(false);
      }
    }
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setSearch(nextValue);
    if (!nextValue) {
      load(1, 20, "").catch((error) => message.error((error as Error).message));
    }
  }

  async function loadTenants() {
    const res = await apiFetch<ApiList>("/api/admin/tenants?pageSize=100");
    setTenants(res.data.map((item) => ({ value: item.id, label: item.name ?? item.tenant_code ?? item.id })));
  }

  useEffect(() => {
    load();
    loadTenants().catch((error) => message.error((error as Error).message));
  }, []);

  async function previewInvoice(values: Record<string, string>) {
    try {
      const res = await apiFetch(`/api/admin/tenants/${values.tenant_id}/billing/preview`, {
        method: "POST",
        body: JSON.stringify({
          period_start: values.period_start,
          period_end: values.period_end
        })
      });
      setPreview(res);
      setPreviewOpen(true);
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  async function generateInvoice() {
    if (!preview?.tenant_id) {
      return;
    }
    let reason = "";
    Modal.confirm({
      title: "生成租户账单",
      content: (
        <Input.TextArea
          rows={3}
          placeholder="填写生成账单原因或审批号"
          onChange={(event) => {
            reason = event.target.value;
          }}
        />
      ),
      okText: "生成",
      cancelText: "取消",
      onOk: async () => {
        if (!reason.trim()) {
          throw new Error("请填写原因或审批号");
        }
        await apiFetch(`/api/admin/tenants/${preview.tenant_id}/billing/generate-current-invoice`, {
          method: "POST",
          body: JSON.stringify({
            period_start: preview.period_start,
            period_end: preview.period_end,
            reason
          })
        });
        message.success("已生成账单");
        setPreviewOpen(false);
        await load();
      }
    });
  }

  const columns = useMemo<ColumnsType<any>>(() => [
    { title: "账单号", dataIndex: "invoice_no", ellipsis: true },
    { title: "租户", dataIndex: "tenant_id", ellipsis: true, render: (value) => tenants.find((item) => item.value === value)?.label ?? value },
    { title: "期间开始", dataIndex: "period_start", render: formatTime },
    { title: "期间结束", dataIndex: "period_end", render: formatTime },
    { title: "状态", dataIndex: "status", render: (value) => <Tag color={value === "paid" ? "green" : value === "issued" ? "blue" : "default"}>{value}</Tag> },
    { title: "账单金额", dataIndex: "total_amount", render: formatMoney },
    { title: "已付金额", dataIndex: "paid_amount", render: formatMoney },
    { title: "到期时间", dataIndex: "due_at", render: formatTime },
    {
      title: "操作",
      width: 92,
      fixed: "right",
      render: (_, row) => <Button size="small" onClick={() => setDetail(row)}>详情</Button>
    }
  ], [tenants]);

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3}>租户账单</Typography.Title>
          <Typography.Text type="secondary">预览租户当前周期费用并生成应收账单</Typography.Text>
        </div>
        <Space>
          <Input.Search
            allowClear
            placeholder="搜索账单号、状态"
            value={search}
            onChange={handleSearchChange}
            onSearch={(value) => {
              setSearch(value);
              load(1, 20, value).catch((error) => message.error((error as Error).message));
            }}
          />
          <Button icon={<RefreshCw size={16} />} onClick={() => load()} />
        </Space>
      </div>
      <div className="inline-panel">
        <Form form={previewForm} layout="inline" onFinish={previewInvoice}>
          <Form.Item name="tenant_id" rules={[{ required: true }]}>
            <Select className="tenant-select" showSearch optionFilterProp="label" placeholder="选择租户" options={tenants} />
          </Form.Item>
          <Form.Item name="period_start">
            <Input placeholder="期间开始 ISO，可留空" />
          </Form.Item>
          <Form.Item name="period_end">
            <Input placeholder="期间结束 ISO，可留空" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<FileText size={16} />}>预览账单</Button>
        </Form>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1200 }}
        pagination={{ total, pageSize: 20, showSizeChanger: false, onChange: (page, pageSize) => load(page, pageSize) }}
      />
      <Drawer title="账单预览" width={760} open={previewOpen} onClose={() => setPreviewOpen(false)} destroyOnClose>
        {preview && (
          <Space direction="vertical" className="full-width" size={16}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="租户">{tenants.find((item) => item.value === preview.tenant_id)?.label ?? preview.tenant_id}</Descriptions.Item>
              <Descriptions.Item label="期间开始">{formatTime(preview.period_start)}</Descriptions.Item>
              <Descriptions.Item label="期间结束">{formatTime(preview.period_end)}</Descriptions.Item>
              <Descriptions.Item label="基础服务费">{formatMoney(preview.items.find((item: any) => item.item_type === "base_fee")?.amount)}</Descriptions.Item>
              <Descriptions.Item label="模型用量批发价">{formatMoney(preview.summary.tenant_wholesale_amount)}</Descriptions.Item>
              <Descriptions.Item label="租户客户付款金额">{formatMoney(preview.summary.end_user_payment_amount)}</Descriptions.Item>
              <Descriptions.Item label="抵扣额度">{formatMoney(preview.summary.included_credit)}</Descriptions.Item>
              <Descriptions.Item label="最低消费">{formatMoney(preview.summary.min_commit_amount)}</Descriptions.Item>
              <Descriptions.Item label="应收合计">{formatMoney(preview.total_amount)}</Descriptions.Item>
            </Descriptions>
            <Table<any>
              rowKey={(row) => row.item_type}
              pagination={false}
              dataSource={preview.items}
              columns={[
                { title: "费用项", dataIndex: "description" },
                { title: "数量", dataIndex: "quantity" },
                { title: "单价", dataIndex: "unit_amount", render: formatMoney },
                { title: "金额", dataIndex: "amount", render: formatMoney }
              ]}
            />
            {canGenerate && <Button type="primary" icon={<FileText size={16} />} onClick={generateInvoice}>生成正式账单</Button>}
          </Space>
        )}
      </Drawer>
      <Drawer title="账单详情" width={720} open={!!detail} onClose={() => setDetail(null)} destroyOnClose>
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="账单号">{detail.invoice_no}</Descriptions.Item>
            <Descriptions.Item label="租户">{tenants.find((item) => item.value === detail.tenant_id)?.label ?? detail.tenant_id}</Descriptions.Item>
            <Descriptions.Item label="期间开始">{formatTime(detail.period_start)}</Descriptions.Item>
            <Descriptions.Item label="期间结束">{formatTime(detail.period_end)}</Descriptions.Item>
            <Descriptions.Item label="状态">{detail.status}</Descriptions.Item>
            <Descriptions.Item label="币种">{detail.currency}</Descriptions.Item>
            <Descriptions.Item label="小计">{formatMoney(detail.subtotal_amount)}</Descriptions.Item>
            <Descriptions.Item label="折扣">{formatMoney(detail.discount_amount)}</Descriptions.Item>
            <Descriptions.Item label="税费">{formatMoney(detail.tax_amount)}</Descriptions.Item>
            <Descriptions.Item label="账单金额">{formatMoney(detail.total_amount)}</Descriptions.Item>
            <Descriptions.Item label="已付金额">{formatMoney(detail.paid_amount)}</Descriptions.Item>
            <Descriptions.Item label="到期时间">{formatTime(detail.due_at)}</Descriptions.Item>
            <Descriptions.Item label="支付时间">{formatTime(detail.paid_at)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
