-- AJC-16: Add per-payment benefit letter and LC 3761 ongoing notification letter types.
--
-- These enum additions are backwards-compatible. Existing rows with prior LetterType
-- values continue to validate. ALTER TYPE ADD VALUE is non-breaking in PostgreSQL.

-- AlterEnum
ALTER TYPE "letter_type" ADD VALUE 'BENEFIT_PAYMENT_LETTER';
ALTER TYPE "letter_type" ADD VALUE 'EMPLOYER_NOTIFICATION_BENEFIT_AWARD';
ALTER TYPE "letter_type" ADD VALUE 'EMPLOYER_NOTIFICATION_CLAIM_DECISION';
