// apps/api/src/main.ts
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { config } from "@arbitex/config";
import { pino } from "pino";

const logger = pino({ level: config.LOG_LEVEL });

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true }
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    })
  );

  app.enableCors({
    origin: [
      "http://localhost:3000",
      process.env["DASHBOARD_ORIGIN"] ?? "http://localhost:3000",
    ],
    credentials: true,
  });

  app.setGlobalPrefix("api/v1", {
    exclude: ["/health", "/metrics"],
  });

  await app.listen(config.PORT, "0.0.0.0");
  logger.info({ port: config.PORT }, "ArbitEx API started");
}

bootstrap().catch((err) => {
  logger.error(err, "Fatal startup error");
  process.exit(1);
});
