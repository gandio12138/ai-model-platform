import { Module } from "@nestjs/common";
import { PublicModule } from "../public/public.module.js";
import { CustomerController } from "./customer.controller.js";

@Module({
  imports: [PublicModule],
  controllers: [CustomerController]
})
export class CustomerModule {}
