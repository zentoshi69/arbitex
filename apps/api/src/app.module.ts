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
  ],
})
export class AppModule {}
