import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { AdminAuthGuard } from "../common/auth.guard.js";

@Controller("/api/admin/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @UseGuards(AdminAuthGuard)
  @Get("me")
  me(@Req() req: any) {
    return { user: req.user };
  }
}
