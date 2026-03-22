/** Default deployment targets Avalanche C-Chain (43114). */
const DEFAULT_CHAIN_ID = 43114;

/**
 * Block explorer base URL for transaction links.
 * Snowtrace shows **token transfers** in the "Logs" tab — the main "Value" field is native AVAX only (often 0 for ERC20 swaps).
 */
export function txExplorerUrl(
  txHash: string,
  chainId: number = DEFAULT_CHAIN_ID
): string {
  if (!txHash?.startsWith("0x")) return "#";
  if (chainId === 43114) {
    return `https://snowtrace.io/tx/${txHash}`;
  }
  if (chainId === 1) {
    return `https://etherscan.io/tx/${txHash}`;
  }
  return `https://snowtrace.io/tx/${txHash}`;
}

export function addressExplorerUrl(
  address: string,
  chainId: number = DEFAULT_CHAIN_ID
): string {
  if (!address?.startsWith("0x")) return "#";
  if (chainId === 43114) return `https://snowtrace.io/address/${address}`;
  if (chainId === 1) return `https://etherscan.io/address/${address}`;
  return `https://snowtrace.io/address/${address}`;
}
