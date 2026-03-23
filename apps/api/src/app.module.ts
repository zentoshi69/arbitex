import { Module } from "@nestjs/common";
import { OpportunitiesModule } from "./opportunities/opportunities.module.js";
import { ExecutionsModule } from "./executions/executions.module.js";
import { RiskModule } from "./risk/risk.module.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { TokensModule } from "./tokens/tokens.module.js";
import { VenuesModule } from "./venues/venues.module.js";
import { PnlModule } from "./pnl/pnl.module.js";
import { WsGatewayModule } from "./ws/ws.module.js";
import { MetricsModule } from "./metrics/metrics.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { PoolsModule } from "./pools/pools.module.js";
import { ChainModule } from "./chain/chain.module.js";
import { LpModule } from "./lp/lp.module.js";
import { MarketModule } from "./market/market.module.js";
import { FairValueModule } from "./fair-value/fair-value.module.js";
import { RegimeModule } from "./regime/regime.module.js";
import { TradingModule } from "./trading/trading.module.js";
import { StatsModule } from "./stats/stats.module.js";
import { AccumulationModule } from "./accumulation/accumulation.module.js";
import { ConversionModule } from "./conversion/conversion.module.js";

@Module({
  imports: [
    AuthModule,
    OpportunitiesModule,
    ExecutionsModule,
    RiskModule,
    HealthModule,
    TokensModule,
    VenuesModule,
    PnlModule,
    WsGatewayModule,
    MetricsModule,
    AuditModule,
    PoolsModule,
    ChainModule,
    LpModule,
    MarketModule,
    FairValueModule,
    RegimeModule,
    TradingModule,
    StatsModule,
    AccumulationModule,
    ConversionModule,
  ],
})
export class AppModule {}
