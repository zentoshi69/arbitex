import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { z } from "zod";

// Load .env from monorepo root (when running from apps/* or packages/*)
function loadEnvFromMonorepoRoot(): void {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  let root = path.resolve(dir, "../..");
  for (let i = 0; i < 5; i++) {
    if (existsSync(path.join(root, "pnpm-workspace.yaml"))) {
      loadDotenv({ path: path.join(root, ".env.local") });
      loadDotenv({ path: path.join(root, ".env") });
      if (existsSync(path.join(root, ".env.secrets"))) {
        loadDotenv({ path: path.join(root, ".env.secrets") });
      }
      return;
    }
    root = path.resolve(root, "..");
  }
  loadDotenv({ path: ".env.local" });
  loadDotenv();
}

loadEnvFromMonorepoRoot();

// ── Schema ─────────────────────────────────────────────────────────────────────

const optionalUrl = z.string().optional().transform(v => (!v || v === "") ? undefined : v).pipe(z.string().url().optional());

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

  // Redis
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL"),

  // Multi-chain RPC — private QuickNode/Alchemy URLs preferred for all blockchain ops
  ETHEREUM_RPC_URL: optionalUrl,
  ETHEREUM_ARCHIVE_RPC_URL: optionalUrl,
  ETHEREUM_WSS_URL: optionalUrl,
  AVALANCHE_RPC_URL: optionalUrl,
  AVALANCHE_ARCHIVE_RPC_URL: optionalUrl,
  AVALANCHE_WSS_URL: optionalUrl,
  BSC_RPC_URL: optionalUrl,
  POLYGON_RPC_URL: optionalUrl,
  ARBITRUM_RPC_URL: optionalUrl,
  ARBITRUM_WSS_URL: optionalUrl,
  BASE_RPC_URL: optionalUrl,
  BASE_WSS_URL: optionalUrl,
  CHAIN_ID: z.coerce.number().int().positive().default(43114),

  // Super Admin signer (for LP actions on-chain)
  SUPERADMIN_KEYSTORE_PATH: z.string().optional(),
  SUPERADMIN_KEYSTORE_PASS: z.string().optional(),

  // Execution wallet — absent in web/api, present in worker
  EXECUTION_WALLET_PRIVATE_KEY: z.string().optional(),
  EXECUTION_WALLET_KEYSTORE_PATH: z.string().optional(),
  EXECUTION_WALLET_KEYSTORE_PASS: z.string().optional(),

  // FlashArb contract
  FLASH_ARB_ADDRESS: z.string().optional(),
  AAVE_POOL_PROVIDER: z.string().default("0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb"),

  // Flashbots (not used on Avalanche)
  FLASHBOTS_AUTH_KEY: z.string().optional(),
  FLASHBOTS_RELAY_URL: optionalUrl,

  // API Auth
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRY: z.string().default("8h"),
  OPERATOR_API_KEY: z
    .string()
    .min(32, "OPERATOR_API_KEY must be at least 32 characters"),

  // Dashboard origin (CORS)
  DASHBOARD_ORIGIN: z.string().url().default("http://localhost:3000"),

  // App
  PORT: z.coerce.number().int().positive().default(3001),

  // Feature flags
  MOCK_EXECUTION: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  OPPORTUNITY_ENGINE_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("true"),

  // Risk defaults
  DEFAULT_MAX_TRADE_SIZE_USD: z.coerce.number().positive().default(5_000),
  DEFAULT_MIN_NET_PROFIT_USD: z.coerce.number().positive().default(0.5),
  DEFAULT_MAX_GAS_GWEI: z.coerce.number().positive().default(100),
  DEFAULT_MIN_POOL_LIQUIDITY_USD: z.coerce.number().positive().default(50_000),
}).refine(
  (data) => {
    const keys = CHAIN_RPC_KEYS[data.CHAIN_ID];
    if (!keys) return false;
    const val = (data as Record<string, unknown>)[keys.rpc];
    return typeof val === "string" && val.length > 0;
  },
  (data) => ({ message: `RPC URL for chain ${data.CHAIN_ID} is required. Set the appropriate *_RPC_URL in .env` })
);

/** Per-chain RPC env var names */
const CHAIN_RPC_KEYS: Record<number, { rpc: string; archive?: string; wss?: string }> = {
  1: { rpc: "ETHEREUM_RPC_URL", archive: "ETHEREUM_ARCHIVE_RPC_URL", wss: "ETHEREUM_WSS_URL" },
  56: { rpc: "BSC_RPC_URL" },
  137: { rpc: "POLYGON_RPC_URL" },
  42161: { rpc: "ARBITRUM_RPC_URL", wss: "ARBITRUM_WSS_URL" },
  8453: { rpc: "BASE_RPC_URL", wss: "BASE_WSS_URL" },
  43114: { rpc: "AVALANCHE_RPC_URL", archive: "AVALANCHE_ARCHIVE_RPC_URL", wss: "AVALANCHE_WSS_URL" },
};

export type AppConfig = z.infer<typeof EnvSchema>;

export type RpcConfig = {
  rpcUrl: string;
  archiveRpcUrl?: string;
  wssUrl?: string;
};

/** Get RPC config for a chain. Throws if not configured. Use for all blockchain reads/writes. */
export function getRpcConfig(chainId: number): RpcConfig {
  const keys = CHAIN_RPC_KEYS[chainId];
  if (!keys) throw new Error(`Unsupported chainId: ${chainId}`);
  const c = loadConfig() as Record<string, unknown>;
  const rpcUrl = c[keys.rpc] as string | undefined;
  if (!rpcUrl) throw new Error(`RPC URL for chain ${chainId} not configured. Set ${keys.rpc} in .env`);
  const result: RpcConfig = { rpcUrl };
  if (keys.archive) {
    const val = c[keys.archive] as string | undefined;
    if (val) result.archiveRpcUrl = val;
  }
  if (keys.wss) {
    const val = c[keys.wss] as string | undefined;
    if (val) result.wssUrl = val;
  }
  return result;
}

let _config: AppConfig | undefined;

/**
 * Load and validate environment config. Throws on first load if env is invalid.
 * Subsequent calls return cached config.
 */
export function loadConfig(): AppConfig {
  if (_config) return _config;

  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `❌  ArbitEx environment validation failed:\n${issues}\n\nSee .env.example for required variables.`
    );
  }

  _config = result.data;
  return _config;
}

/** Convenience — load once at startup and export */
export const config = loadConfig();

/** Check if running in production */
export const isProd = () => config.NODE_ENV === "production";
/** Check if mock execution is enabled */
export const isMockExecution = () => config.MOCK_EXECUTION;

/** Primary chain RPC config (for CHAIN_ID). Use for default blockchain reads/writes. */
export function getPrimaryRpcConfig(): RpcConfig {
  return getRpcConfig(loadConfig().CHAIN_ID);
}
