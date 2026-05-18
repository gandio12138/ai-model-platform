import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { CommonModule } from "./common/common.module.js";

@Module({
  imports: [DatabaseModule, CommonModule, AuthModule, AdminModule]
})
export class AppModule {}

