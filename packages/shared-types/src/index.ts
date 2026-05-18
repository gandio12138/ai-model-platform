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
