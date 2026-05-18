import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import dotenv from "dotenv";
import { AppModule } from "./app.module.js";

dotenv.config({ path: "../../.env" });
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`api-server listening on http://localhost:${port}`);
}

bootstrap();

