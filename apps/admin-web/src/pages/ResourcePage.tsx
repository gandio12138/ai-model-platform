import { Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save } from "lucide-react";
import { ApiList, apiFetch, toQuery } from "../api";

type FieldOption = { label: string; value: string; disabled?: boolean; meta?: Record<string, unknown> };
type FieldKind =
  | "text"
  | "number"
  | "money"
  | "boolean"
  | "json"
  | "select"
  | "multi_select"
  | "textarea"
  | "url"
  | "datetime";

type TupleFieldSpec = [
  key: string,
  label: string,
  kind?: FieldKind,
  optionsEndpoint?: string,
  optionLabelKey?: string,
  staticOptions?: FieldOption[]
];

export type FieldSpec =
  | TupleFieldSpec
  | {
      key: string;
      label: string;
      kind?: FieldKind;
      required?: boolean;
      placeholder?: string;
      help?: string;
      options?: FieldOption[];
      optionsEndpoint?: string;
      optionsResource?: string;
      optionLabelKey?: string;
      dependsOn?: string[];
      remoteSearch?: boolean;
      mode?: "single" | "multiple";
      visibleWhen?: Record<string, unknown>;
      readonly?: boolean;
      sensitive?: boolean;
      copyable?: boolean;
      jsonSchemaKey?: string;
      autofillFromOption?: Record<string, string>;
    };

type NormalizedFieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: FieldOption[];
  optionsEndpoint?: string;
  optionsResource?: string;
  optionLabelKey?: string;
  dependsOn?: string[];
  remoteSearch?: boolean;
  mode?: "single" | "multiple";
  visibleWhen?: Record<string, unknown>;
  readonly?: boolean;
  sensitive?: boolean;
  copyable?: boolean;
  jsonSchemaKey?: string;
  autofillFromOption?: Record<string, string>;
};

