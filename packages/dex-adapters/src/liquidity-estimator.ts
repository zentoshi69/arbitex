const STABLECOINS = new Set(["USDC", "USDC.e", "USDT", "DAI", "BUSD", "USDbC", "FRAX"]);
let _avaxPriceUsd = 10;
export function setAvaxPriceUsd(price: number) { _avaxPriceUsd = price; }
export function getAvaxPriceUsd() { return _avaxPriceUsd; }

/**
 * Estimate TVL in USD for a V3-style pool from on-chain liquidity and sqrtPriceX96.
 *
 * For concentrated liquidity, the "liquidity" value represents the active
 * liquidity at the current tick. We compute virtual reserves and price them
 * using stablecoin anchoring (if one side is a stablecoin, its USD value = face value).
 */
export function estimateV3LiquidityUsd(
  liquidity: bigint,
  sqrtPriceX96: bigint,
  token0Decimals: number,
  token1Decimals: number,
  token0Symbol: string,
  token1Symbol: string,
): number {
  if (liquidity === 0n || sqrtPriceX96 === 0n) return 0;

  const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
  if (sqrtPrice <= 0 || !Number.isFinite(sqrtPrice)) return 0;

  const amount0 = Number(liquidity) / sqrtPrice / 10 ** token0Decimals;
  const amount1 = Number(liquidity) * sqrtPrice / 10 ** token1Decimals;

  if (!Number.isFinite(amount0) || !Number.isFinite(amount1)) return 0;

  if (STABLECOINS.has(token0Symbol)) {
    return amount0 * 2;
  }
  if (STABLECOINS.has(token1Symbol)) {
    return amount1 * 2;
  }

  if (token0Symbol === "WAVAX" || token0Symbol === "AVAX") {
    return amount0 * _avaxPriceUsd * 2;
  }
  if (token1Symbol === "WAVAX" || token1Symbol === "AVAX") {
    return amount1 * _avaxPriceUsd * 2;
  }

  return Number(liquidity) / 1e12;
}

/**
 * Estimate TVL for a V2-style pool from raw reserves.
 * Uses stablecoin anchoring when available; falls back to native token price.
 */
export function estimateV2LiquidityUsd(
  reserve0: bigint,
  reserve1: bigint,
  token0Decimals: number,
  token1Decimals: number,
  token0Symbol: string,
  token1Symbol: string,
): number {
  const amount0 = Number(reserve0) / 10 ** token0Decimals;
  const amount1 = Number(reserve1) / 10 ** token1Decimals;

  if (STABLECOINS.has(token0Symbol)) {
    return amount0 * 2;
  }
  if (STABLECOINS.has(token1Symbol)) {
    return amount1 * 2;
  }

  if (token0Symbol === "WAVAX" || token0Symbol === "AVAX") {
    return amount0 * _avaxPriceUsd * 2;
  }
  if (token1Symbol === "WAVAX" || token1Symbol === "AVAX") {
    return amount1 * _avaxPriceUsd * 2;
  }

  return (amount0 + amount1) / 2;
}
