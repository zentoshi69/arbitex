-- ArbitEx — Initial Migration
-- Generated for PostgreSQL 15

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- chains
CREATE TABLE "chains" (
  "id"          SERIAL PRIMARY KEY,
  "chain_id"    INTEGER NOT NULL UNIQUE,
  "name"        TEXT NOT NULL,
  "short_name"  TEXT NOT NULL,
  "rpc_url"     TEXT NOT NULL,
  "is_enabled"  BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- venues
CREATE TABLE "venues" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "chain_id"        INTEGER NOT NULL REFERENCES "chains"("chain_id"),
  "name"            TEXT NOT NULL,
  "protocol"        TEXT NOT NULL,
  "router_address"  TEXT NOT NULL,
  "factory_address" TEXT,
  "is_enabled"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("chain_id", "name")
);
CREATE INDEX "venues_chain_enabled" ON "venues" ("chain_id", "is_enabled");

-- tokens
CREATE TABLE "tokens" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "chain_id"      INTEGER NOT NULL REFERENCES "chains"("chain_id"),
  "address"       TEXT NOT NULL,
  "symbol"        TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "decimals"      INTEGER NOT NULL,
  "logo_uri"      TEXT,
  "flags"         TEXT[] NOT NULL DEFAULT '{}',
  "is_enabled"    BOOLEAN NOT NULL DEFAULT true,
  "last_screened" TIMESTAMPTZ,
  "cooldown_until" TIMESTAMPTZ,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("chain_id", "address")
);
CREATE INDEX "tokens_chain_enabled" ON "tokens" ("chain_id", "is_enabled");
CREATE INDEX "tokens_address" ON "tokens" ("address");

-- pools
CREATE TABLE "pools" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "venue_id"      UUID NOT NULL REFERENCES "venues"("id"),
  "token0_id"     UUID NOT NULL REFERENCES "tokens"("id"),
  "token1_id"     UUID NOT NULL REFERENCES "tokens"("id"),
  "pool_address"  TEXT NOT NULL,
  "fee_bps"       INTEGER NOT NULL,
  "is_active"     BOOLEAN NOT NULL DEFAULT true,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("venue_id", "token0_id", "token1_id", "fee_bps")
);
CREATE INDEX "pools_venue_active" ON "pools" ("venue_id", "is_active");
CREATE INDEX "pools_token_pair"   ON "pools" ("token0_id", "token1_id");

-- pool_snapshots
CREATE TABLE "pool_snapshots" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "pool_id"      UUID NOT NULL REFERENCES "pools"("id"),
  "price0_per1"  NUMERIC(36,18) NOT NULL,
  "price1_per0"  NUMERIC(36,18) NOT NULL,
  "liquidity_usd" NUMERIC(20,4) NOT NULL,
  "sqrt_price_x96" TEXT,
  "tick"         INTEGER,
  "volume_usd_24h" NUMERIC(20,4),
  "timestamp"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "pool_snapshots_pool_ts" ON "pool_snapshots" ("pool_id", "timestamp" DESC);

-- opportunities
CREATE TABLE "opportunities" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "state"               TEXT NOT NULL,
  "token_in_address"    TEXT NOT NULL,
  "token_out_address"   TEXT NOT NULL,
  "token_in_symbol"     TEXT NOT NULL,
  "token_out_symbol"    TEXT NOT NULL,
  "trade_size_usd"      NUMERIC(20,4) NOT NULL,
  "gross_spread_usd"    NUMERIC(20,4) NOT NULL,
  "gas_estimate_usd"    NUMERIC(20,4) NOT NULL,
  "venue_fees_usd"      NUMERIC(20,4) NOT NULL,
  "slippage_buffer_usd" NUMERIC(20,4) NOT NULL,
  "failure_buffer_usd"  NUMERIC(20,4) NOT NULL,
  "net_profit_usd"      NUMERIC(20,4) NOT NULL,
  "net_profit_bps"      NUMERIC(10,4) NOT NULL,
  "buy_venue_id"        UUID NOT NULL,
  "sell_venue_id"       UUID NOT NULL,
  "buy_venue_name"      TEXT NOT NULL,
  "sell_venue_name"     TEXT NOT NULL,
  "fingerprint"         TEXT NOT NULL,
  "risk_decision"       JSONB,
  "detected_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expires_at"          TIMESTAMPTZ,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "opportunities_state_detected" ON "opportunities" ("state", "detected_at" DESC);