interface ResourcePageProps {
  title: string;
  description?: string;
  endpoint: string;
  rowKey: string;
  columns: FieldSpec[];
  detailFields?: FieldSpec[];
  editableFields?: FieldSpec[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  deleteDisabled?: (row: any) => boolean;
  deleteConfirmTitle?: string;
  deleteConfirmDescription?: string;
  deleteReason?: string;
  rowActions?: (row: any, reload: () => void) => ReactNode;
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
  input_price_per_1m: "输入价格/1M",
  output_price_per_1m: "输出价格/1M",
  cache_read_price_per_1m: "缓存读取/1M",
  cache_write_price_per_1m: "缓存写入/1M",
  total_requests: "请求数",
  total_tokens: "Token 数",
  provider_cost_amount: "供应商成本",
  tenant_wholesale_amount: "租户批发价",
  end_user_revenue_amount: "客户付款金额",
  payment_order_id: "支付订单",
  payment_order_no: "支付订单号",
  refund_no: "退款单号",
  provider_refund_no: "渠道退款号",
  transaction_type: "交易类型",
  payment_gross_amount: "付款总额",
  payment_channel_fee: "支付通道费",
  platform_share_amount: "平台分成",
  tenant_share_amount: "租户分成",
  settled_at: "结算时间",
  reversed_at: "冲正时间",
  beneficiary_user_id: "受益账号",
  source_user_id: "来源账号",
  commission_base_amount: "佣金基数",
  commission_rate: "佣金比例",
  commission_amount: "佣金金额",
  frozen_until: "冻结至",
  withdrawal_id: "提现申请",
  payout_method: "提现方式",
  payout_account_mask: "提现账号",
  reviewed_by: "审核人",
  reviewed_at: "审核时间",
  policy_type: "政策类型",
  variant: "版本变体",
  title: "标题",
  content: "正文",
  version: "版本号",
  effective_at: "生效时间",
  product_code: "套餐编码",
  product_name: "充值套餐/付费商品",
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
  amount: "金额",
  gross_amount: "应付金额",
  net_amount: "净额",
  verified: "已验证",
  raw_payload: "原始载荷",
  event_type: "事件类型",
  from_status: "原状态",
  to_status: "目标状态",
  reason: "原因",
  actor_type: "触发方",
  callback_id: "回调记录",
  channel_trade_no: "渠道交易号",
  channel_code: "渠道编码",
  channel_type: "渠道类型",
  signature_valid: "签名有效",
  processed: "已处理",
  process_result: "处理结果",
  raw_headers: "原始请求头",
  raw_body: "原始请求体",
  local_amount: "本地金额",
  channel_amount: "渠道金额",
  difference_type: "差异类型",
  resolved_note: "处理备注",
  reconciled_at: "对账时间",
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
  approval_no: "原因/审批号",
  provider_request_id: "上游请求编号",
  attempt_no: "尝试次数",
  latency_ms: "延迟",
  error_code: "错误码",
  error_message: "错误信息",
  description: "描述",
  report_type: "举报类型",
  content_type: "内容类型",
  chat_session_id: "会话",
  chat_message_id: "消息",
  requested_from: "来源端",
  balance_policy: "余额处理规则",
  processed_at: "处理时间",
  risk_type: "风控类型",
  risk_level: "风险等级",
  subject_type: "主体类型",
  subject_id: "主体 ID",
  ip_address: "IP",
  device_id: "设备 ID",
  distribution_channel: "分发渠道",
  build_number: "Build",
  release_status: "发布状态",
  min_supported_version: "最低支持版本",
  force_update: "强制更新",
  download_url: "下载地址",
  changelog: "更新说明",
  file_size_bytes: "文件大小 Bytes",
  checksum_sha256: "SHA-256"
};

const moneyFieldKeys = new Set([
  "amount",
  "base_fee_amount",
  "bonus_amount",
  "cash_balance",
  "channel_amount",
  "commission_amount",
  "commission_base_amount",
  "credit_limit",
  "daily_budget",
  "discount_amount",
  "face_value_amount",
  "frozen_balance",
  "gross_amount",
  "included_credit",
  "input_price_per_1k",
  "input_price_per_1m",
  "cache_read_price_per_1m",
  "cache_write_price_per_1m",
  "local_amount",
  "min_commit_amount",
  "monthly_budget",
  "net_amount",
  "output_price_per_1k",
  "output_price_per_1m",
  "paid_amount",
  "payment_channel_fee",
  "payment_gross_amount",
  "platform_share_amount",
  "prepaid_balance",
  "provider_cost_amount",
  "sale_amount",
  "subtotal_amount",
  "tax_amount",
  "tenant_share_amount",
  "tenant_wholesale_amount",
  "total_amount"
]);

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
    alipay_qr: "支付宝二维码支付",
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
    subscription_usage: "SaaS 套餐 + 用量",
    prepaid: "预付钱包",
    postpaid: "后付授信",
    revenue_share: "收入分成"
  },
  tenant_type: {
    platform_default: "默认租户",
    standard: "标准租户",
    enterprise: "企业租户",
    partner: "渠道/代理租户",
    internal: "内部测试租户"
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
  },
  status: {
    active: "启用",
    suspended: "停用",
    archived: "归档",
    draft: "草稿",
    CREATED: "已创建",
    PENDING: "待处理",
    PAYING: "支付中",
    PROCESSING: "处理中",
    PAID: "已支付",
    FULFILLED: "已到账",
    FAILED: "失败",
    CANCELLED: "已取消",
    REFUNDING: "退款中",
    REFUNDED: "已退款",
    pending: "待处理",
    reviewing: "审核中",
    resolved: "已处理",
    rejected: "已驳回",
    approved: "已通过",
    closed: "已关闭",
    verified: "已验证",
    received: "已接收"
  },
  release_status: {
    draft: "草稿",
    published: "已发布",
    paused: "暂停下载",
    archived: "归档"
  },
  policy_type: {
    terms: "用户协议",
    privacy: "隐私政策",
    disclaimer: "AI 生成内容免责声明",
    report: "内容举报说明",
    help: "帮助中心"
  },
  event_type: {
    "order.create": "订单创建",
    "order.sync": "主动查单",
    "order.paid": "支付确认",
    "order.fulfilled": "权益到账",
    "refund.request": "退款申请",
    "payment.webhook": "支付回调"
  },
  actor_type: {
    admin: "平台后台",
    customer: "客户",
    system: "系统",
    webhook: "支付回调"
  },
  transaction_type: {
    ios_iap: "Apple IAP",
    android_checkout: "Android 统一收银台",
    web_checkout: "Web 收银台",
    refund: "退款"
  },
  difference_type: {
    missing_local: "本地缺失",
    missing_channel: "渠道缺失",
    amount_mismatch: "金额不一致",
    status_mismatch: "状态不一致"
  },
  risk_level: {
    low: "低",
    medium: "中",
    high: "高",
    critical: "严重"
  }
};

function getFieldLabel(key: string, labels: Record<string, string>) {
  return labels[key] ?? fieldLabels[key] ?? key;
}

function normalizeField(field: FieldSpec): NormalizedFieldSpec {
  if (Array.isArray(field)) {
    const [key, label, kind = "text", optionsEndpoint, optionLabelKey, staticOptions] = field;
    return {
      key,
      label,
      kind,
      optionsEndpoint,
      optionLabelKey,
      options: staticOptions
    };
  }
  return {
    ...field,
    kind: field.kind ?? "text",
    options: field.options
  };
}

