export type AdminPermission =
  | "provider.read"
  | "provider.write"
  | "provider.credential.write"
  | "model.read"
  | "model.write"
  | "route.read"
  | "route.write"
  | "price.read"
  | "price.write"
  | "wallet.read"
  | "wallet.adjust"
  | "payment.read"
  | "payment.refund"
  | "payment.reconcile"
  | "commission.read"
  | "commission.approve"
  | "user.read"
  | "user.suspend"
  | "api_key.read"
  | "api_key.revoke"
  | "request_log.read"
  | "request_log.read_sensitive"
  | "config.read"
  | "config.write"
  | "config.publish"
  | "audit.read"
  | "customer_assignment.read"
  | "customer_assignment.write"
  | "tenant.read"
  | "tenant.write"
  | "tenant.project.read"
  | "tenant.project.write"
  | "tenant.customer.read"
  | "tenant.customer.write"
  | "tenant.billing.read"
  | "tenant.billing.write"
  | "tenant.model.read"
  | "tenant.model.write"
  | "platform.tenant.read_all"
  | "platform.tenant.write_all"
  | "api_key.write"
  | "provider.sync_models";

export interface AdminSessionUser {
  id: string;
  email: string;
  userType: string;
  accountType: "admin" | "tenant" | "customer";
  roles: string[];
  permissions: AdminPermission[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type Platform = "ios" | "android" | "web" | "api";

export interface TenantContext {
  tenant_id: string;
  project_id: string | null;
  tenant_customer_id?: string | null;
  customer_id?: string | null;
}

export interface AuthSession {
  access_token: string;
  refresh_token?: string;
  token?: string;
  token_type: "Bearer";
  expires_in: number;
  user: {
    id: string;
    email: string | null;
    phone?: string | null;
    userType: string;
    accountType: "customer";
  };
  tenant?: { id: string; tenant_code?: string; name?: string };
  project?: { id: string; project_code?: string; name?: string } | null;
  tenant_customer?: { id: string; customer_code?: string } | null;
  wallet?: Wallet;
}

export interface AppConfig {
  tenant_id: string;
  project_id: string | null;
  tenant_billing_mode?: string;
  tenant_plan_code?: string | null;
  platform: Platform | string;
  app_version?: string | null;
  package_name?: string | null;
  distribution_channel: string;
  region: string;
  review_mode: boolean;
  legal_approved: boolean;
  available_payment_methods: PaymentMethodCode[];
  show_web_payment_link: boolean;
  web_payment_url: string | null;
  payment_page_notice: string;
  settlement_notice?: string;
  ios_iap_enabled: boolean;
  android_unified_checkout_enabled: boolean;
  developer_api_enabled: boolean;
  referral_enabled: boolean;
  model_list_enabled: boolean;
  chat_enabled: boolean;
  support_contact: Record<string, unknown>;
  announcement: string | null;
  privacy_notice_variant: string;
  content_safety_notice: string;
  min_supported_app_version: string | null;
  maintenance_mode: boolean;
  app_download?: AppDownloadConfig;
  feature_flags: Record<string, boolean | string | number | null>;
}

export interface AppRelease {
  id: string;
  tenant_id: string;
  project_id: string | null;
  platform: "ios" | "android";
  distribution_channel: string;
  version: string;
  build_number?: number | null;
  release_status: "draft" | "published" | "paused" | "archived" | string;
  min_supported_version?: string | null;
  force_update: boolean;
  download_url?: string | null;
  changelog?: string | null;
  file_size_bytes?: number | null;
  checksum_sha256?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
}

export interface SiteConfig {
  branding: {
    site_name: string;
    logo_url?: string | null;
    slogan?: string | null;
    hero_title: string;
    hero_subtitle: string;
    footer_text?: string | null;
    icp_text?: string | null;
  };
  navigation: Array<{
    key: string;
    label: string;
    href?: string;
    visible: boolean;
  }>;
  announcements: Array<{
    title: string;
    content: string;
    level: "info" | "warning" | "success" | string;
    start_at?: string;
    end_at?: string;
    visible: boolean;
  }>;
  faq: Array<{
    question: string;
    answer: string;
    sort_order: number;
    visible: boolean;
  }>;
  support: {
    email?: string | null;
    work_time?: string | null;
    telegram?: string | null;
    discord?: string | null;
  };
  legal: {
    terms_url?: string | null;
    privacy_url?: string | null;
    ai_disclaimer_url?: string | null;
  };
}

export interface AppDownloadConfig {
  enabled: boolean;
  show_on_web_home: boolean;
  show_on_console: boolean;
  show_on_payment_success: boolean;
  title: string;
  subtitle?: string | null;
  ios: {
    enabled: boolean;
    app_store_url?: string | null;
    testflight_url?: string | null;
    download_url?: string | null;
    version?: string | null;
    min_supported_version?: string | null;
    release_notes?: string | null;
  };
  android: {
    enabled: boolean;
    apk_url?: string | null;
    official_url?: string | null;
    markets?: Array<{ channel: string; name: string; url: string; enabled: boolean }>;
    version?: string | null;
    min_supported_version?: string | null;
    release_notes?: string | null;
  };
  qr_code_url?: string | null;
  release_notes?: string | null;
  releases?: AppRelease[];
}

export interface SiteConfigPayload {
  tenant: { id: string; tenant_code: string; name: string; tenant_type?: string; billing_mode?: string; current_plan_code?: string | null };
  project: { id: string; project_code: string; name: string; platform: string } | null;
  platform: Platform | string;
  site_config: SiteConfig;
  app_download: AppDownloadConfig;
  web_payment_entry: Record<string, unknown>;
  payment_methods?: PaymentMethod[];
  maintenance_mode: boolean;
  feature_flags: Record<string, unknown>;
  resolved_at: string;
}

export interface ModelInfo {
  id: string;
  model_code: string;
  display_name: string;
  family?: string | null;
  modality?: string[];
  max_context_tokens: number | null;
  default_max_output_tokens: number | null;
  capabilities: {
    stream: boolean;
    tools: boolean;
    json_mode: boolean;
  };
  limits?: {
    rpm: number | null;
    tpm: number | null;
    daily_budget: number | null;
    monthly_budget: number | null;
  };
  enabled_features?: string[];
  price: {
    version: string;
    currency: string;
    mode: string;
    input_per_1k: number | null;
    output_per_1k: number | null;
  } | null;
  metadata?: Record<string, unknown>;
}

export interface ChatEstimate {
  id?: string;
  model: string;
  input_tokens: number;
  output_token_limit: number;
  max_output_tokens: number;
  estimated_cost: number;
  current_balance: number;
  enough_balance: boolean;
  currency: string;
  created_at?: string;
}

export interface ChatUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  actual_cost: number;
  model: string;
  charged_at: string;
}

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  created_at: string;
  usage?: ChatUsage | null;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  model_code: string;
  created_at?: string;
  updated_at?: string;
  messages: ChatMessage[];
}

