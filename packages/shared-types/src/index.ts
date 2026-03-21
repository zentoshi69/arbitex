import { z } from "zod";

export * from "./trading-brain.js";

// ── Primitives ────────────────────────────────────────────────────────────────

export const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid EVM address");
export type Address = z.infer<typeof AddressSchema>;

export const HexSchema = z.string().regex(/^0x[0-9a-fA-F]*$/, "Invalid hex");
export type Hex = z.infer<typeof HexSchema>;

export const BigIntStringSchema = z
  .string()
  .regex(/^\d+$/, "Must be numeric string");

// ── Enums ─────────────────────────────────────────────────────────────────────

export const OpportunityState = {
  DETECTED: "DETECTED",
  QUOTED: "QUOTED",
  SIMULATED: "SIMULATED",
  APPROVED: "APPROVED",
  SUBMITTED: "SUBMITTED",
  LANDED: "LANDED",
  FAILED_TX: "FAILED_TX",
  FAILED_SIM: "FAILED_SIM",
  EXPIRED: "EXPIRED",
  BLOCKED: "BLOCKED",
} as const;
export type OpportunityState =
  (typeof OpportunityState)[keyof typeof OpportunityState];

export const ExecutionState = {
  PENDING: "PENDING",
  SIMULATING: "SIMULATING",
  SIGNING: "SIGNING",
  SUBMITTED: "SUBMITTED",
  CONFIRMING: "CONFIRMING",
  LANDED: "LANDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type ExecutionState =
  (typeof ExecutionState)[keyof typeof ExecutionState];

export const RiskSeverity = {
  INFO: "INFO",
  WARNING: "WARNING",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
export type RiskSeverity = (typeof RiskSeverity)[keyof typeof RiskSeverity];

export const SimulationFailureReason = {
  SLIPPAGE_TOO_HIGH: "SLIPPAGE_TOO_HIGH",
  POOL_STALE: "POOL_STALE",
  LOW_LIQUIDITY: "LOW_LIQUIDITY",
  TOKEN_UNSUPPORTED: "TOKEN_UNSUPPORTED",
  REVERT: "REVERT",
  GAS_ESTIMATE_FAILED: "GAS_ESTIMATE_FAILED",
} as const;
export type SimulationFailureReason =
  (typeof SimulationFailureReason)[keyof typeof SimulationFailureReason];

export const TokenFlag = {
  FEE_ON_TRANSFER: "FEE_ON_TRANSFER",
  REBASING: "REBASING",
  HONEYPOT_SUSPICION: "HONEYPOT_SUSPICION",
  PAUSED_TRANSFERS: "PAUSED_TRANSFERS",
  BLACKLISTED: "BLACKLISTED",
} as const;
export type TokenFlag = (typeof TokenFlag)[keyof typeof TokenFlag];

export const KillSwitchKey = {
  GLOBAL: "GLOBAL",
  CHAIN_1: "CHAIN_1",
  CHAIN_8453: "CHAIN_8453",
} as const;
export type KillSwitchKey = (typeof KillSwitchKey)[keyof typeof KillSwitchKey];

export const UserRole = {
  VIEWER: "VIEWER",
  OPERATOR: "OPERATOR",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ── Token Universe Types ──────────────────────────────────────────────────────

export type TrackedToken = {
  id: string;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chainId: number;
  accentColor: string | null;
  isTracked: boolean;
  isEnabled: boolean;
  poolCount: number;
};

// ── DEX Adapter Types ─────────────────────────────────────────────────────────

export const NormalizedPoolSchema = z.object({
  poolId: z.string(),
  venueId: z.string(),
  venueName: z.string(),
  chainId: z.number(),
  token0: AddressSchema,
  token1: AddressSchema,
  token0Symbol: z.string(),
  token1Symbol: z.string(),
  token0Decimals: z.number(),
  token1Decimals: z.number(),
  feeBps: z.number(),
  liquidityUsd: z.number(),
  price0Per1: z.number(), // price of token1 in terms of token0
  price1Per0: z.number(),
  sqrtPriceX96: BigIntStringSchema.optional(),
  tick: z.number().optional(),
  lastUpdated: z.date(),
});
export type NormalizedPool = z.infer<typeof NormalizedPoolSchema>;

export const QuoteParamsSchema = z.object({
  poolId: z.string(),
  tokenIn: AddressSchema,
  tokenOut: AddressSchema,
  amountIn: BigIntStringSchema,
  slippageBps: z.number().default(50),
});
export type QuoteParams = z.infer<typeof QuoteParamsSchema>;

export const QuoteResultSchema = z.object({
  amountOut: BigIntStringSchema,
  amountOutMin: BigIntStringSchema,
  priceImpactBps: z.number(),
  gasEstimate: BigIntStringSchema,
  feePaid: BigIntStringSchema,
  route: z.array(AddressSchema),
});
export type QuoteResult = z.infer<typeof QuoteResultSchema>;

export const SwapParamsSchema = QuoteParamsSchema.extend({
  amountOutMin: BigIntStringSchema,
  recipient: AddressSchema,
  deadline: z.number(),
});
export type SwapParams = z.infer<typeof SwapParamsSchema>;

export const SwapCalldataSchema = z.object({
  to: AddressSchema,
  data: HexSchema,
  value: BigIntStringSchema,
  gasEstimate: BigIntStringSchema,
});
export type SwapCalldata = z.infer<typeof SwapCalldataSchema>;

// ── Opportunity Types ─────────────────────────────────────────────────────────

export const RouteStepSchema = z.object({
  stepIndex: z.number(),
  poolId: z.string(),
  venueId: z.string(),
  venueName: z.string(),
  tokenIn: AddressSchema,
  tokenOut: AddressSchema,
  amountIn: BigIntStringSchema,
  amountOut: BigIntStringSchema,
  feeBps: z.number(),
});
export type RouteStep = z.infer<typeof RouteStepSchema>;

export const ProfitBreakdownSchema = z.object({
  grossSpreadUsd: z.number(),
  gasEstimateUsd: z.number(),
  venueFeesUsd: z.number(),
  slippageBufferUsd: z.number(),
  failureBufferUsd: z.number(),
  netProfitUsd: z.number(),
  netProfitBps: z.number(),
});
export type ProfitBreakdown = z.infer<typeof ProfitBreakdownSchema>;

export const OpportunitySummarySchema = z.object({
  id: z.string(),
  state: z.nativeEnum(OpportunityState as any),
  tokenIn: AddressSchema,
  tokenOut: AddressSchema,
  tokenInSymbol: z.string(),
  tokenOutSymbol: z.string(),
  tradeSizeUsd: z.number(),
  grossSpreadUsd: z.number(),
  netProfitUsd: z.number(),
  netProfitBps: z.number(),
  buyVenueName: z.string(),
  sellVenueName: z.string(),
  detectedAt: z.date(),
  expiresAt: z.date().optional(),
});
export type OpportunitySummary = z.infer<typeof OpportunitySummarySchema>;

// ── Execution Types ───────────────────────────────────────────────────────────

export const ExecutionStatusSchema = z.object({
  id: z.string(),
  opportunityId: z.string(),
  state: z.nativeEnum(ExecutionState as any),
  txHash: HexSchema.optional(),
  blockNumber: z.number().optional(),
  gasUsed: BigIntStringSchema.optional(),
  gasCostUsd: z.number().optional(),
  pnlUsd: z.number().optional(),
  failureReason: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

// ── Risk Engine Types ─────────────────────────────────────────────────────────

export const RiskConfigSchema = z.object({
  baseTradeSizeUsd: z.number().positive().default(5_000),
  maxTradeSizeUsd: z.number().positive().default(10_000),
  maxTokenExposureUsd: z.number().positive().default(25_000),
  minPoolLiquidityUsd: z.number().positive().default(50_000),
  maxSlippageBps: z.number().positive().default(50),
  maxFailedTxPerHour: z.number().int().positive().default(5),
  maxGasGwei: z.number().positive().default(100),
  tokenCooldownSeconds: z.number().int().positive().default(300),
  minNetProfitUsd: z.number().positive().default(0.5),
  failureBufferFactor: z.number().min(0).max(1).default(0.05),
  slippageBufferFactor: z.number().min(0).max(0.1).default(0.002),
});
export type RiskConfig = z.infer<typeof RiskConfigSchema>;

export const RiskDecisionSchema = z.object({
  approved: z.boolean(),
  rejectionReasons: z.array(z.string()),
  checkedRules: z.array(
    z.object({
      rule: z.string(),
      passed: z.boolean(),
      detail: z.string().optional(),
    })
  ),
  evaluatedAt: z.date(),
});
export type RiskDecision = z.infer<typeof RiskDecisionSchema>;

export const RiskEventSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  severity: z.nativeEnum(RiskSeverity as any),
  tokenAddress: AddressSchema.optional(),
  venueId: z.string().optional(),
  details: z.record(z.unknown()),
  createdAt: z.date(),
});
export type RiskEvent = z.infer<typeof RiskEventSchema>;

// ── Simulation Types ──────────────────────────────────────────────────────────

export const SimulationResultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    amountOut: BigIntStringSchema,
    gasUsed: BigIntStringSchema,
    effectiveSlippageBps: z.number(),
  }),
  z.object({
    success: z.literal(false),
    reason: z.nativeEnum(SimulationFailureReason as any),
    detail: z.string(),
    revertData: HexSchema.optional(),
  }),
]);
export type SimulationResult = z.infer<typeof SimulationResultSchema>;

