import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import dotenv from "dotenv";
import { AppModule } from "./app.module.js";

dotenv.config({ path: "../../.env" });
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: process.env.PAYMENT_CALLBACK_RAW_BODY_ENABLED !== "false"
  });
  app.enableCors({
    origin: true,
    credentials: true
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));

  const port = Number(process.env.API_PORT ?? 4000);
  const host = process.env.API_HOST ?? "0.0.0.0";
  await app.listen(port, host);
  console.log(`api-server listening on http://${host}:${port}`);
}

bootstrap();
