import type { PrismaClient } from "@arbitex/db";
import type {
  AccumulationState,
  ConversionCosts,
  ArbProfitRouting,
} from "@arbitex/shared-types";

const SLEEVE_CONFIG_KEY = "accumulation_sleeve_state";
const ROUTING_CONFIG_KEY = "accumulation_arb_routing";
const SYSTEM_ACTOR = "system:accumulation-engine";

const DEFAULT_STATE: AccumulationState = {
  totalWRPUnits: 0,
  coreWRPUnits: 0,
  tacticalWRPUnits: 0,
  arbSleeveLiquidityUsd: 0,
  wrpUnitsGainedToday: 0,
  wrpUnitsGainedAllTime: 0,
  wrpUnitsLostToRotation: 0,
  coreSleeveAllocationPct: 0.6,
  tacticalSleeveAllocationPct: 0.3,
  arbSleeveAllocationPct: 0.1,
  maxTacticalSleeveUsd: 5_000,
  maxSingleConversionUsd: 1_000,
  updatedAt: Date.now(),
};

const DEFAULT_ROUTING: ArbProfitRouting = {
  pendingUsdForWRPConversion: 0,
  autoConvertThreshold: 50,
  autoConvertEnabled: false,
  lastRoutingAt: 0,
};

/**
 * Tracks WRP unit inventory across three sleeves (core, tactical, arb).
 * Persists state as JSON in the ConfigOverride table — no schema migration needed.
 */
export class AccumulationEngine {
  constructor(private readonly db: PrismaClient) {}

  async getState(): Promise<AccumulationState> {
    const row = await this.db.configOverride.findUnique({
      where: { key: SLEEVE_CONFIG_KEY },
    });
    if (!row) return { ...DEFAULT_STATE, updatedAt: Date.now() };
    try {
      return { ...DEFAULT_STATE, ...JSON.parse(row.value) };
    } catch {
      return { ...DEFAULT_STATE, updatedAt: Date.now() };
    }
  }

  async saveState(state: AccumulationState): Promise<void> {
    state.updatedAt = Date.now();
    await this.db.configOverride.upsert({
      where: { key: SLEEVE_CONFIG_KEY },
      update: { value: JSON.stringify(state) },
      create: { key: SLEEVE_CONFIG_KEY, value: JSON.stringify(state), updatedBy: SYSTEM_ACTOR },
    });
  }

  evaluateConversionForWRPUnits(
    currentWRPUnits: number,
    proposedConversionUsd: number,
    expectedReentryWRPUnits: number,
    costs: ConversionCosts,
    minUnitGainThresholdPct = 0.02,
  ): { approved: boolean; expectedUnitGain: number; rationale: string } {
    const netExpected = expectedReentryWRPUnits - costs.totalCostInWRPUnits;
    const threshold = currentWRPUnits * (1 + minUnitGainThresholdPct);
    const expectedUnitGain = netExpected - currentWRPUnits;
    const approved = netExpected > threshold;

    let rationale: string;
    if (approved) {
      rationale =
        `Conversion approved: expected ${netExpected.toFixed(2)} WRP units ` +
        `(+${expectedUnitGain.toFixed(2)}) exceeds threshold ${threshold.toFixed(2)} ` +
        `(costs: ${costs.totalCostInWRPUnits.toFixed(2)} WRP units / $${costs.totalCostUsd.toFixed(2)})`;
    } else {
      rationale =
        `Conversion rejected: expected ${netExpected.toFixed(2)} WRP units ` +
        `does not exceed threshold ${threshold.toFixed(2)} ` +
        `(unit gain ${expectedUnitGain.toFixed(2)} < required ${(currentWRPUnits * minUnitGainThresholdPct).toFixed(2)})`;
    }

    return { approved, expectedUnitGain, rationale };
  }

  async recordWRPUnitChange(
    deltaUnits: number,
    sleeve: "core" | "tactical" | "arb",
    reason: string,
  ): Promise<AccumulationState> {
    const state = await this.getState();

    if (sleeve === "core") state.coreWRPUnits += deltaUnits;
    else if (sleeve === "tactical") state.tacticalWRPUnits += deltaUnits;

    state.totalWRPUnits = state.coreWRPUnits + state.tacticalWRPUnits;

    if (deltaUnits > 0) {
      state.wrpUnitsGainedToday += deltaUnits;
      state.wrpUnitsGainedAllTime += deltaUnits;
    } else {
      state.wrpUnitsLostToRotation += Math.abs(deltaUnits);
    }

    await this.saveState(state);

    await this.db.auditLog.create({
      data: {
        action: "WRP_UNIT_CHANGE",
        actor: SYSTEM_ACTOR,
        entityType: "accumulation",
        entityId: sleeve,
        diff: { deltaUnits, sleeve, reason, newTotal: state.totalWRPUnits } as any,
      },
    });

    return state;
  }

  async updateSleeves(
    coreAllocationPct: number,
    tacticalAllocationPct: number,
    arbAllocationPct: number,
  ): Promise<AccumulationState> {
    const total = coreAllocationPct + tacticalAllocationPct + arbAllocationPct;
    if (Math.abs(total - 1.0) > 0.01) {
      throw new Error(`Sleeve allocations must sum to 1.0, got ${total}`);
    }

    const state = await this.getState();
    state.coreSleeveAllocationPct = coreAllocationPct;
    state.tacticalSleeveAllocationPct = tacticalAllocationPct;
    state.arbSleeveAllocationPct = arbAllocationPct;
    await this.saveState(state);
    return state;
  }

  // ── Arb profit routing ──────────────────────────────────────────────────

  async getRouting(): Promise<ArbProfitRouting> {
    const row = await this.db.configOverride.findUnique({
      where: { key: ROUTING_CONFIG_KEY },
    });
    if (!row) return { ...DEFAULT_ROUTING };
    try {
      return { ...DEFAULT_ROUTING, ...JSON.parse(row.value) };
    } catch {
      return { ...DEFAULT_ROUTING };
    }
  }

  async addPendingConversionUsd(amountUsd: number): Promise<ArbProfitRouting> {
    const routing = await this.getRouting();
    routing.pendingUsdForWRPConversion += amountUsd;
    routing.lastRoutingAt = Date.now();
    await this.db.configOverride.upsert({
      where: { key: ROUTING_CONFIG_KEY },
      update: { value: JSON.stringify(routing) },
      create: { key: ROUTING_CONFIG_KEY, value: JSON.stringify(routing), updatedBy: SYSTEM_ACTOR },
    });
    return routing;
  }

  async shouldAutoConvert(): Promise<boolean> {
    const routing = await this.getRouting();
    return (
      routing.autoConvertEnabled &&
      routing.pendingUsdForWRPConversion >= routing.autoConvertThreshold
    );
  }

  async clearPendingConversion(): Promise<void> {
    const routing = await this.getRouting();
    routing.pendingUsdForWRPConversion = 0;
    await this.db.configOverride.upsert({
      where: { key: ROUTING_CONFIG_KEY },
      update: { value: JSON.stringify(routing) },
      create: { key: ROUTING_CONFIG_KEY, value: JSON.stringify(routing), updatedBy: SYSTEM_ACTOR },
    });
  }
}
