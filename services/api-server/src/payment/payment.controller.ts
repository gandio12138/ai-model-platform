import { Body, Controller, Headers, Inject, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { PublicAuthGuard, PublicRequestUser } from "../public/public-auth.guard.js";
import { PaymentService } from "./payment.service.js";

@Controller()
export class PaymentController {
  constructor(@Inject(PaymentService) private readonly payment: PaymentService) {}

  @UseGuards(PublicAuthGuard)
  @Post("/api/payment/ios/iap/transactions")
  submitIosIapTransaction(
    @Req() req: { user: PublicRequestUser },
    @Body() body: Record<string, unknown>
  ) {
    return this.payment.submitIosIapTransaction(req.user, body);
  }

  @Post("/api/payment/webhooks/:channelCode")
  paymentWebhook(
    @Param("channelCode") channelCode: string,
    @Headers() headers: Record<string, unknown>,
    @Body() body: Record<string, unknown>,
    @Req() req: { rawBody?: Buffer },
    @Res() res: any
  ) {
    return this.payment.recordWebhook(channelCode, headers, body, req.rawBody?.toString("utf8")).then((result) => {
      if (result.provider === "alipay") {
        return res.type("text/plain").send(result.ok ? "success" : "failure");
      }
      return res.status(result.ok ? 200 : 400).json(result.ok ? { code: "SUCCESS", message: "成功" } : { code: "FAIL", message: result.message });
    });
  }
}
