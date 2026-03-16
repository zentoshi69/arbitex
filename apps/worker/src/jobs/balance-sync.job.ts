import type { Job } from "bullmq";
import type { PrismaClient } from "@arbitex/db";
import type { ArbitexPublicClient } from "@arbitex/chain";
import { erc20Abi } from "viem";
import { pino } from "pino";

const logger = pino();

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

  const ETH_PRICE_USD = 2000; // TODO: fetch from oracle

  // Check ETH balance
  const ethBalance = await chainClient.getBalance({ address: walletAddress });

  // Check ERC-20 balances
  for (const bal of balances) {
    try {
      const tokenBalance = await chainClient.readContract({
        address: bal.token.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress],
      });

      const usdValue =
        bal.token.symbol === "WETH"
          ? (Number(tokenBalance) / 1e18) * ETH_PRICE_USD
          : Number(tokenBalance) / 10 ** bal.token.decimals;

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
