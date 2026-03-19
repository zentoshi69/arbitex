import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from "../auth/auth.module.js";
import type { JwtPayload } from "../auth/auth.module.js";
import { createChainClient } from "@arbitex/chain";
import { config } from "@arbitex/config";
import { loadWalletFromKeystore } from "@arbitex/chain";

const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());
const ZERO = "0x0000000000000000000000000000000000000000";

const ERC20_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const UNISWAPV2_FACTORY_ABI = [
  { type: "function", name: "getPair", stateMutability: "view", inputs: [{ type: "address", name: "tokenA" }, { type: "address", name: "tokenB" }], outputs: [{ type: "address" }] },
] as const;

const UNISWAPV2_PAIR_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const UNISWAPV2_ROUTER_ABI = [
  {
    type: "function",
    name: "addLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "tokenA" },
      { type: "address", name: "tokenB" },
      { type: "uint256", name: "amountADesired" },
      { type: "uint256", name: "amountBDesired" },
      { type: "uint256", name: "amountAMin" },
      { type: "uint256", name: "amountBMin" },
      { type: "address", name: "to" },
      { type: "uint256", name: "deadline" },
    ],
    outputs: [
      { type: "uint256", name: "amountA" },
      { type: "uint256", name: "amountB" },
      { type: "uint256", name: "liquidity" },
    ],
  },
  {
    type: "function",
    name: "removeLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "tokenA" },
      { type: "address", name: "tokenB" },
      { type: "uint256", name: "liquidity" },
      { type: "uint256", name: "amountAMin" },
      { type: "uint256", name: "amountBMin" },
      { type: "address", name: "to" },
      { type: "uint256", name: "deadline" },
    ],
    outputs: [
      { type: "uint256", name: "amountA" },
      { type: "uint256", name: "amountB" },
    ],
  },
] as const;

function applySlippageMin(amount: bigint, slippageBps: number): bigint {
  const bps = BigInt(slippageBps);
  return (amount * (10_000n - bps)) / 10_000n;
}

@Injectable()
class LpService {
  private clientForChain(chainId: number) {
    if (chainId === 43114) {
      if (!config.AVALANCHE_RPC_URL) {
        throw new BadRequestException("Missing AVALANCHE_RPC_URL in env");
      }
      return createChainClient({ rpcUrl: config.AVALANCHE_RPC_URL, chainId });
    }
    return createChainClient({ rpcUrl: config.ETHEREUM_RPC_URL ?? "", chainId });
  }

  private async superAdminWallet(chainId: number) {
    if (!config.SUPERADMIN_KEYSTORE_PATH || !config.SUPERADMIN_KEYSTORE_PASS) {
      throw new BadRequestException("Missing SUPERADMIN_KEYSTORE_PATH/SUPERADMIN_KEYSTORE_PASS in env");
    }
    const rpcUrl =
      chainId === 43114
        ? config.AVALANCHE_RPC_URL
        : config.ETHEREUM_RPC_URL;
    if (!rpcUrl) throw new BadRequestException("Missing RPC URL for chain");
    return loadWalletFromKeystore({
      keystorePath: config.SUPERADMIN_KEYSTORE_PATH,
      keystorePassword: config.SUPERADMIN_KEYSTORE_PASS,
      rpcUrl,
      chainId,
    });
  }