function shouldShowField(field: NormalizedFieldSpec, values: Record<string, unknown>) {
  if (!field.visibleWhen) return true;
  return Object.entries(field.visibleWhen).every(([key, expected]) => values[key] === expected);
}

function safeJsonParse(value: unknown, fieldLabel: string) {
  if (value === undefined || value === null || value === "") return {};
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new Error(`${fieldLabel} 不是合法 JSON`);
  }
}

function formatMoney(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return String(value ?? "-");
  return `¥${(amount / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

const REMOTE_OPTION_PAGE_SIZE = 500;
const hiddenAutoDetailKeys = new Set([
  "metadata",
  "settings",
  "payment_policy",
  "config",
  "draft_value",
  "published_value"
]);

function renderValue(value: unknown, key?: string, kind?: FieldKind, options?: FieldOption[]) {
  if (key === "visible_platforms" && typeof value === "string") {
    return value
      .split(",")
      .filter(Boolean)
      .map((platform) => valueLabels.platform?.[platform] ?? platform)
      .join("、") || "-";
  }
  if ((kind === "money" || (key && moneyFieldKeys.has(key))) && value !== null && value !== undefined) {
    return <Typography.Text strong>{formatMoney(value)}</Typography.Text>;
  }
  if (options?.length && (typeof value === "string" || Array.isArray(value))) {
    if (Array.isArray(value)) {
      return value.map((item) => options.find((option) => option.value === item)?.label ?? item).join("、");
    }
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

function buildPayload(values: Record<string, unknown>, fields: NormalizedFieldSpec[]) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const { key, kind } = field;
    if (field.readonly) continue;
    const value = values[key];
    if (field.sensitive && (value === undefined || value === null || value === "")) continue;
    if (kind === "json") {
      payload[key] = safeJsonParse(value, field.label);
    } else if (kind === "money") {
      payload[key] = value === undefined || value === null || value === "" ? null : Math.round(Number(value) * 100);
    } else if (kind === "multi_select") {
      payload[key] = Array.isArray(value) ? value : [];
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

  const columns = useMemo(() => props.columns.map(normalizeField), [props.columns]);
  const detailFields = useMemo(() => (props.detailFields ?? []).map(normalizeField), [props.detailFields]);
  const editableFields = useMemo(() => (props.editableFields ?? []).map(normalizeField), [props.editableFields]);
  const editable = useMemo(
    () => (props.canEdit === false ? [] : editableFields),
    [props.canEdit, editableFields]
  );
  const labelMap = useMemo(
    () => Object.fromEntries([...columns, ...detailFields, ...editableFields].map((field) => [field.key, field.label])),
    [columns, detailFields, editableFields]
  );
  const fieldMap = useMemo(
    () => new Map([...columns, ...detailFields, ...editableFields].map((field) => [field.key, field])),
    [columns, detailFields, editableFields]
  );

  async function load(page = 1, pageSize = 20, searchOverride?: string) {
    setLoading(true);
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const merged: Record<string, unknown> = { page, pageSize };
      const keyword = searchOverride ?? search;
      if (keyword) {
        merged.search = keyword;
      }
      searchParams.forEach((value, key) => {
        if (!["page", "pageSize", "search"].includes(key)) {
          merged[key] = value;
        }
      });
      const query = toQuery(merged);
      const separator = props.endpoint.includes("?") ? "&" : "?";
      const res = await apiFetch<ApiList>(`${props.endpoint}${separator}${query}`);
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
  }, [props.endpoint]);

  useEffect(() => {
    const allFields = [...columns, ...editable];
    const staticEntries = allFields
      .filter((field) => ["select", "multi_select"].includes(field.kind) && field.options?.length)
      .map((field) => [field.key, field.options ?? []] as const);
    if (staticEntries.length) {
      setOptions((current) => ({ ...current, ...Object.fromEntries(staticEntries) }));
    }
    const selectFields = allFields.filter((field) =>
      ["select", "multi_select"].includes(field.kind) && (field.optionsEndpoint || field.optionsResource)
    );
    if (!selectFields.length) return;
    Promise.all(
      selectFields.map(async (field) => {
        const endpoint = field.optionsResource ? `/api/admin/options/${field.optionsResource}` : field.optionsEndpoint!;
        const separator = endpoint.includes("?") ? "&" : "?";
        const res = await apiFetch<ApiList>(`${endpoint}${separator}${toQuery({ pageSize: REMOTE_OPTION_PAGE_SIZE })}`);
        return [
          field.key,
          res.data.map((item) => ({
            value: String(item.value ?? item.id),
            disabled: Boolean(item.disabled),
      label: String(
              item.label ??
                item[field.optionLabelKey ?? "name"] ??
                item.email ??
                item.code ??
                item.public_model_code ??
                item.id
            ),
            meta: item.meta ?? {}
          }))
        ] as const;
      })
    )
      .then((entries) => setOptions((current) => ({ ...current, ...Object.fromEntries(entries) })))
      .catch((error) => message.error((error as Error).message));
  }, [props.endpoint, columns, editable]);

  const tableColumns = useMemo<ColumnsType<any>>(() => {
    const base = columns.map((field) => ({
      title: field.label,
      dataIndex: field.key,
      ellipsis: true,
      render: (value: unknown) =>
        field.sensitive
          ? <Typography.Text type="secondary">已保护</Typography.Text>
          : renderValue(value, field.key, field.kind, ["select", "multi_select"].includes(field.kind) ? options[field.key] : undefined)
    }));
    const renderActions = (_: unknown, row: any) => {
      const deleteDisabled = props.deleteDisabled?.(row) ?? false;
      return (
        <Space>
          <Button size="small" onClick={() => setDetail(row)}>
            详情
          </Button>
          {editable.length > 0 && (
            <Button size="small" onClick={() => startEdit(row)}>
              编辑
            </Button>
          )}
          {props.canDelete && (
            <Button size="small" danger disabled={deleteDisabled} onClick={() => confirmDelete(row)}>
              删除
            </Button>
          )}
          {props.rowActions?.(row, () => load())}
        </Space>
      );
    };
    if (!editable.length && !props.canDelete) {
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
        width: props.canDelete || props.rowActions ? 230 : 142,
        fixed: "right",
        render: renderActions
      }
    ];
  }, [columns, editable.length, options, props.canDelete, props.deleteDisabled, props.rowActions]);

  function startEdit(row?: any) {
    setEditing(row ?? null);
    const values = row ? { ...row } : {};
    form.resetFields();
    for (const { key, kind, sensitive } of editable) {
      if (sensitive) {
        values[key] = "";
        continue;
      }
      if (kind === "json" && values[key] !== undefined) {
        values[key] = JSON.stringify(values[key] ?? {}, null, 2);
      }
      if (kind === "money" && values[key] !== undefined && values[key] !== null) {
        values[key] = Number(values[key]) / 100;
      }
    }
    form.setFieldsValue(values);
    setOpen(true);
  }

  function confirmDelete(row: any) {
    Modal.confirm({
      title: props.deleteConfirmTitle ?? "确认删除这条记录？",
      content: props.deleteConfirmDescription ?? "删除操作会写入审计日志，请确认业务影响。",
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      async onOk() {
        try {
          await apiFetch(`${props.endpoint}/${row[props.rowKey]}`, {
            method: "DELETE",
            body: JSON.stringify({
              reason: props.deleteReason ?? "admin delete from resource page"
            })
          });
          message.success("已删除");
          await load();
        } catch (error) {
          message.error((error as Error).message);
          throw error;
        }
      }
    });
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

  async function loadRemoteOptions(field: NormalizedFieldSpec, keyword = "") {
    if (!field.optionsResource && !field.optionsEndpoint) return;
    const currentValues = form.getFieldsValue(true);
    const params: Record<string, unknown> = {
      pageSize: REMOTE_OPTION_PAGE_SIZE,
      search: keyword
    };
    field.dependsOn?.forEach((key) => {
      params[key] = currentValues[key];
    });
    if (field.optionsResource) {
      for (const key of ["tenant_id", "project_id", "platform"]) {
        if (currentValues[key]) params[key] = currentValues[key];
      }
    }
    const endpoint = field.optionsResource ? `/api/admin/options/${field.optionsResource}` : field.optionsEndpoint!;
    const separator = endpoint.includes("?") ? "&" : "?";
    const res = await apiFetch<ApiList>(`${endpoint}${separator}${toQuery(params)}`);
    setOptions((current) => ({
      ...current,
      [field.key]: res.data.map((item) => ({
        value: String(item.value ?? item.id),
        disabled: Boolean(item.disabled),
        label: String(
          item.label ??
            item[field.optionLabelKey ?? "name"] ??
            item.email ??
            item.code ??
            item.public_model_code ??
            item.id
        ),
        meta: item.meta ?? {}
      }))
    }));
  }

  function handleSelectChange(field: NormalizedFieldSpec, value: unknown) {
    if (!field.autofillFromOption || Array.isArray(value)) return;
    const selected = (options[field.key] ?? []).find((item) => item.value === String(value));
    if (!selected?.meta) return;
    const patch: Record<string, unknown> = {};
    for (const [targetKey, metaKey] of Object.entries(field.autofillFromOption)) {
      const nextValue = selected.meta[metaKey];
      if (nextValue !== undefined && nextValue !== null && nextValue !== "") {
        patch[targetKey] = nextValue;
      }
    }
    if (Object.keys(patch).length) {
      form.setFieldsValue(patch);
    }
  }

  function handleValuesChange(changed: Record<string, unknown>) {
    const changedKeys = Object.keys(changed);
    const dependentFields = editable.filter((field) =>
      !changedKeys.includes(field.key) && field.dependsOn?.some((key) => changedKeys.includes(key))
    );
    if (!dependentFields.length) return;
    const resetValues = Object.fromEntries(dependentFields.map((field) => [field.key, undefined]));
    form.setFieldsValue(resetValues);
    dependentFields.forEach((field) => {
      loadRemoteOptions(field).catch((error) => message.error((error as Error).message));
    });
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setSearch(nextValue);
    if (!nextValue) {
      load(1, 20, "").catch((error) => message.error((error as Error).message));
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3}>{props.title}</Typography.Title>
          <Typography.Text type="secondary">{props.description ?? "筛选、查看详情和执行受控操作"}</Typography.Text>
        </div>
        <Space>
          <Input.Search
            allowClear
            placeholder="搜索"
            value={search}
            onChange={handleSearchChange}
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
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          onFinishFailed={() => message.warning("请先补全表单中的必填项")}
          onValuesChange={handleValuesChange}
          scrollToFirstError
        >
          {editable.map((field) => (
            <Form.Item noStyle shouldUpdate key={field.key}>
              {({ getFieldsValue }) => {
                const values = getFieldsValue(true);
                if (!shouldShowField(field, values)) return null;
                const rules = field.required ? [{ required: true, message: `请填写${field.label}` }] : undefined;
                return (
                  <Form.Item
                    extra={field.help}
                    label={field.label}
                    name={field.key}
                    rules={rules}
                    valuePropName={field.kind === "boolean" ? "checked" : "value"}
                  >
                    {field.kind === "number" ? (
                      <InputNumber className="full-width" disabled={field.readonly} />
                    ) : field.kind === "money" ? (
                      <InputNumber className="full-width" disabled={field.readonly} min={0} precision={2} step={1} addonAfter="元" />
                    ) : field.kind === "boolean" ? (
                      <Switch disabled={field.readonly} />
                    ) : field.kind === "select" || field.kind === "multi_select" ? (
                      <Select
                        allowClear
                        disabled={field.readonly}
                        mode={field.kind === "multi_select" || field.mode === "multiple" ? "multiple" : undefined}
                        showSearch
                        filterOption={field.remoteSearch ? false : undefined}
                        optionFilterProp="label"
                        options={options[field.key] ?? []}
                        placeholder={field.placeholder ?? "请选择"}
                        onFocus={() => loadRemoteOptions(field).catch((error) => message.error((error as Error).message))}
                        onSearch={
                          field.remoteSearch
                            ? (keyword) => loadRemoteOptions(field, keyword).catch((error) => message.error((error as Error).message))
                            : undefined
                        }
                        onChange={(value) => handleSelectChange(field, value)}
                      />
                    ) : field.kind === "json" ? (
                      <Input.TextArea rows={8} disabled={field.readonly} placeholder={field.placeholder ?? "{ }"} />
                    ) : field.kind === "textarea" ? (
                      <Input.TextArea rows={4} disabled={field.readonly} placeholder={field.placeholder} />
                    ) : (
                      <Input
                        disabled={field.readonly}
                        placeholder={field.sensitive ? "留空表示不修改敏感配置" : field.placeholder}
                        type={field.kind === "url" ? "url" : undefined}
                      />
                    )}
                  </Form.Item>
                );
              }}
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
            {(detailFields.length
              ? detailFields.map((field) => [field.key, detail[field.key]] as const)
              : Object.entries(detail).filter(([key]) => !hiddenAutoDetailKeys.has(key))
            ).map(([key, value]) => (
              <Descriptions.Item key={key} label={getFieldLabel(key, labelMap)}>
                {fieldMap.get(key)?.sensitive
                  ? <Typography.Text type="secondary">已保护，不回显</Typography.Text>
                  : renderValue(value, key, fieldMap.get(key)?.kind, options[key])}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
