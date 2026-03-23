import type { Job } from "bullmq";
import type { PrismaClient } from "@arbitex/db";
import type { ArbitexPublicClient } from "@arbitex/chain";
import { erc20Abi } from "viem";
import { pino } from "pino";

const logger = pino();

const NATIVE_WRAPPED: Record<string, string> = {
  WETH: "ethereum",
  WAVAX: "avalanche-2",
};

let _nativePrice = { usd: 22, fetchedAt: 0 };

async function getNativePriceUsd(symbol: string): Promise<number> {
  const cgId = NATIVE_WRAPPED[symbol];
  if (!cgId) return 1;
  if (Date.now() - _nativePrice.fetchedAt < 60_000) return _nativePrice.usd;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`);
    if (res.ok) {
      const data = (await res.json()) as Record<string, any>;
      const price = data[cgId]?.usd;
      if (typeof price === "number" && price > 0) {
        _nativePrice = { usd: price, fetchedAt: Date.now() };
        return price;
      }
    }
  } catch { /* use cached */ }
  return _nativePrice.usd;
}

type JobDeps = {
  chainClient: ArbitexPublicClient;
  prisma: PrismaClient;
};

export async function processBalanceSyncJob(
  _job: Job,
  { chainClient, prisma }: JobDeps
): Promise<void> {
  const balances = await prisma.walletBalance.findMany({
    include: { token: true },
  });

  if (balances.length === 0) return;

  const walletAddress = balances[0]?.walletAddress as `0x${string}` | undefined;
  if (!walletAddress) return;

  for (const bal of balances) {
    try {
      const tokenBalance = await chainClient.readContract({
        address: bal.token.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress],
      });

      let usdValue: number;
      if (NATIVE_WRAPPED[bal.token.symbol]) {
        const nativePrice = await getNativePriceUsd(bal.token.symbol);
        usdValue = (Number(tokenBalance) / 10 ** bal.token.decimals) * nativePrice;
      } else {
        usdValue = Number(tokenBalance) / 10 ** bal.token.decimals;
      }

      await prisma.walletBalance.update({
        where: { id: bal.id },
        data: {
          balanceWei: tokenBalance.toString(),
          usdValue,
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      logger.warn({ token: bal.token.symbol, err }, "Balance sync failed for token");
    }
  }

  logger.debug("Balance sync complete");
}
