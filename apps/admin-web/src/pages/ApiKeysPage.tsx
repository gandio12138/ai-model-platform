import { Alert, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, RefreshCw, Save } from "lucide-react";
import { ApiList, apiFetch, toQuery } from "../api";

type Option = { label: string; value: string };

function formatTime(value?: string) {
  return value ? value.replace("T", " ").slice(0, 19) : "-";
}

function renderArray(value: unknown) {
  if (!Array.isArray(value) || !value.length) {
    return "-";
  }
  return value.map((item) => <Tag key={String(item)}>{String(item)}</Tag>);
}

export default function ApiKeysPage({ canWrite, canRevoke }: { canWrite: boolean; canRevoke: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [createdKey, setCreatedKey] = useState("");
  const [tenants, setTenants] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [models, setModels] = useState<Option[]>([]);
  const [form] = Form.useForm();

  async function load(page = 1, pageSize = 20) {
    setLoading(true);
    try {
      const query = toQuery({ page, pageSize, search });
      const res = await apiFetch<ApiList>(`/api/admin/api-keys?${query}`);
      setRows(res.data);
      setTotal(res.total);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadOptions() {
    const [tenantRes, projectRes, customerRes, modelRes] = await Promise.all([
      apiFetch<ApiList>("/api/admin/tenants?pageSize=100"),
      apiFetch<ApiList>("/api/admin/tenant-projects?pageSize=100"),
      apiFetch<ApiList>("/api/admin/tenant-customers?pageSize=100"),
      apiFetch<ApiList>("/api/admin/options/models?pageSize=500")
    ]);
    setTenants(tenantRes.data.map((item) => ({ value: item.id, label: item.name ?? item.tenant_code ?? item.id })));
    setProjects(projectRes.data.map((item) => ({ value: item.id, label: `${item.name ?? item.project_code} / ${item.platform}` })));
    setCustomers(customerRes.data.map((item) => ({ value: item.user_id, label: item.customer_email ?? item.customer_code ?? item.user_id })));
    const modelOptions = new Map<string, string>();
    for (const item of modelRes.data) {
      const value = String(item.value ?? item.public_model_code ?? item.id ?? "");
      if (value) {
        modelOptions.set(value, String(item.label ?? item.display_name ?? item.public_model_code ?? value));
      }
    }
    setModels([...modelOptions].map(([value, label]) => ({ value, label })));
  }

  useEffect(() => {
    load();
    loadOptions().catch((error) => message.error((error as Error).message));
  }, []);

  async function submit(values: Record<string, any>) {
    try {
      const res = await apiFetch<{ key: string; record: any }>("/api/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: values.tenant_id,
          project_id: values.project_id,
          user_id: values.user_id,
          name: values.name,
          model_whitelist: values.model_whitelist,
          ip_whitelist: values.ip_whitelist,
          rpm_limit: values.rpm_limit,
          tpm_limit: values.tpm_limit,
          daily_budget: values.daily_budget,
          monthly_budget: values.monthly_budget,
          expires_at: values.expires_at
        })
      });
      setCreatedKey(res.key);
      form.resetFields();
      await load();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  async function revoke(row: any) {
    let reason = "";
    Modal.confirm({
      title: "吊销 API Key",
      content: (
        <Input.TextArea
          rows={3}
          placeholder="填写吊销原因"
          onChange={(event) => {
            reason = event.target.value;
          }}
        />
      ),
      okText: "吊销",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        if (!reason.trim()) {
          throw new Error("请填写吊销原因");
        }
        await apiFetch(`/api/admin/api-keys/${row.id}/revoke`, {
          method: "POST",
          body: JSON.stringify({ reason })
        });
        message.success("已吊销");
        await load();
      }
    });
  }

  const columns = useMemo<ColumnsType<any>>(() => [
    { title: "名称", dataIndex: "name", ellipsis: true },
    { title: "租户", dataIndex: "tenant_id", ellipsis: true, render: (value) => tenants.find((item) => item.value === value)?.label ?? value },
    { title: "项目", dataIndex: "project_id", ellipsis: true, render: (value) => projects.find((item) => item.value === value)?.label ?? value },
    { title: "客户账号", dataIndex: "user_id", ellipsis: true, render: (value) => customers.find((item) => item.value === value)?.label ?? value },
    { title: "Key 前缀", dataIndex: "key_prefix" },
    { title: "Key 后缀", dataIndex: "key_suffix" },
    { title: "状态", dataIndex: "status", render: (value) => <Tag color={value === "active" ? "green" : "default"}>{value === "active" ? "启用" : "已吊销"}</Tag> },
    { title: "最后使用", dataIndex: "last_used_at", render: formatTime },
    {
      title: "操作",
      width: 150,
      fixed: "right",
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => setDetail(row)}>详情</Button>
          {canRevoke && <Button size="small" danger disabled={row.status === "revoked"} onClick={() => revoke(row)}>吊销</Button>}
        </Space>
      )
    }
  ], [customers, projects, tenants]);

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3}>API Key 管理</Typography.Title>
          <Typography.Text type="secondary">按租户、项目、客户账号签发和吊销 API Key</Typography.Text>
        </div>
        <Space>
          <Input.Search
            allowClear
            placeholder="搜索名称、前后缀、状态"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onSearch={() => load()}
          />
          <Button icon={<RefreshCw size={16} />} onClick={() => load()} />
          {canWrite && <Button type="primary" icon={<Plus size={16} />} onClick={() => {
            setCreatedKey("");
            setOpen(true);
          }}>新增</Button>}
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1200 }}
        pagination={{ total, pageSize: 20, showSizeChanger: false, onChange: (page, pageSize) => load(page, pageSize) }}
      />
      <Drawer title="签发 API Key" width={620} open={open} onClose={() => setOpen(false)} destroyOnClose>
        {createdKey && (
          <Alert
            type="success"
            showIcon
            className="mb-16"
            message="API Key 明文仅展示一次"
            description={<Typography.Text code copyable>{createdKey}</Typography.Text>}
          />
        )}
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item label="租户" name="tenant_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={tenants} />
          </Form.Item>
          <Form.Item label="项目" name="project_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={projects} />
          </Form.Item>
          <Form.Item label="客户账号" name="user_id" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={customers} />
          </Form.Item>
          <Form.Item label="Key 名称" name="name" rules={[{ required: true }]}>
            <Input prefix={<KeyRound size={16} />} />
          </Form.Item>
          <Form.Item
            label="模型白名单"
            name="model_whitelist"
            help="留空表示该 API Key 可使用租户策略允许的所有模型；只有需要限制单个 Key 时才选择模型。"
          >
            <Select mode="multiple" showSearch optionFilterProp="label" options={models} placeholder="默认不限制模型" />
          </Form.Item>
          <Form.Item label="IP 白名单" name="ip_whitelist">
            <Input.TextArea rows={3} placeholder="多个 IP 用逗号或换行分隔" />
          </Form.Item>
          <Space align="start" wrap>
            <Form.Item label="RPM 限制" name="rpm_limit"><InputNumber /></Form.Item>
            <Form.Item label="TPM 限制" name="tpm_limit"><InputNumber /></Form.Item>
            <Form.Item label="日预算，单位分" name="daily_budget"><InputNumber /></Form.Item>
            <Form.Item label="月预算，单位分" name="monthly_budget"><InputNumber /></Form.Item>
          </Space>
          <Form.Item label="过期时间 ISO" name="expires_at">
            <Input placeholder="2026-06-30T00:00:00Z" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<Save size={16} />}>签发</Button>
        </Form>
      </Drawer>
      <Drawer title="API Key 详情" width={720} open={!!detail} onClose={() => setDetail(null)} destroyOnClose>
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="租户">{tenants.find((item) => item.value === detail.tenant_id)?.label ?? detail.tenant_id}</Descriptions.Item>
            <Descriptions.Item label="项目">{projects.find((item) => item.value === detail.project_id)?.label ?? detail.project_id}</Descriptions.Item>
            <Descriptions.Item label="客户账号">{customers.find((item) => item.value === detail.user_id)?.label ?? detail.user_id}</Descriptions.Item>
            <Descriptions.Item label="Key 前缀">{detail.key_prefix}</Descriptions.Item>
            <Descriptions.Item label="Key 后缀">{detail.key_suffix}</Descriptions.Item>
            <Descriptions.Item label="状态">{detail.status}</Descriptions.Item>
            <Descriptions.Item label="模型白名单">{renderArray(detail.model_whitelist)}</Descriptions.Item>
            <Descriptions.Item label="IP 白名单">{renderArray(detail.ip_whitelist)}</Descriptions.Item>
            <Descriptions.Item label="RPM 限制">{detail.rpm_limit ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="TPM 限制">{detail.tpm_limit ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="日预算，单位分">{detail.daily_budget ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="月预算，单位分">{detail.monthly_budget ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="过期时间">{formatTime(detail.expires_at)}</Descriptions.Item>
            <Descriptions.Item label="最后使用">{formatTime(detail.last_used_at)}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatTime(detail.created_at)}</Descriptions.Item>
            <Descriptions.Item label="吊销时间">{formatTime(detail.revoked_at)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
