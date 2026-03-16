import { PrismaClient } from "@prisma/client";

// Singleton pattern — prevents connection pool exhaustion in dev hot-reload
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env["NODE_ENV"] === "production"
        ? ["error"]
        : ["query", "error", "warn"],
  });
}

export const prisma: PrismaClient =
  global.__prisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  global.__prisma = prisma;
}

export * from "@prisma/client";
