// apps/api/src/main.ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { config } from "@arbitex/config";
import { pino } from "pino";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

const logger = pino({ level: config.LOG_LEVEL });

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true }
  );

  await app.register(helmet, {
    // API is consumed by dashboard + local scripts; keep CSP on the web app.
    contentSecurityPolicy: false,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
  } as any);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    })
  );

  const allowedOrigins = [
    config.DASHBOARD_ORIGIN,
    "http://localhost:3000",
  ].filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.setGlobalPrefix("api/v1", {
    exclude: ["/health", "/metrics"],
  });

  await app.listen(config.PORT, "0.0.0.0");
  logger.info({ port: config.PORT }, "ArbitEx API started");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down…");
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  logger.error(err, "Fatal startup error");
  process.exit(1);
});
