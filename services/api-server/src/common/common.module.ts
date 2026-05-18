import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";
import { CryptoService } from "./crypto.service.js";
import { AdminAuthGuard } from "./auth.guard.js";

@Global()
@Module({
  providers: [AuditService, CryptoService, AdminAuthGuard],
  exports: [AuditService, CryptoService, AdminAuthGuard]
})
export class CommonModule {}
