import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { PublicAuthGuard, PublicRequestUser } from "./public-auth.guard.js";
import { PublicService } from "./public.service.js";

@Controller("/api/public")
export class PublicController {
  constructor(@Inject(PublicService) private readonly publicService: PublicService) {}

  @Post("auth/register")
  register(@Body() body: Record<string, unknown>) {
    return this.publicService.register(body);
  }

  @Post("auth/login")
  login(@Body() body: Record<string, unknown>) {
    return this.publicService.login(body);
  }

  @UseGuards(PublicAuthGuard)
  @Get("me")
  me(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.publicService.me(req.user, query);
  }

  @UseGuards(PublicAuthGuard)
  @Post("profile")
  updateProfile(@Req() req: { user: PublicRequestUser }, @Body() body: Record<string, unknown>) {
    return this.publicService.updateProfile(req.user, body);
  }

  @UseGuards(PublicAuthGuard)
  @Post("password")
  updatePassword(@Req() req: { user: PublicRequestUser }, @Body() body: Record<string, unknown>) {
    return this.publicService.updatePassword(req.user, body);
  }

  @Get("bootstrap")
  bootstrap(@Query() query: Record<string, unknown>) {
    return this.publicService.bootstrap(query);
  }

  @Get("products")
  products(@Query() query: Record<string, unknown>) {
    return this.publicService.products(query);
  }

  @Get("payment-methods")
  paymentMethods(@Query() query: Record<string, unknown>) {
    return this.publicService.paymentMethods(query);
  }

  @Get("models")
  models(@Query() query: Record<string, unknown>) {
    return this.publicService.models(query);
  }

  @UseGuards(PublicAuthGuard)
  @Get("api-keys")
  apiKeys(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.publicService.apiKeys(req.user, query);
  }

  @UseGuards(PublicAuthGuard)
  @Get("usage-logs")
  usageLogs(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.publicService.usageLogs(req.user, query);
  }

  @UseGuards(PublicAuthGuard)
  @Post("api-keys")
  createApiKey(@Req() req: { user: PublicRequestUser }, @Body() body: Record<string, unknown>) {
    return this.publicService.createApiKey(req.user, body);
  }

  @UseGuards(PublicAuthGuard)
  @Post("api-keys/:id/revoke")
  revokeApiKey(@Req() req: { user: PublicRequestUser }, @Param("id") id: string) {
    return this.publicService.revokeApiKey(req.user, id);
  }

  @UseGuards(PublicAuthGuard)
  @Get("wallet")
  wallet(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.publicService.wallet(req.user, query);
  }

  @UseGuards(PublicAuthGuard)
  @Get("wallet/ledger")
  walletLedger(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.publicService.walletLedger(req.user, query);
  }

  @UseGuards(PublicAuthGuard)
  @Post("payment/orders")
  createPaymentOrder(
    @Req() req: { user: PublicRequestUser },
    @Body() body: Record<string, unknown>
  ) {
    return this.publicService.createPaymentOrder(req.user, body);
  }

  @UseGuards(PublicAuthGuard)
  @Get("payment/orders/:orderNo")
  paymentOrder(@Req() req: { user: PublicRequestUser }, @Param("orderNo") orderNo: string) {
    return this.publicService.paymentOrder(req.user, orderNo);
  }

  @UseGuards(PublicAuthGuard)
  @Post("payment/orders/:orderNo/mock-pay")
  mockPay(@Req() req: { user: PublicRequestUser }, @Param("orderNo") orderNo: string) {
    return this.publicService.mockPay(req.user, orderNo);
  }
}
