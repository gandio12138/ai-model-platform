import { Button, Descriptions, Drawer, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save } from "lucide-react";
import { ApiList, apiFetch, toQuery } from "../api.js";

type FieldOption = { label: string; value: string };

export type FieldSpec = [
  key: string,
  label: string,
  kind?: "text" | "number" | "boolean" | "json" | "select",
  optionsEndpoint?: string,
  optionLabelKey?: string,
  staticOptions?: FieldOption[]
];

interface ResourcePageProps {
  title: string;
  endpoint: string;
  rowKey: string;
  columns: FieldSpec[];
  editableFields?: FieldSpec[];
  canCreate?: boolean;
}

const fieldLabels: Record<string, string> = {
  id: "记录 ID",
  tenant_id: "租户",
  tenant_name: "租户",
  tenant_code: "租户编码",
  project_id: "项目",
  project_name: "项目",
  project_code: "项目编码",
  project_type: "项目类型",
  source_project_id: "来源项目",
  tenant_customer_id: "租户客户",
  customer_code: "客户编码",
  customer_email: "客户账号",
  customer_phone: "客户手机号",
  customer_user_type: "客户类型",
  user_id: "客户账号",
  member_email: "成员账号",
  member_user_type: "成员类型",
  role_code: "成员角色",
  email: "邮箱",
  phone: "手机号",
  user_type: "用户类型",
  status: "状态",
  created_at: "创建时间",
  updated_at: "更新时间",
  public_model_code: "模型编码",
  provider_model_code: "上游模型编码",
  model_id: "模型",
  provider_id: "Provider",
  credential_id: "Provider 密钥",
  request_id: "请求编号",
  route_id: "路由",
  api_key_id: "API Key",
  order_no: "订单号",
  product_id: "商品",
  platform: "平台",
  checkout_channel: "收银渠道",
  payment_method: "支付方式",
  channel_trade_no: "渠道交易号",
  channel_code: "渠道编码",
  channel_type: "渠道类型",
  display_name: "展示名称",
  settlement_mode: "结算方式",
  fee_rate_bps: "通道费率",
  sort_order: "排序",
  enabled: "启用",
  config: "渠道配置",
  metadata: "扩展信息",
  target_id: "目标记录",
  target_type: "目标类型",
  actor_user_id: "操作人",
  approval_no: "原因/审批号"
};

const valueLabels: Record<string, Record<string, string>> = {
  platform: {
    ios: "iOS App",
    android: "Android App",
    web: "Web 收银台",
    api: "Developer API"
  },
  project_type: {
    ios_app: "iOS App",
    android_app: "Android App",
    web_checkout: "Web 收银台",
    developer_api: "Developer API"
  },
  payment_method: {
    apple_iap: "Apple IAP",
    alipay_app: "支付宝 App 支付",
    wechat_app: "微信 App 支付",
    alipay_web: "支付宝网页支付",
    wechat_web: "微信网页支付",
    wechat_native: "微信 Native 支付",
    card_checkout: "银行卡/信用卡托管收银台",
    enterprise_transfer: "企业对公转账"
  },
  settlement_mode: {
    platform_collected: "平台代收",
    tenant_collected: "租户自收",
    tenant_or_platform_collected: "租户或平台收款",
    app_store_collected: "应用商店收款"
  }
};

function getFieldLabel(key: string, labels: Record<string, string>) {
  return labels[key] ?? fieldLabels[key] ?? key;
}

function renderValue(value: unknown, key?: string, options?: FieldOption[]) {
  if (options?.length && typeof value === "string") {
    return options.find((option) => option.value === value)?.label ?? value;
  }
  if (key && typeof value === "string") {
    return valueLabels[key]?.[value] ?? value;
  }
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
  const [options, setOptions] = useState<Record<string, FieldOption[]>>({});
  const [form] = Form.useForm();

  const editable = props.editableFields ?? [];
  const labelMap = useMemo(
    () => Object.fromEntries([...props.columns, ...editable].map(([key, label]) => [key, label])),
    [props.columns, editable]
  );

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
    const allFields = [...props.columns, ...editable];
    const staticEntries = allFields
      .filter(([, , kind, , , staticOptions]) => kind === "select" && staticOptions?.length)
      .map(([key, , , , , staticOptions]) => [key, staticOptions ?? []] as const);
    if (staticEntries.length) {
      setOptions((current) => ({ ...current, ...Object.fromEntries(staticEntries) }));
    }
    const selectFields = allFields.filter(([, , kind, endpoint]) => kind === "select" && endpoint);
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
      .then((entries) => setOptions((current) => ({ ...current, ...Object.fromEntries(entries) })))
      .catch((error) => message.error((error as Error).message));
  }, [props.endpoint]);

  const tableColumns = useMemo<ColumnsType<any>>(() => {
    const base = props.columns.map(([key, label, kind]) => ({
      title: label,
      dataIndex: key,
      ellipsis: true,
      render: (value: unknown) => renderValue(value, key, kind === "select" ? options[key] : undefined)
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
  }, [props.columns, editable.length, options]);

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
              <Descriptions.Item key={key} label={getFieldLabel(key, labelMap)}>
                {renderValue(value, key, options[key])}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