  async ensureToken(address: string, chainId: number) {
    const addr = address.trim();
    if (!isHexAddress(addr)) throw new BadRequestException("Invalid token address");
    const existing = await prisma.token.findFirst({
      where: { chainId, address: { equals: addr, mode: "insensitive" } },
    });
    if (existing) return existing;

    const client = this.clientForChain(chainId);
    const a = addr as `0x${string}`;
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({ address: a, abi: ERC20_ABI, functionName: "name" }),
      client.readContract({ address: a, abi: ERC20_ABI, functionName: "symbol" }),
      client.readContract({ address: a, abi: ERC20_ABI, functionName: "decimals" }),
    ]);
    return prisma.token.create({
      data: { chainId, address: addr, name, symbol, decimals: Number(decimals) },
    });
  }

  async resolvePair(chainId: number, factoryAddress: string, tokenA: string, tokenB: string) {
    if (!isHexAddress(factoryAddress)) throw new BadRequestException("Invalid factoryAddress");
    if (!isHexAddress(tokenA) || !isHexAddress(tokenB)) throw new BadRequestException("Invalid token address");
    const client = this.clientForChain(chainId);
    const pair = await client.readContract({
      address: factoryAddress as `0x${string}`,
      abi: UNISWAPV2_FACTORY_ABI,
      functionName: "getPair",
      args: [tokenA as `0x${string}`, tokenB as `0x${string}`],
    });
    return pair as string;
  }

  async registerV2Pool(params: {
    chainId: number;
    venueId: string;
    factoryAddress: string;
    tokenA: string;
    tokenB: string;
    feeBps: number;
    actor: string;
  }) {
    const venue = await prisma.venue.findUnique({ where: { id: params.venueId } });
    if (!venue) throw new BadRequestException("Unknown venueId");
    if (venue.chainId !== params.chainId) throw new BadRequestException("Venue chainId mismatch");
    if (!venue.factoryAddress) throw new BadRequestException("Venue factoryAddress missing");

    const pairAddress = await this.resolvePair(params.chainId, venue.factoryAddress, params.tokenA, params.tokenB);
    if (!pairAddress || pairAddress.toLowerCase() === ZERO) {
      throw new BadRequestException("Pair not found on factory (getPair returned 0x0)");
    }

    const [t0, t1] = await Promise.all([
      this.ensureToken(params.tokenA, params.chainId),
      this.ensureToken(params.tokenB, params.chainId),
    ]);

    const created = await prisma.pool.create({
      data: {
        venueId: venue.id,
        token0Id: t0.id,
        token1Id: t1.id,
        poolAddress: pairAddress,
        feeBps: params.feeBps,
        isActive: true,
      },
      include: {
        venue: { select: { id: true, name: true, protocol: true } },
        token0: { select: { symbol: true, address: true, decimals: true } },
        token1: { select: { symbol: true, address: true, decimals: true } },
      },
    }).catch(async () => {
      // If already exists, return existing.
      const existing = await prisma.pool.findFirst({
        where: {
          venueId: venue.id,
          poolAddress: { equals: pairAddress, mode: "insensitive" },
        },
        include: {
          venue: { select: { id: true, name: true, protocol: true } },
          token0: { select: { symbol: true, address: true, decimals: true } },
          token1: { select: { symbol: true, address: true, decimals: true } },
        },
      });
      if (!existing) throw new BadRequestException("Failed to create pool");
      return existing;
    });

    await prisma.auditLog.create({
      data: {
        action: "V2_POOL_REGISTERED",
        actor: params.actor,
        entityType: "pool",
        entityId: created.id,
        diff: {
          chainId: params.chainId,
          venueId: params.venueId,
          tokenA: params.tokenA,
          tokenB: params.tokenB,
          pairAddress,
          feeBps: params.feeBps,
        },
        ipAddress: null,
      },
    });

    return { pairAddress, pool: created };
  }

  async position(params: { chainId: number; venueId: string; tokenA: string; tokenB: string }) {
    const venue = await prisma.venue.findUnique({ where: { id: params.venueId } });
    if (!venue) throw new BadRequestException("Unknown venueId");
    if (!venue.factoryAddress || !venue.routerAddress) throw new BadRequestException("Venue missing factory/router");
    const client = this.clientForChain(params.chainId);
    const wallet = await this.superAdminWallet(params.chainId);

    const pair = await this.resolvePair(params.chainId, venue.factoryAddress, params.tokenA, params.tokenB);
    if (!pair || pair.toLowerCase() === ZERO) {
      return { pair: null, wallet: wallet.address, reserves: null, lp: null };
    }

    const [token0, token1, reserves, totalSupply, lpBal, balA, balB] = await Promise.all([
      client.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "token0" }),
      client.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "token1" }),
      client.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "getReserves" }),
      client.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "totalSupply" }),
      client.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "balanceOf", args: [wallet.address] }),
      client.readContract({ address: params.tokenA as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet.address] }),
      client.readContract({ address: params.tokenB as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet.address] }),
    ]);

    const [symA, decA, symB, decB] = await Promise.all([
      client.readContract({ address: params.tokenA as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }).catch(() => null),
      client.readContract({ address: params.tokenA as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }).catch(() => null),
      client.readContract({ address: params.tokenB as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }).catch(() => null),
      client.readContract({ address: params.tokenB as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }).catch(() => null),
    ]);

    const [r0, r1] = reserves as readonly [bigint, bigint, number];
    return {
      pair,
      wallet: wallet.address,
      router: venue.routerAddress,
      token0,
      token1,
      tokenA: { address: params.tokenA, symbol: symA, decimals: decA !== null ? Number(decA) : null },
      tokenB: { address: params.tokenB, symbol: symB, decimals: decB !== null ? Number(decB) : null },
      reserves: { reserve0: r0.toString(), reserve1: r1.toString() },
      lp: { totalSupply: (totalSupply as bigint).toString(), balance: (lpBal as bigint).toString() },
      balances: { tokenA: (balA as bigint).toString(), tokenB: (balB as bigint).toString() },
    };
  }

  private async ensureAllowance(chainId: number, token: string, owner: `0x${string}`, spender: `0x${string}`, amount: bigint) {
    const client = this.clientForChain(chainId);
    const wallet = await this.superAdminWallet(chainId);
    const allowance = (await client.readContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;
    if (allowance >= amount) return { approved: false };
    const hash = await wallet.client.writeContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
      account: wallet.address,
    });
    return { approved: true, hash };
  }

  async addLiquidity(params: {
    chainId: number;
    venueId: string;
    tokenA: string;
    tokenB: string;
    amountADesired: string;
    amountBDesired: string;
    slippageBps: number;
  }) {
    const venue = await prisma.venue.findUnique({ where: { id: params.venueId } });
    if (!venue?.routerAddress) throw new BadRequestException("Venue missing routerAddress");
    const router = venue.routerAddress as `0x${string}`;
    const wallet = await this.superAdminWallet(params.chainId);

    const amountA = BigInt(params.amountADesired);
    const amountB = BigInt(params.amountBDesired);
    if (amountA <= 0n || amountB <= 0n) throw new BadRequestException("Amounts must be > 0");

    const approvals = [];
    approvals.push(await this.ensureAllowance(params.chainId, params.tokenA, wallet.address, router, amountA));
    approvals.push(await this.ensureAllowance(params.chainId, params.tokenB, wallet.address, router, amountB));

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
    const hash = await wallet.client.writeContract({
      address: router,
      abi: UNISWAPV2_ROUTER_ABI,
      functionName: "addLiquidity",
      args: [
        params.tokenA as `0x${string}`,
        params.tokenB as `0x${string}`,
        amountA,
        amountB,
        applySlippageMin(amountA, params.slippageBps),
        applySlippageMin(amountB, params.slippageBps),
        wallet.address,
        deadline,
      ],
      account: wallet.address,
    });

    return { tx: hash, approvals };
  }

  async removeLiquidity(params: {
    chainId: number;
    venueId: string;
    tokenA: string;
    tokenB: string;
    liquidity: string;
    slippageBps: number;
  }) {
    const venue = await prisma.venue.findUnique({ where: { id: params.venueId } });
    if (!venue?.routerAddress || !venue.factoryAddress) throw new BadRequestException("Venue missing router/factory");
    const router = venue.routerAddress as `0x${string}`;
    const wallet = await this.superAdminWallet(params.chainId);

    const pair = await this.resolvePair(params.chainId, venue.factoryAddress, params.tokenA, params.tokenB);
    if (!pair || pair.toLowerCase() === ZERO) throw new BadRequestException("Pair does not exist");

    const liq = BigInt(params.liquidity);
    if (liq <= 0n) throw new BadRequestException("Liquidity must be > 0");

    const approval = await this.ensureAllowance(params.chainId, pair, wallet.address, router, liq);

    // Compute expected out amounts (pro-rata) and apply slippage mins.
    const client = this.clientForChain(params.chainId);
    const [reserves, totalSupply] = await Promise.all([
      client.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "getReserves" }),
      client.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "totalSupply" }),
    ]);
    const [r0, r1] = reserves as readonly [bigint, bigint, number];
    const ts = totalSupply as bigint;
    if (ts <= 0n) throw new BadRequestException("Invalid totalSupply");
    const exp0 = (liq * r0) / ts;
    const exp1 = (liq * r1) / ts;
    const min0 = applySlippageMin(exp0, params.slippageBps);
    const min1 = applySlippageMin(exp1, params.slippageBps);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
    const hash = await wallet.client.writeContract({
      address: router,
      abi: UNISWAPV2_ROUTER_ABI,
      functionName: "removeLiquidity",
      args: [
        params.tokenA as `0x${string}`,
        params.tokenB as `0x${string}`,
        liq,
        min0,
        min1,
        wallet.address,
        deadline,
      ],
      account: wallet.address,
    });

    return { tx: hash, approval, expected: { amount0: exp0.toString(), amount1: exp1.toString() }, mins: { amount0: min0.toString(), amount1: min1.toString() } };
  }
}

