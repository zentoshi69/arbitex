import { createPublicClient, http } from "viem";
import { avalanche } from "viem/chains";

export const AVAX_RPC_URL =
  process.env["NEXT_PUBLIC_AVAX_RPC_URL"] ?? "https://api.avax.network/ext/bc/C/rpc";

export const avaxPublicClient = createPublicClient({
  chain: avalanche,
  transport: http(AVAX_RPC_URL),
});
