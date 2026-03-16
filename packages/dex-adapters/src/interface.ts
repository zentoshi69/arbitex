import type {
  NormalizedPool,
  QuoteParams,
  QuoteResult,
  SwapParams,
  SwapCalldata,
  Address,
} from "@arbitex/shared-types";

export interface IDexAdapter {
  readonly venueId: string;
  readonly venueName: string;
  readonly chainId: number;
  readonly protocol: string;

  /** Fetch all active pools, optionally filtered by token list */
  getPools(tokens?: Address[]): Promise<NormalizedPool[]>;

  /** Get a quote for a swap — should NOT mutate state */
  getQuote(params: QuoteParams): Promise<QuoteResult>;

  /** Build calldata for a swap transaction */
  buildSwapCalldata(params: SwapParams): Promise<SwapCalldata>;

  /** Estimate gas for built calldata */
  estimateGas(calldata: SwapCalldata, from: Address): Promise<bigint>;

  /** Check if adapter supports a given token (screening) */
  supportsToken(token: Address): Promise<boolean>;

  /** Human-readable adapter health check */
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

/** Registry for all loaded adapters */
export class AdapterRegistry {
  private adapters = new Map<string, IDexAdapter>();

  register(adapter: IDexAdapter): void {
    this.adapters.set(adapter.venueId, adapter);
  }

  get(venueId: string): IDexAdapter | undefined {
    return this.adapters.get(venueId);
  }

  getAll(): IDexAdapter[] {
    return Array.from(this.adapters.values());
  }

  getEnabled(enabledVenueIds: string[]): IDexAdapter[] {
    return enabledVenueIds
      .map((id) => this.adapters.get(id))
      .filter((a): a is IDexAdapter => a !== undefined);
  }
}