@Controller("lp")
@UseGuards(JwtAuthGuard, RolesGuard)
class LpController {
  constructor(private readonly svc: LpService) {}

  @Get("v2/pair")
  @Roles("SUPER_ADMIN")
  async getPair(@Query("factory") factory?: string, @Query("tokenA") tokenA?: string, @Query("tokenB") tokenB?: string) {
    if (!factory || !tokenA || !tokenB) throw new BadRequestException("Missing factory/tokenA/tokenB");
    const pair = await this.svc.resolvePair(43114, factory, tokenA, tokenB);
    return { factory, tokenA, tokenB, pair };
  }

  @Post("v2/register")
  @Roles("SUPER_ADMIN")
  async register(
    @Body() body: { chainId: number; venueId: string; tokenA: string; tokenB: string; feeBps: number },
    @CurrentUser() user: JwtPayload
  ) {
    return this.svc.registerV2Pool({
      chainId: body.chainId,
      venueId: body.venueId,
      factoryAddress: "",
      tokenA: body.tokenA,
      tokenB: body.tokenB,
      feeBps: body.feeBps,
      actor: user.sub,
    });
  }

  @Get("v2/position")
  @Roles("SUPER_ADMIN")
  position(
    @Query("chainId") chainId?: string,
    @Query("venueId") venueId?: string,
    @Query("tokenA") tokenA?: string,
    @Query("tokenB") tokenB?: string
  ) {
    if (!venueId || !tokenA || !tokenB) throw new BadRequestException("Missing venueId/tokenA/tokenB");
    return this.svc.position({ chainId: chainId ? Number(chainId) : 43114, venueId, tokenA, tokenB });
  }

  @Post("v2/add-liquidity")
  @Roles("SUPER_ADMIN")
  addLiquidity(@Body() body: any) {
    return this.svc.addLiquidity({
      chainId: Number(body.chainId ?? 43114),
      venueId: body.venueId,
      tokenA: body.tokenA,
      tokenB: body.tokenB,
      amountADesired: String(body.amountADesired),
      amountBDesired: String(body.amountBDesired),
      slippageBps: Number(body.slippageBps ?? 50),
    });
  }

  @Post("v2/remove-liquidity")
  @Roles("SUPER_ADMIN")
  removeLiquidity(@Body() body: any) {
    return this.svc.removeLiquidity({
      chainId: Number(body.chainId ?? 43114),
      venueId: body.venueId,
      tokenA: body.tokenA,
      tokenB: body.tokenB,
      liquidity: String(body.liquidity),
      slippageBps: Number(body.slippageBps ?? 50),
    });
  }
}

@Module({
  controllers: [LpController],
  providers: [LpService],
})
export class LpModule {}

