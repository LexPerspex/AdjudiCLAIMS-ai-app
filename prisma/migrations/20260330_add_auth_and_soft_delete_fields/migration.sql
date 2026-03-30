-- Migration: add-auth-and-soft-delete-fields
-- Sprint 2 Workstream A: Authentication System
-- Adds password auth, MFA, account lockout, email verification, and soft-delete fields.

-- ============================================================
-- User: authentication fields
-- ============================================================
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verification_token" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verification_expiry" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_secret" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP(3);

-- ============================================================
-- User: soft delete
-- ============================================================
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_by" TEXT;

-- ============================================================
-- Claim: soft delete
-- ============================================================
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "deleted_by" TEXT;

-- ============================================================
-- Document: soft delete
-- ============================================================
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "deleted_by" TEXT;

-- ============================================================
-- AuditEventType: new enum values
-- ============================================================
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'USER_LOGIN_FAILED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'USER_ACCOUNT_LOCKED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'USER_MFA_ENROLLED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'USER_MFA_VERIFIED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'USER_PASSWORD_CHANGED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'USER_CREATED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'USER_DEACTIVATED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'USER_ROLE_CHANGED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'SESSION_EXPIRED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'EXPORT_DATA_REQUESTED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'DATA_DELETION_REQUESTED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'DATA_DELETION_COMPLETED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'SYSTEM_CONFIG_CHANGED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'DEPLOYMENT_COMPLETED';
