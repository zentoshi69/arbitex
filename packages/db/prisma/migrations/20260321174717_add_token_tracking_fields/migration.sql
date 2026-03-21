-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "token_id" UUID;

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "accent_color" TEXT,
ADD COLUMN     "is_tracked" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "opportunities_token_id_detected_at_idx" ON "opportunities"("token_id", "detected_at" DESC);

-- CreateIndex
CREATE INDEX "tokens_chain_id_is_tracked_idx" ON "tokens"("chain_id", "is_tracked");

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