export interface Wallet {
  id: string;
  currency: string;
  cash_balance: number;
  bonus_balance: number;
  frozen_balance: number;
  credit_limit: number;
  available_balance: number;
  status: string;
  updated_at: string;
}

export interface WalletLedgerItem {
  id: string;
  event_type: string;
  direction: "credit" | "debit" | "freeze" | "unfreeze";
  balance_type: "cash" | "bonus" | "frozen" | "credit";
  amount: number;
  currency: string;
  balance_after: number | null;
  related_type?: string | null;
  related_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface BillingRecord {
  id: string;
  request_id?: string | null;
  public_model_code?: string | null;
  amount: number;
  currency: string;
  billing_status: string;
  price_version?: string | null;
  total_tokens?: number | null;
  latency_ms?: number | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface PaymentProduct {
  id: string;
  product_code: string;
  name: string;
  display_name: string;
  display_description?: string | null;
  badge?: string | null;
  product_type: string;
  face_value_amount: number;
  bonus_amount: number;
  sale_amount: number;
  currency: string;
  platform: Platform | string;
  project_id?: string | null;
  ios_product_id?: string | null;
  features?: string[];
  valid_days?: number | null;
  payment_methods: PaymentMethodCode[];
  metadata?: Record<string, unknown>;
}

export type PaymentMethodCode =
  | "apple_iap"
  | "alipay_app_pay"
  | "wechat_app_pay"
  | "alipay_app"
  | "wechat_app"
  | "card_hosted_checkout"
  | "unionpay_or_bank_card"
  | "alipay_qr"
  | "alipay_web"
  | "wechat_native"
  | "card_checkout"
  | "enterprise_transfer"
  | string;

export interface PaymentMethod {
  channel_code: string;
  channel_type: string;
  display_name: string;
  platform: Platform | string;
  payment_method: PaymentMethodCode;
  settlement_mode: string;
  fee_rate_bps: number | null;
  sort_order: number;
  config?: Record<string, unknown>;
}

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "PAYING"
  | "PROCESSING"
  | "PAID"
  | "FULFILLED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDING"
  | "REFUNDED";

export interface PaymentOrder {
  id: string;
  order_no: string;
  status: PaymentStatus | string;
  platform: Platform | string;
  payment_method: PaymentMethodCode;
  checkout_channel: string;
  amount: number;
  currency: string;
  product: {
    id?: string | null;
    product_code?: string | null;
    name?: string | null;
    product_type?: string | null;
    face_value_amount: number;
    bonus_amount: number;
    sale_amount: number;
  };
  payment_action?: Record<string, unknown>;
  paid_at?: string | null;
  fulfilled_at?: string | null;
  closed_at?: string | null;
  created_at: string;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  masked_key: string;
  key?: string;
  status: string;
  model_whitelist: string[];
  ip_whitelist: string[];
  limits: {
    rpm: number | null;
    tpm: number | null;
    daily_budget: number | null;
    monthly_budget: number | null;
  };
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface RequestLog {
  id: string;
  request_id: string;
  source: "app_chat" | "developer_api" | "admin_test" | string;
  model_code: string;
  status: string;
  stream: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_amount: number;
  currency: string;
  latency_ms: number | null;
  finish_reason?: string | null;
  error_code?: string | null;
  created_at: string;
}

export interface ReferralSummary {
  invite_code: string;
  invited_customers: number;
  pending_commission: number;
  available_commission: number;
  withdrawn_commission: number;
  currency: string;
}

export interface CommissionRecord {
  id: string;
  source_user_id?: string | null;
  source_email?: string | null;
  payment_order_id?: string | null;
  commission_base_amount: number;
  commission_rate: number;
  commission_amount: number;
  currency: string;
  status: string;
  frozen_until?: string | null;
  created_at: string;
}

export interface CommissionWithdrawal {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payout_method?: string | null;
  payout_account_mask?: string | null;
  requested_from?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface PolicyDocument {
  policy_type: "terms" | "privacy" | "disclaimer" | "report" | "help" | string;
  variant: string;
  title: string;
  content: string;
  version: number;
  effective_at: string;
}

export interface ContentReport {
  id: string;
  target_type: string;
  target_id?: string | null;
  reason: string;
  description?: string | null;
  status: string;
  created_at: string;
}

export interface AccountDeletionRequest {
  id: string;
  status: string;
  reason?: string | null;
  balance_policy?: string | null;
  created_at: string;
  processed_at?: string | null;
}

export interface AdminDashboardMetric {
  todayRevenue: number;
  todayRequests: number;
  todayTokens: number;
  activeCustomers: number;
  failedRequests: number;
  abnormalPayments: number;
}
