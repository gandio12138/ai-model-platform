import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AdminService } from "./admin.service.js";
import { AdminAuthGuard } from "../common/auth.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";

type ReqWithUser = {
  user: any;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
};

function actor(req: ReqWithUser) {
  return {
    id: req.user.id,
    ip: req.ip,
    userAgent: String(req.headers["user-agent"] ?? "")
  };
}

@UseGuards(AdminAuthGuard)
@Controller("/api/admin")
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @RequirePermissions("payment.read")
  @Get("dashboard")
  dashboard(@Req() req: ReqWithUser) {
    return this.admin.dashboard(req.user);
  }

  @Get("options/:resource")
  options(@Param("resource") resource: string, @Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.options(resource, query, req.user);
  }

  @RequirePermissions("user.read")
  @Get("users")
  users(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("users", query, req.user);
  }

  @RequirePermissions("tenant.read")
  @Get("tenants")
  tenants(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("tenants", query, req.user);
  }

  @RequirePermissions("platform.tenant.write_all")
  @Post("tenants")
  createTenant(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("tenants", body, req.user, actor(req));
  }

  @RequirePermissions("platform.tenant.write_all")
  @Patch("tenants/:id")
  updateTenant(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("tenants", id, body, req.user, actor(req));
  }

  @RequirePermissions("platform.tenant.write_all")
  @Delete("tenants/:id")
  deleteTenant(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.deleteTenant(id, body, req.user, actor(req));
  }

  @RequirePermissions("tenant.read")
  @Get("tenant-memberships")
  tenantMemberships(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("tenantMemberships", query, req.user);
  }

  @RequirePermissions("platform.tenant.write_all")
  @Post("tenant-memberships")
  createTenantMembership(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("tenantMemberships", body, req.user, actor(req));
  }

  @RequirePermissions("platform.tenant.write_all")
  @Patch("tenant-memberships/:id")
  updateTenantMembership(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("tenantMemberships", id, body, req.user, actor(req));
  }

  @RequirePermissions("platform.tenant.write_all")
  @Post("tenant-accounts")
  createTenantAccount(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.createTenantAccount(body, req.user, actor(req));
  }

  @RequirePermissions("tenant.project.read")
  @Get("tenant-projects")
  tenantProjects(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("tenantProjects", query, req.user);
  }

  @RequirePermissions("tenant.project.write")
  @Post("tenant-projects")
  createTenantProject(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("tenantProjects", body, req.user, actor(req));
  }

  @RequirePermissions("tenant.project.write")
  @Patch("tenant-projects/:id")
  updateTenantProject(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("tenantProjects", id, body, req.user, actor(req));
  }

  @RequirePermissions("tenant.customer.read")
  @Get("tenant-customers")
  tenantCustomers(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("tenantCustomers", query, req.user);
  }

  @RequirePermissions("tenant.customer.write")
  @Post("tenant-customers")
  createTenantCustomer(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("tenantCustomers", body, req.user, actor(req));
  }

  @RequirePermissions("tenant.customer.write")
  @Patch("tenant-customers/:id")
  updateTenantCustomer(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("tenantCustomers", id, body, req.user, actor(req));
  }

  @RequirePermissions("tenant.billing.read")
  @Get("tenant-plans")
  tenantPlans(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("tenantPlans", query, req.user);
  }

  @RequirePermissions("tenant.billing.write")
  @Post("tenant-plans")
  createTenantPlan(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("tenantPlans", body, req.user, actor(req));
  }

  @RequirePermissions("tenant.billing.write")
  @Patch("tenant-plans/:id")
  updateTenantPlan(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("tenantPlans", id, body, req.user, actor(req));
  }

  @RequirePermissions("tenant.billing.read")
  @Get("tenant-subscriptions")
  tenantSubscriptions(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("tenantSubscriptions", query, req.user);
  }

  @RequirePermissions("tenant.billing.write")
  @Post("tenant-subscriptions")
  createTenantSubscription(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("tenantSubscriptions", body, req.user, actor(req));
  }

  @RequirePermissions("tenant.billing.write")
  @Patch("tenant-subscriptions/:id")
  updateTenantSubscription(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("tenantSubscriptions", id, body, req.user, actor(req));
  }

  @RequirePermissions("tenant.billing.read")
  @Get("tenant-invoices")
  tenantInvoices(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("tenantInvoices", query, req.user);
  }

  @RequirePermissions("tenant.billing.write")
  @Patch("tenant-invoices/:id")
  updateTenantInvoice(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("tenantInvoices", id, body, req.user, actor(req));
  }

  @RequirePermissions("tenant.billing.read")
  @Post("tenants/:id/billing/preview")
  previewTenantInvoice(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.previewTenantInvoice(id, body, req.user);
  }

  @RequirePermissions("tenant.billing.write")
  @Post("tenants/:id/billing/generate-current-invoice")
  generateTenantInvoice(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.generateTenantInvoice(id, body, req.user, actor(req));
  }

  @RequirePermissions("tenant.billing.read")
  @Get("tenant-billing-rules")
  tenantBillingRules(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("tenantBillingRules", query, req.user);
  }

  @RequirePermissions("tenant.billing.write")
  @Post("tenant-billing-rules")
  createTenantBillingRule(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("tenantBillingRules", body, req.user, actor(req));
  }

  @RequirePermissions("tenant.billing.write")
  @Patch("tenant-billing-rules/:id")
  updateTenantBillingRule(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("tenantBillingRules", id, body, req.user, actor(req));
  }

  @RequirePermissions("tenant.model.read")
  @Get("tenant-model-authorizations")
  tenantModelAuthorizations(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("tenantModelAuthorizations", query, req.user);
  }

  @RequirePermissions("tenant.model.write")
  @Post("tenant-model-authorizations")
  createTenantModelAuthorization(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("tenantModelAuthorizations", body, req.user, actor(req));
  }

  @RequirePermissions("tenant.model.write")
  @Patch("tenant-model-authorizations/:id")
  updateTenantModelAuthorization(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("tenantModelAuthorizations", id, body, req.user, actor(req));
  }

  @RequirePermissions("tenant.model.read")
  @Get("tenant-model-prices")
  tenantModelPrices(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("tenantModelPrices", query, req.user);
  }

  @RequirePermissions("tenant.model.write")
  @Post("tenant-model-prices")
  createTenantModelPrice(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("tenantModelPrices", body, req.user, actor(req));
  }

  @RequirePermissions("tenant.model.write")
  @Patch("tenant-model-prices/:id")
  updateTenantModelPrice(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("tenantModelPrices", id, body, req.user, actor(req));
  }

  @RequirePermissions("tenant.billing.read")
  @Get("tenant-usage-aggregates")
  tenantUsageAggregates(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("tenantUsageAggregates", query, req.user);
  }

  @RequirePermissions("tenant.billing.write")
  @Post("tenant-usage-aggregates/rebuild")
  rebuildTenantUsageAggregates(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.rebuildUsageAggregates(body, req.user, actor(req));
  }

  @RequirePermissions("tenant.billing.read")
  @Get("tenant-revenue-shares")
  tenantRevenueShares(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("tenantRevenueShares", query, req.user);
  }

  @RequirePermissions("tenant.billing.write")
  @Patch("tenant-revenue-shares/:id")
  updateTenantRevenueShare(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("tenantRevenueShares", id, body, req.user, actor(req));
  }

  @RequirePermissions("api_key.read")
  @Get("api-keys")
  apiKeys(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("apiKeys", query, req.user);
  }

  @RequirePermissions("api_key.write")
  @Post("api-keys")
  createApiKey(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.createApiKey(body, req.user, actor(req));
  }

  @RequirePermissions("api_key.revoke")
  @Post("api-keys/:id/revoke")
  revokeApiKey(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.revokeApiKey(id, body, req.user, actor(req));
  }

  @RequirePermissions("customer_assignment.read")
  @Get("customer-assignments")
  customerAssignments(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("customerAssignments", query, req.user);
  }

  @RequirePermissions("customer_assignment.write")
  @Post("customer-assignments")
  createCustomerAssignment(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("customerAssignments", body, req.user, actor(req));
  }

  @RequirePermissions("customer_assignment.write")
  @Patch("customer-assignments/:id")
  updateCustomerAssignment(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("customerAssignments", id, body, req.user, actor(req));
  }

  @RequirePermissions("user.suspend")
  @Post("users/:id/suspend")
  suspendUser(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.suspendUser(id, body, req.user, actor(req));
  }

  @RequirePermissions("wallet.read")
  @Get("wallets/ledger")
  walletLedger(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("walletLedger", query, req.user);
  }

  @RequirePermissions("wallet.adjust")
  @Post("wallets/:userId/adjust")
  adjustWallet(@Param("userId") userId: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.adjustWallet(userId, body, req.user, actor(req));
  }

  @RequirePermissions("provider.read")
  @Get("providers")
  providers(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("providers", query, req.user);
  }

  @RequirePermissions("provider.write")
  @Post("providers")
  createProvider(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("providers", body, req.user, actor(req));
  }

  @RequirePermissions("provider.write")
  @Patch("providers/:id")
  updateProvider(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("providers", id, body, req.user, actor(req));
  }

  @RequirePermissions("provider.credential.write")
  @Post("providers/:id/credentials")
  createCredential(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.createCredential(id, body, req.user, actor(req));
  }

  @RequirePermissions("provider.read")
  @Post("providers/:id/test-connection")
  testProviderConnection(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.testProviderConnection(id, body, req.user, actor(req));
  }

  @RequirePermissions("provider.sync_models")
  @Post("providers/:id/sync-models")
  syncProviderModels(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.syncProviderModels(id, body, req.user, actor(req));
  }

  @RequirePermissions("provider.read")
  @Get("provider-credentials")
  providerCredentials(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("providerCredentials", query, req.user);
  }

  @RequirePermissions("model.read")
  @Get("models")
  models(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("models", query, req.user);
  }

  @RequirePermissions("model.write")
  @Post("models")
  createModel(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("models", body, req.user, actor(req));
  }

  @RequirePermissions("model.write")
  @Patch("models/:id")
  updateModel(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("models", id, body, req.user, actor(req));
  }

  @RequirePermissions("model.write")
  @Post("models/:id/verify-tools")
  verifyModelTools(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.verifyModelTools(id, body, req.user, actor(req));
  }

  @RequirePermissions("price.read")
  @Get("model-prices")
  prices(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("modelPrices", query, req.user);
  }

  @RequirePermissions("price.write")
  @Post("model-prices")
  createPrice(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("modelPrices", body, req.user, actor(req));
  }

  @RequirePermissions("price.write")
  @Patch("model-prices/:id")
  updatePrice(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("modelPrices", id, body, req.user, actor(req));
  }

  @RequirePermissions("route.read")
  @Get("model-routes")
  routes(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("modelRoutes", query, req.user);
  }

  @RequirePermissions("route.write")
  @Post("model-routes")
  createRoute(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("modelRoutes", body, req.user, actor(req));
  }

  @RequirePermissions("route.write")
  @Patch("model-routes/:id")
  updateRoute(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("modelRoutes", id, body, req.user, actor(req));
  }

  @RequirePermissions("route.write")
  @Post("model-routes/:id/disable")
  disableRoute(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("modelRoutes", id, { ...body, enabled: false }, req.user, actor(req));
  }

  @RequirePermissions("payment.read")
  @Get("payment/products")
  paymentProducts(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("paymentProducts", query, req.user);
  }

  @RequirePermissions("payment.reconcile")
  @Post("payment/products")
  createPaymentProduct(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("paymentProducts", body, req.user, actor(req));
  }

  @RequirePermissions("payment.reconcile")
  @Patch("payment/products/:id")
  updatePaymentProduct(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("paymentProducts", id, body, req.user, actor(req));
  }

  @RequirePermissions("payment.read")
  @Get("payment/product-visibility")
  paymentProductVisibility(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("paymentProductVisibility", query, req.user);
  }

  @RequirePermissions("payment.reconcile")
  @Post("payment/product-visibility")
  createPaymentProductVisibility(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("paymentProductVisibility", body, req.user, actor(req));
  }

  @RequirePermissions("payment.reconcile")
  @Patch("payment/product-visibility/:id")
  updatePaymentProductVisibility(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("paymentProductVisibility", id, body, req.user, actor(req));
  }

  @RequirePermissions("payment.read")
  @Get("payment/channels")
  paymentChannels(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("paymentChannels", query, req.user);
  }

  @RequirePermissions("payment.reconcile")
  @Post("payment/channels")
  createPaymentChannel(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("paymentChannels", body, req.user, actor(req));
  }

  @RequirePermissions("payment.reconcile")
  @Patch("payment/channels/:id")
  updatePaymentChannel(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("paymentChannels", id, body, req.user, actor(req));
  }

  @RequirePermissions("payment.read")
  @Get("payment/orders")
  paymentOrders(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("paymentOrders", query, req.user);
  }

  @RequirePermissions("payment.read")
  @Get("payment/orders/:id/detail")
  paymentOrderDetail(@Param("id") id: string, @Req() req: ReqWithUser) {
    return this.admin.paymentOrderDetail(id, req.user);
  }

  @RequirePermissions("payment.refund")
  @Post("payment/orders/:id/refund")
  refundOrder(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.refundOrder(id, body, req.user, actor(req));
  }

  @RequirePermissions("payment.reconcile")
  @Post("payment/orders/:id/sync")
  syncOrder(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.syncOrder(id, body, req.user, actor(req));
  }

  @RequirePermissions("payment.read")
  @Get("payment/callbacks")
  paymentCallbacks(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("paymentCallbacks", query, req.user);
  }

  @RequirePermissions("payment.read")
  @Get("payment/transactions")
  paymentTransactions(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("paymentTransactions", query, req.user);
  }

  @RequirePermissions("payment.read")
  @Get("payment/order-events")
  paymentOrderEvents(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("paymentOrderEvents", query, req.user);
  }

  @RequirePermissions("payment.read")
  @Get("payment/refunds")
  paymentRefunds(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("paymentRefunds", query, req.user);
  }

  @RequirePermissions("payment.reconcile")
  @Post("payment/callbacks/:id/replay")
  replayPaymentCallback(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.replayPaymentCallback(id, body, req.user, actor(req));
  }

  @RequirePermissions("payment.reconcile")
  @Get("reconciliation/records")
  reconciliationRecords(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("reconciliationRecords", query, req.user);
  }

  @RequirePermissions("config.read")
  @Get("distribution-policies")
  distributionPolicies(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("distributionPolicies", query, req.user);
  }

  @RequirePermissions("config.write")
  @Post("distribution-policies")
  createDistributionPolicy(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("distributionPolicies", body, req.user, actor(req));
  }

  @RequirePermissions("config.write")
  @Patch("distribution-policies/:id")
  updateDistributionPolicy(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("distributionPolicies", id, body, req.user, actor(req));
  }

  @RequirePermissions("config.read")
  @Get("app-releases")
  appReleases(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("appReleases", query, req.user);
  }

  @RequirePermissions("config.write")
  @Post("app-releases")
  createAppRelease(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("appReleases", body, req.user, actor(req));
  }

  @RequirePermissions("config.write")
  @Patch("app-releases/:id")
  updateAppRelease(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("appReleases", id, body, req.user, actor(req));
  }

  @RequirePermissions("config.read")
  @Get("configs")
  configs(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("configs", query, req.user);
  }

  @RequirePermissions("config.write")
  @Post("configs")
  createConfig(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("configs", body, req.user, actor(req));
  }

  @RequirePermissions("config.write")
  @Patch("configs/:id")
  updateConfig(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("configs", id, body, req.user, actor(req));
  }

  @RequirePermissions("config.publish")
  @Post("configs/:id/publish")
  publishConfig(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.publishConfig(id, body, req.user, actor(req));
  }

  @RequirePermissions("config.read")
  @Get("configs/:id/preview")
  previewConfig(@Param("id") id: string, @Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.previewConfig(id, query, req.user);
  }

  @RequirePermissions("config.read")
  @Get("configs/:id/versions")
  configVersions(@Param("id") id: string, @Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.configVersions(id, query, req.user);
  }

  @RequirePermissions("config.publish")
  @Post("configs/:id/rollback")
  rollbackConfig(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.rollbackConfig(id, body, req.user, actor(req));
  }

  @RequirePermissions("request_log.read")
  @Get("request-logs")
  requestLogs(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("requestLogs", query, req.user);
  }

  @RequirePermissions("request_log.read")
  @Get("provider-request-attempts")
  providerRequestAttempts(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("providerRequestAttempts", query, req.user);
  }

  @RequirePermissions("wallet.read")
  @Get("billing-records")
  billingRecords(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    this.admin.assertPlatformAdmin(req.user);
    return this.admin.list("billingRecords", query, req.user);
  }

  @RequirePermissions("commission.read")
  @Get("commissions")
  commissions(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("commissions", query, req.user);
  }

  @RequirePermissions("commission.read")
  @Get("commission-withdrawals")
  commissionWithdrawals(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("commissionWithdrawals", query, req.user);
  }

  @RequirePermissions("commission.approve")
  @Patch("commission-withdrawals/:id")
  updateCommissionWithdrawal(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("commissionWithdrawals", id, body, req.user, actor(req));
  }

  @RequirePermissions("commission.approve")
  @Post("commission-withdrawals/:id/review")
  reviewCommissionWithdrawal(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.reviewCommissionWithdrawal(id, body, req.user, actor(req));
  }

  @RequirePermissions("commission.approve")
  @Post("commissions/:id/approve")
  approveCommission(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.approveCommission(id, body, req.user, actor(req));
  }

  @RequirePermissions("commission.approve")
  @Post("commissions/:id/reverse")
  reverseCommission(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.reverseCommission(id, body, req.user, actor(req));
  }

  @RequirePermissions("audit.read")
  @Get("audit-logs")
  auditLogs(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("auditLogs", query, req.user);
  }

  @RequirePermissions("config.read")
  @Get("policy-documents")
  policyDocuments(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("policyDocuments", query, req.user);
  }

  @RequirePermissions("config.write")
  @Post("policy-documents")
  createPolicyDocument(@Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.create("policyDocuments", body, req.user, actor(req));
  }

  @RequirePermissions("config.write")
  @Patch("policy-documents/:id")
  updatePolicyDocument(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("policyDocuments", id, body, req.user, actor(req));
  }

  @RequirePermissions("audit.read")
  @Get("content-reports")
  contentReports(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("contentReports", query, req.user);
  }

  @RequirePermissions("audit.read")
  @Patch("content-reports/:id")
  updateContentReport(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("contentReports", id, body, req.user, actor(req));
  }

  @RequirePermissions("audit.read")
  @Get("account-deletion-requests")
  accountDeletionRequests(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("accountDeletionRequests", query, req.user);
  }

  @RequirePermissions("audit.read")
  @Patch("account-deletion-requests/:id")
  updateAccountDeletionRequest(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.update("accountDeletionRequests", id, body, req.user, actor(req));
  }

  @RequirePermissions("audit.read")
  @Get("risk-events")
  riskEvents(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("riskEvents", query, req.user);
  }
}
