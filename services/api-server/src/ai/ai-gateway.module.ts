import { Module } from "@nestjs/common";
import { PublicModule } from "../public/public.module.js";
import { AiGatewayController } from "./ai-gateway.controller.js";
import { AiGatewayService } from "./ai-gateway.service.js";
import { AwsBedrockProviderAdapter } from "./providers/aws-bedrock.adapter.js";
import { FakeProviderAdapter } from "./providers/fake-provider.adapter.js";
import { ProviderAdapterRegistry } from "./providers/provider-adapter.registry.js";

@Module({
  imports: [PublicModule],
  controllers: [AiGatewayController],
  providers: [AiGatewayService, ProviderAdapterRegistry, AwsBedrockProviderAdapter, FakeProviderAdapter],
  exports: [AiGatewayService, ProviderAdapterRegistry, AwsBedrockProviderAdapter, FakeProviderAdapter]
})
export class AiGatewayModule {}
