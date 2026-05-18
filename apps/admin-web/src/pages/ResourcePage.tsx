import { Button, Descriptions, Drawer, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save } from "lucide-react";
import { ApiList, apiFetch, toQuery } from "../api.js";

export type FieldSpec = [
  key: string,
  label: string,
  kind?: "text" | "number" | "boolean" | "json" | "select",
  optionsEndpoint?: string,
  optionLabelKey?: string
];

interface ResourcePageProps {
  title: string;
  endpoint: string;
  rowKey: string;
  columns: FieldSpec[];
  editableFields?: FieldSpec[];
  canCreate?: boolean;
}

function renderValue(value: unknown) {
  if (typeof value === "boolean") {
    return <Tag color={value ? "green" : "default"}>{value ? "启用" : "禁用"}</Tag>;
  }
  if (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return value.replace("T", " ").slice(0, 19);
  }
  if (typeof value === "object" && value !== null) {
    return <Typography.Text code>{JSON.stringify(value)}</Typography.Text>;
  }
  return String(value ?? "-");
}

function buildPayload(values: Record<string, unknown>, fields: FieldSpec[]) {
  const payload: Record<string, unknown> = {};
  for (const [key, , kind] of fields) {
    const value = values[key];
    if (kind === "json") {
      payload[key] = value ? JSON.parse(String(value)) : {};
    } else {
      payload[key] = value;
    }
  }
  if (values.reason) {
    payload.reason = values.reason;
  }
  return payload;
}

export default function ResourcePage(props: ResourcePageProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Record<string, { label: string; value: string }[]>>({});
  const [form] = Form.useForm();

  const editable = props.editableFields ?? [];

  async function load(page = 1, pageSize = 20) {
    setLoading(true);
    try {
      const query = toQuery({ page, pageSize, search });
      const res = await apiFetch<ApiList>(`${props.endpoint}?${query}`);
      setRows(res.data);
      setTotal(res.total);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const selectFields = editable.filter(([, , kind, endpoint]) => kind === "select" && endpoint);
    if (!selectFields.length) return;
    Promise.all(
      selectFields.map(async ([key, , , endpoint, optionLabelKey]) => {
        const separator = endpoint!.includes("?") ? "&" : "?";
        const res = await apiFetch<ApiList>(`${endpoint}${separator}pageSize=100`);
        return [
          key,
          res.data.map((item) => ({
            value: item.id,
            label: String(item[optionLabelKey ?? "name"] ?? item.email ?? item.code ?? item.public_model_code ?? item.id)
          }))
        ] as const;
      })
    )
      .then((entries) => setOptions(Object.fromEntries(entries)))
      .catch((error) => message.error((error as Error).message));
  }, [props.endpoint]);

  const tableColumns = useMemo<ColumnsType<any>>(() => {
    const base = props.columns.map(([key, label]) => ({
      title: label,
      dataIndex: key,
      ellipsis: true,
      render: renderValue
    }));
    if (!editable.length) {
      return [
        ...base,
        {
          title: "操作",
          width: 92,
          fixed: "right",
          render: (_, row) => (
            <Button size="small" onClick={() => setDetail(row)}>
              详情
            </Button>
          )
        }
      ];
    }
    return [
      ...base,
      {
        title: "操作",
        width: 142,
        fixed: "right",
        render: (_, row) => (
          <Space>
            <Button size="small" onClick={() => setDetail(row)}>
              详情
            </Button>
            <Button size="small" onClick={() => startEdit(row)}>
              编辑
            </Button>
          </Space>
        )
      }
    ];
  }, [props.columns, editable.length]);

  function startEdit(row?: any) {
    setEditing(row ?? null);
    const values = row ? { ...row } : {};
    for (const [key, , kind] of editable) {
      if (kind === "json" && values[key] !== undefined) {
        values[key] = JSON.stringify(values[key] ?? {}, null, 2);
      }
    }
    form.setFieldsValue(values);
    setOpen(true);
  }

  async function submit(values: Record<string, unknown>) {
    try {
      const payload = buildPayload(values, editable);
      if (editing) {
        await apiFetch(`${props.endpoint}/${editing[props.rowKey]}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch(props.endpoint, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      message.success("已保存");
      setOpen(false);
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3}>{props.title}</Typography.Title>
          <Typography.Text type="secondary">筛选、查看详情和执行受控操作</Typography.Text>
        </div>
        <Space>
          <Input.Search
            allowClear
            placeholder="搜索"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onSearch={() => load()}
          />
          <Button icon={<RefreshCw size={16} />} onClick={() => load()} />
          {props.canCreate && <Button type="primary" icon={<Plus size={16} />} onClick={() => startEdit()}>新增</Button>}
        </Space>
      </div>
      <Table
        rowKey={props.rowKey}
        loading={loading}
        dataSource={rows}
        columns={tableColumns}
        scroll={{ x: 1100 }}
        pagination={{
          total,
          pageSize: 20,
          showSizeChanger: false,
          onChange: (page, pageSize) => load(page, pageSize)
        }}
      />
      <Drawer
        title={editing ? "编辑记录" : "新增记录"}
        width={560}
        open={open}
        onClose={() => setOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          {editable.map(([key, label, kind]) => (
            <Form.Item key={key} label={label} name={key} valuePropName={kind === "boolean" ? "checked" : "value"}>
              {kind === "number" ? (
                <InputNumber className="full-width" />
              ) : kind === "boolean" ? (
                <Switch />
              ) : kind === "select" ? (
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={options[key] ?? []}
                  placeholder="请选择"
                />
              ) : kind === "json" ? (
                <Input.TextArea rows={8} />
              ) : (
                <Input />
              )}
            </Form.Item>
          ))}
          {editing && (
            <Form.Item label="操作原因" name="reason">
              <Input.TextArea rows={3} />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" icon={<Save size={16} />}>
            保存
          </Button>
        </Form>
      </Drawer>
      <Drawer
        title={`${props.title}详情`}
        width={720}
        open={!!detail}
        onClose={() => setDetail(null)}
        destroyOnClose
      >
        {detail && (
          <Descriptions column={1} bordered size="small">
            {Object.entries(detail).map(([key, value]) => (
              <Descriptions.Item key={key} label={key}>
                {renderValue(value)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
