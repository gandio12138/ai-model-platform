import { Button, Descriptions, Drawer, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save } from "lucide-react";
import { ApiList, apiFetch, toQuery } from "../api";

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
  canEdit?: boolean;
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
  plan_id: "套餐",
  plan_code: "套餐编码",
  billing_cycle: "计费周期",
  billing_mode: "计费模式",
  subscription_no: "订阅号",
  subscription_id: "租户订阅",
  current_period_start: "当前周期开始",
  current_period_end: "当前周期结束",
  next_billing_at: "下次出账",
  cancel_at: "取消时间",
  invoice_no: "账单号",
  period_start: "期间开始",
  period_end: "期间结束",
  subtotal_amount: "小计金额",
  discount_amount: "折扣金额",
  tax_amount: "税费",
  total_amount: "账单金额",
  paid_amount: "已付金额",
  due_at: "到期时间",
  paid_at: "支付时间",
  rule_code: "计费规则编码",
  rule_version: "规则版本",
  price_type: "计价方式",
  base_fee_amount: "基础服务费",
  included_credit: "包含抵扣额度",
  included_token_budget: "包含 Token 预算",
  min_commit_amount: "最低消费",
  cost_plus_markup_rate: "成本加价率",
  min_margin_multiplier: "最低毛利倍率",
  revenue_share_rate: "收入分成比例",
  revenue_share_base: "收入分成基准",
  payment_service_fee_rate: "支付服务费率",
  effective_from: "生效开始",
  effective_to: "生效结束",
  max_projects: "项目数上限",
  max_customers: "客户数上限",
  max_members: "成员数上限",
  log_retention_days: "日志保留天数",
  support_level: "支持等级",
  seat_count: "席位数",
  max_context_tokens: "上下文上限",
  rpm_limit: "RPM 限制",
  tpm_limit: "TPM 限制",
  daily_budget: "日预算",
  monthly_budget: "月预算",
  enabled_features: "启用能力",
  price_version: "价格版本",
  pricing_mode: "计价模式",
  currency: "币种",
  input_price_per_1k: "输入价格/1K",
  output_price_per_1k: "输出价格/1K",
  total_requests: "请求数",
  total_tokens: "Token 数",
  provider_cost_amount: "供应商成本",
  tenant_wholesale_amount: "租户批发价",
  end_user_revenue_amount: "客户付款金额",
  payment_order_id: "支付订单",
  payment_gross_amount: "付款总额",
  payment_channel_fee: "支付通道费",
  platform_share_amount: "平台分成",
  tenant_share_amount: "租户分成",
  settled_at: "结算时间",
  reversed_at: "冲正时间",
  product_code: "套餐编码",
  product_name: "客户套餐",
  product_type: "套餐类型",
  face_value_amount: "到账额度",
  bonus_amount: "赠送额度",
  sale_amount: "售价",
  ios_product_id: "App Store 商品 ID",
  visible_platforms: "展示端",
  display_description: "展示说明",
  badge: "角标",
  email: "邮箱",
  phone: "手机号",
  user_type: "用户类型",
  status: "状态",
  created_at: "创建时间",
  updated_at: "更新时间",
  public_model_code: "模型编码",
  model_display_name: "模型展示名",
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
  },
  billing_cycle: {
    monthly: "月付",
    quarterly: "季付",
    yearly: "年付"
  },
  billing_mode: {
    subscription_usage: "订阅 + 用量",
    prepaid: "预付费",
    postpaid: "后付费",
    revenue_share: "收入分成"
  },
  price_type: {
    cost_plus: "成本加价",
    contract_price: "合同价",
    revenue_share: "收入分成"
  },
  pricing_mode: {
    contract_price: "合同价",
    cost_plus: "成本加价",
    fixed_margin: "固定毛利"
  },
  role_code: {
    tenant: "租户",
    tenant_admin: "租户"
  },
  user_type: {
    admin: "管理员",
    tenant: "租户",
    developer: "客户",
    consumer: "客户"
  },
  product_type: {
    recharge_credit: "余额充值包",
    api_credit_pack: "API 额度包",
    monthly_plan: "月套餐",
    subscription: "订阅",
    enterprise_topup: "企业充值",
    bonus_pack: "活动赠送包",
    wallet_recharge: "余额充值包"
  }
};

function getFieldLabel(key: string, labels: Record<string, string>) {
  return labels[key] ?? fieldLabels[key] ?? key;
}

function renderValue(value: unknown, key?: string, options?: FieldOption[]) {
  if (key === "visible_platforms" && typeof value === "string") {
    return value
      .split(",")
      .filter(Boolean)
      .map((platform) => valueLabels.platform?.[platform] ?? platform)
      .join("、") || "-";
  }
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

  const editableFields = props.editableFields ?? [];
  const editable = props.canEdit === false ? [] : editableFields;
  const labelMap = useMemo(
    () => Object.fromEntries([...props.columns, ...editableFields].map(([key, label]) => [key, label])),
    [props.columns, editableFields]
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