// ── API Response Wrappers ─────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(25),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    } satisfies Pagination,
  };
}

// ── WebSocket Event Payloads ──────────────────────────────────────────────────

export type WsEventMap = {
  "opportunity:new": OpportunitySummary;
  "opportunity:update": Pick<
    OpportunitySummary,
    "id" | "state" | "netProfitUsd"
  >;
  "execution:update": ExecutionStatus;
  "pnl:update": { realizedUsd: number; unrealizedUsd: number; timestamp: Date };
  "risk:alert": RiskEvent;
  "system:health": SystemHealth;
};

export type WsEvent = {
  [K in keyof WsEventMap]: { event: K; data: WsEventMap[K] };
}[keyof WsEventMap];

export const SystemHealthSchema = z.object({
  status: z.enum(["healthy", "degraded", "down"]),
  database: z.enum(["up", "down"]),
  redis: z.enum(["up", "down"]),
  rpc: z.enum(["up", "down", "slow"]),
  workerQueueDepths: z.record(z.number()),
  killSwitches: z.record(z.boolean()),
  uptime: z.number(),
  checkedAt: z.date(),
});
export type SystemHealth = z.infer<typeof SystemHealthSchema>;

// ── Error Taxonomy ────────────────────────────────────────────────────────────

export const ErrorCode = {
  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_ADDRESS: "INVALID_ADDRESS",

  // Risk
  RISK_REJECTED: "RISK_REJECTED",
  KILL_SWITCH_ACTIVE: "KILL_SWITCH_ACTIVE",
  BELOW_MIN_PROFIT: "BELOW_MIN_PROFIT",
  TRADE_SIZE_EXCEEDED: "TRADE_SIZE_EXCEEDED",
  GAS_PRICE_TOO_HIGH: "GAS_PRICE_TOO_HIGH",
  TOKEN_FLAGGED: "TOKEN_FLAGGED",
  POOL_INSUFFICIENT_LIQUIDITY: "POOL_INSUFFICIENT_LIQUIDITY",

  // Simulation
  SIMULATION_FAILED: "SIMULATION_FAILED",
  SLIPPAGE_TOO_HIGH: "SLIPPAGE_TOO_HIGH",
  POOL_STATE_STALE: "POOL_STATE_STALE",

  // Execution
  NONCE_CONFLICT: "NONCE_CONFLICT",
  TX_SUBMISSION_FAILED: "TX_SUBMISSION_FAILED",
  TX_REVERTED: "TX_REVERTED",
  DUPLICATE_OPPORTUNITY: "DUPLICATE_OPPORTUNITY",
  EXECUTION_WINDOW_EXCEEDED: "EXECUTION_WINDOW_EXCEEDED",

  // Infrastructure
  RPC_ERROR: "RPC_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  QUEUE_FULL: "QUEUE_FULL",
  ADAPTER_ERROR: "ADAPTER_ERROR",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class ArbitexError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ArbitexError";
  }
}
