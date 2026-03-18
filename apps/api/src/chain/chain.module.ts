import { Controller, Get, UseGuards } from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { createChainClient } from "@arbitex/chain";
import { config, getPrimaryRpcConfig } from "@arbitex/config";
import { JwtAuthGuard, Public } from "../auth/auth.module.js";

@Injectable()
export class ChainService {
  private readonly client = createChainClient({
    ...getPrimaryRpcConfig(),
    chainId: config.CHAIN_ID,
  });

  async getGasPrice(): Promise<{ gasPriceGwei: number; gasPriceWei: string }> {
    const wei = await this.client.getGasPrice();
    return {
      gasPriceWei: wei.toString(),
      gasPriceGwei: Number(wei / 1_000_000_000n),
    };
  }
}

@Controller("chain")
@UseGuards(JwtAuthGuard)
export class ChainController {
  constructor(private readonly svc: ChainService) {}

  @Get("gas-price")
  getGasPrice() {
    return this.svc.getGasPrice();
  }
}

@Module({
  controllers: [ChainController],
  providers: [ChainService],
  exports: [ChainService],
})
export class ChainModule {}
