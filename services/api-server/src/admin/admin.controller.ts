import {
  Body,
  Controller,
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

  @RequirePermissions("user.read")
  @Get("users")
  users(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("users", query, req.user);
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
  @Get("payment/channels")
  paymentChannels(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
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
    return this.admin.list("paymentCallbacks", query, req.user);
  }

  @RequirePermissions("payment.reconcile")
  @Get("reconciliation/records")
  reconciliationRecords(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("reconciliationRecords", query, req.user);
  }

  @RequirePermissions("config.read")
  @Get("distribution-policies")
  distributionPolicies(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
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
  @Get("configs")
  configs(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
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

  @RequirePermissions("wallet.read")
  @Get("billing-records")
  billingRecords(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("billingRecords", query, req.user);
  }

  @RequirePermissions("commission.read")
  @Get("commissions")
  commissions(@Query() query: Record<string, unknown>, @Req() req: ReqWithUser) {
    return this.admin.list("commissions", query, req.user);
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
}