CREATE INDEX "opportunities_fingerprint"    ON "opportunities" ("fingerprint");
CREATE INDEX "opportunities_net_profit"     ON "opportunities" ("net_profit_usd" DESC);

-- opportunity_routes
CREATE TABLE "opportunity_routes" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "opportunity_id"  UUID NOT NULL REFERENCES "opportunities"("id"),
  "step_index"      INTEGER NOT NULL,
  "pool_id"         UUID NOT NULL,
  "venue_id"        UUID NOT NULL,
  "venue_name"      TEXT NOT NULL,
  "token_in"        TEXT NOT NULL,
  "token_out"       TEXT NOT NULL,
  "amount_in"       TEXT NOT NULL,
  "amount_out"      TEXT NOT NULL,
  "fee_bps"         INTEGER NOT NULL
);
CREATE INDEX "opportunity_routes_opp" ON "opportunity_routes" ("opportunity_id", "step_index");

-- executions
CREATE TABLE "executions" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "opportunity_id"  UUID NOT NULL UNIQUE REFERENCES "opportunities"("id"),
  "state"           TEXT NOT NULL,
  "wallet_address"  TEXT NOT NULL,
  "tx_hash"         TEXT,
  "block_number"    INTEGER,
  "gas_used"        TEXT,
  "gas_price"       TEXT,
  "gas_cost_usd"    NUMERIC(20,4),
  "pnl_usd"         NUMERIC(20,4),
  "failure_reason"  TEXT,
  "failure_code"    TEXT,
  "retry_count"     INTEGER NOT NULL DEFAULT 0,
  "submitted_at"    TIMESTAMPTZ,
  "confirmed_at"    TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "executions_state_created"  ON "executions" ("state", "created_at" DESC);
CREATE INDEX "executions_tx_hash"        ON "executions" ("tx_hash");
CREATE INDEX "executions_wallet_created" ON "executions" ("wallet_address", "created_at" DESC);

-- transactions
CREATE TABLE "transactions" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "execution_id"  UUID NOT NULL REFERENCES "executions"("id"),
  "nonce"         INTEGER NOT NULL,
  "raw_tx"        TEXT NOT NULL,
  "bundle_hash"   TEXT,
  "submitted_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "confirmed_at"  TIMESTAMPTZ,
  "dropped_at"    TIMESTAMPTZ
);
CREATE INDEX "transactions_execution" ON "transactions" ("execution_id");
CREATE INDEX "transactions_nonce"     ON "transactions" ("nonce");

-- wallet_balances
CREATE TABLE "wallet_balances" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "wallet_address"  TEXT NOT NULL,
  "token_id"        UUID NOT NULL REFERENCES "tokens"("id"),
  "balance_wei"     TEXT NOT NULL,
  "usd_value"       NUMERIC(20,4) NOT NULL,
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("wallet_address", "token_id")
);
CREATE INDEX "wallet_balances_wallet" ON "wallet_balances" ("wallet_address");

-- risk_events
CREATE TABLE "risk_events" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_type"  TEXT NOT NULL,
  "severity"    TEXT NOT NULL,
  "token_id"    UUID REFERENCES "tokens"("id"),
  "venue_id"    UUID,
  "details"     JSONB NOT NULL,
  "resolved"    BOOLEAN NOT NULL DEFAULT false,
  "resolved_at" TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "risk_events_severity_created"  ON "risk_events" ("severity", "created_at" DESC);
CREATE INDEX "risk_events_type_created"      ON "risk_events" ("event_type", "created_at" DESC);

-- config_overrides
CREATE TABLE "config_overrides" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key"         TEXT NOT NULL UNIQUE,
  "value"       TEXT NOT NULL,
  "updated_by"  TEXT NOT NULL,
  "expires_at"  TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- audit_logs (append-only — no UPDATE/DELETE permitted via application)
CREATE TABLE "audit_logs" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "action"      TEXT NOT NULL,
  "actor"       TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id"   TEXT NOT NULL,
  "diff"        JSONB,
  "ip_address"  TEXT,
  "user_agent"  TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "audit_logs_entity"  ON "audit_logs" ("entity_type", "entity_id", "created_at" DESC);
CREATE INDEX "audit_logs_actor"   ON "audit_logs" ("actor", "created_at" DESC);
CREATE INDEX "audit_logs_action"  ON "audit_logs" ("action", "created_at" DESC);

-- Append-only enforcement: revoke DELETE on audit_logs from application user
-- In production: REVOKE DELETE ON audit_logs FROM arbitex_app_user;
