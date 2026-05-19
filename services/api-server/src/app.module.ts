import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { CommonModule } from "./common/common.module.js";
import { PublicModule } from "./public/public.module.js";
import { CustomerModule } from "./customer/customer.module.js";
import { AppConfigModule } from "./app-config/app-config.module.js";
import { AiGatewayModule } from "./ai/ai-gateway.module.js";

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    AuthModule,
    AdminModule,
    PublicModule,
    CustomerModule,
    AppConfigModule,
    AiGatewayModule
  ]
})
export class AppModule {}
