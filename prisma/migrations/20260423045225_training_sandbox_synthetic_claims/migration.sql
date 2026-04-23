-- Phase 10.7 — Training Sandbox (AJC-19)
-- Adds per-user training-mode flag and synthetic-claim ownership tracking.
-- Synthetic claims are scoped to the trainee that seeded them via syntheticOwnerId
-- so reports/analytics can filter them out (`is_synthetic = false`).

-- AlterTable: User
ALTER TABLE "users"
  ADD COLUMN "training_mode_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Claim
ALTER TABLE "claims"
  ADD COLUMN "is_synthetic"        BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN "synthetic_owner_id"  TEXT;

-- ForeignKey: Claim.synthetic_owner_id -> users.id (nullable, set null on delete)
ALTER TABLE "claims"
  ADD CONSTRAINT "claims_synthetic_owner_id_fkey"
  FOREIGN KEY ("synthetic_owner_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for sandbox queries
CREATE INDEX "idx_claims_synthetic_owner" ON "claims"("synthetic_owner_id");
CREATE INDEX "idx_claims_is_synthetic"    ON "claims"("is_synthetic");
