-- DropForeignKey
ALTER TABLE "executions" DROP CONSTRAINT "executions_opportunity_id_fkey";

-- DropForeignKey
ALTER TABLE "opportunity_routes" DROP CONSTRAINT "opportunity_routes_opportunity_id_fkey";

-- DropForeignKey
ALTER TABLE "pool_snapshots" DROP CONSTRAINT "pool_snapshots_pool_id_fkey";

-- DropForeignKey
ALTER TABLE "pools" DROP CONSTRAINT "pools_token0_id_fkey";

-- DropForeignKey
ALTER TABLE "pools" DROP CONSTRAINT "pools_token1_id_fkey";

-- DropForeignKey
ALTER TABLE "pools" DROP CONSTRAINT "pools_venue_id_fkey";

-- DropForeignKey
ALTER TABLE "risk_events" DROP CONSTRAINT "risk_events_token_id_fkey";

-- DropForeignKey
ALTER TABLE "tokens" DROP CONSTRAINT "tokens_chain_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_execution_id_fkey";

-- DropForeignKey
ALTER TABLE "venues" DROP CONSTRAINT "venues_chain_id_fkey";

-- DropForeignKey
ALTER TABLE "wallet_balances" DROP CONSTRAINT "wallet_balances_token_id_fkey";

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "chains" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "config_overrides" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "executions" ALTER COLUMN "submitted_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "confirmed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "opportunities" ALTER COLUMN "detected_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pool_snapshots" ALTER COLUMN "timestamp" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pools" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "risk_events" ALTER COLUMN "resolved_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tokens" ALTER COLUMN "last_screened" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "cooldown_until" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "submitted_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "confirmed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "dropped_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "venues" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "wallet_balances" ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "liquidity_maps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pool_id" UUID NOT NULL,
    "pool_address" TEXT NOT NULL,
    "pool_type" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "scan_from_block" BIGINT NOT NULL,
    "scan_to_block" BIGINT NOT NULL,
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "built_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidity_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "liquidity_maps_chain_id_pool_type_idx" ON "liquidity_maps"("chain_id", "pool_type");

-- CreateIndex
CREATE UNIQUE INDEX "liquidity_maps_pool_id_key" ON "liquidity_maps"("pool_id");

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("chain_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("chain_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_token0_id_fkey" FOREIGN KEY ("token0_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_token1_id_fkey" FOREIGN KEY ("token1_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_snapshots" ADD CONSTRAINT "pool_snapshots_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_routes" ADD CONSTRAINT "opportunity_routes_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_routes" ADD CONSTRAINT "opportunity_routes_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_balances" ADD CONSTRAINT "wallet_balances_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidity_maps" ADD CONSTRAINT "liquidity_maps_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "audit_logs_action" RENAME TO "audit_logs_action_created_at_idx";

-- RenameIndex
ALTER INDEX "audit_logs_actor" RENAME TO "audit_logs_actor_created_at_idx";

-- RenameIndex
ALTER INDEX "audit_logs_entity" RENAME TO "audit_logs_entity_type_entity_id_created_at_idx";

-- RenameIndex
ALTER INDEX "executions_state_created" RENAME TO "executions_state_created_at_idx";

-- RenameIndex
ALTER INDEX "executions_tx_hash" RENAME TO "executions_tx_hash_idx";

-- RenameIndex
ALTER INDEX "executions_wallet_created" RENAME TO "executions_wallet_address_created_at_idx";

-- RenameIndex
ALTER INDEX "opportunities_fingerprint" RENAME TO "opportunities_fingerprint_idx";

-- RenameIndex
ALTER INDEX "opportunities_net_profit" RENAME TO "opportunities_net_profit_usd_idx";

-- RenameIndex
ALTER INDEX "opportunities_state_detected" RENAME TO "opportunities_state_detected_at_idx";

-- RenameIndex
ALTER INDEX "opportunity_routes_opp" RENAME TO "opportunity_routes_opportunity_id_step_index_idx";

-- RenameIndex
ALTER INDEX "pool_snapshots_pool_ts" RENAME TO "pool_snapshots_pool_id_timestamp_idx";

-- RenameIndex
ALTER INDEX "pools_token_pair" RENAME TO "pools_token0_id_token1_id_idx";

-- RenameIndex
ALTER INDEX "pools_venue_active" RENAME TO "pools_venue_id_is_active_idx";

-- RenameIndex
ALTER INDEX "risk_events_severity_created" RENAME TO "risk_events_severity_created_at_idx";

-- RenameIndex
ALTER INDEX "risk_events_type_created" RENAME TO "risk_events_event_type_created_at_idx";

-- RenameIndex
ALTER INDEX "tokens_address" RENAME TO "tokens_address_idx";

-- RenameIndex
ALTER INDEX "tokens_chain_enabled" RENAME TO "tokens_chain_id_is_enabled_idx";

-- RenameIndex
ALTER INDEX "transactions_execution" RENAME TO "transactions_execution_id_idx";

-- RenameIndex
ALTER INDEX "transactions_nonce" RENAME TO "transactions_nonce_idx";

-- RenameIndex
ALTER INDEX "venues_chain_enabled" RENAME TO "venues_chain_id_is_enabled_idx";

-- RenameIndex
ALTER INDEX "wallet_balances_wallet" RENAME TO "wallet_balances_wallet_address_idx";
