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
import { CustomerSessionService } from "../public/customer-session.service.js";
import { PublicAuthGuard, PublicRequestUser } from "../public/public-auth.guard.js";
import { PublicService } from "../public/public.service.js";

@Controller()
export class CustomerController {
  constructor(
    @Inject(PublicService) private readonly publicService: PublicService,
    @Inject(CustomerSessionService) private readonly sessions: CustomerSessionService
  ) {}

  @Post("/api/auth/register")
  register(@Body() body: Record<string, unknown>) {
    return this.publicService.register(body);
  }

  @Post("/api/auth/login")
  login(@Body() body: Record<string, unknown>) {
    return this.publicService.login(body);
  }

  @Post("/api/auth/refresh")
  refresh(@Body() body: Record<string, unknown>) {
    return this.sessions.refresh(String(body.refresh_token ?? ""));
  }

  @Post("/api/auth/logout")
  logout(@Body() body: Record<string, unknown>) {
    return this.sessions.revoke(String(body.refresh_token ?? ""));
  }

  @UseGuards(PublicAuthGuard)
  @Get("/api/me")
  me(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.publicService.me(req.user, query);
  }

  @UseGuards(PublicAuthGuard)
  @Get("/api/wallet")
  wallet(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.publicService.wallet(req.user, query);
  }

  @UseGuards(PublicAuthGuard)
  @Get("/api/wallet/ledger")
  walletLedger(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.publicService.walletLedger(req.user, query);
  }

  @UseGuards(PublicAuthGuard)
  @Get("/api/billing/records")
  billingRecords(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.publicService.billingRecords(req.user, query);
  }

  @Get("/api/payment/products")
  paymentProducts(@Query() query: Record<string, unknown>) {
    return this.publicService.products(query);
  }

  @Get("/api/models")
  models(@Query() query: Record<string, unknown>) {
    return this.publicService.models(query);
  }

  @UseGuards(PublicAuthGuard)
  @Post("/api/payment/orders")
  createPaymentOrder(
    @Req() req: { user: PublicRequestUser },
    @Body() body: Record<string, unknown>
  ) {
    return this.publicService.createPaymentOrder(req.user, body);
  }

  @UseGuards(PublicAuthGuard)
  @Get("/api/payment/orders/:orderId")
  paymentOrder(@Req() req: { user: PublicRequestUser }, @Param("orderId") orderId: string) {
    return this.publicService.paymentOrder(req.user, orderId);
  }

  @UseGuards(PublicAuthGuard)
  @Post("/api/payment/orders/:orderId/sync")
  syncPaymentOrder(@Req() req: { user: PublicRequestUser }, @Param("orderId") orderId: string) {
    return this.publicService.syncPaymentOrder(req.user, orderId);
  }

  @UseGuards(PublicAuthGuard)
  @Post("/api/payment/orders/:orderId/cancel")
  cancelPaymentOrder(@Req() req: { user: PublicRequestUser }, @Param("orderId") orderId: string) {
    return this.publicService.cancelPaymentOrder(req.user, orderId);
  }

  @UseGuards(PublicAuthGuard)
  @Get("/api/developer/api-keys")
  apiKeys(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.publicService.apiKeys(req.user, query);
  }

  @UseGuards(PublicAuthGuard)
  @Post("/api/developer/api-keys")
  createApiKey(@Req() req: { user: PublicRequestUser }, @Body() body: Record<string, unknown>) {
    return this.publicService.createApiKey(req.user, body);
  }

  @UseGuards(PublicAuthGuard)
  @Patch("/api/developer/api-keys/:id")
  updateApiKey(
    @Req() req: { user: PublicRequestUser },
    @Param("id") id: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.publicService.updateApiKey(req.user, id, body);
  }

  @UseGuards(PublicAuthGuard)
  @Delete("/api/developer/api-keys/:id")
  deleteApiKey(@Req() req: { user: PublicRequestUser }, @Param("id") id: string) {
    return this.publicService.deleteApiKey(req.user, id);
  }

  @UseGuards(PublicAuthGuard)
  @Get("/api/developer/request-logs")
  requestLogs(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.publicService.usageLogs(req.user, query);
  }

  @UseGuards(PublicAuthGuard)
  @Post("/api/account/delete-request")
  deleteRequest(@Req() req: { user: PublicRequestUser }, @Body() body: Record<string, unknown>) {
    return this.publicService.createAccountDeletionRequest(req.user, body);
  }

  @UseGuards(PublicAuthGuard)
  @Post("/api/reports/content")
  contentReport(@Req() req: { user: PublicRequestUser }, @Body() body: Record<string, unknown>) {
    return this.publicService.createContentReport(req.user, body);
  }
}
