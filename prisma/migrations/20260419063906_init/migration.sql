-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "organization_type" AS ENUM ('CARRIER', 'TPA', 'SELF_INSURED');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('CLAIMS_ADMIN', 'CLAIMS_SUPERVISOR', 'CLAIMS_EXAMINER');

-- CreateEnum
CREATE TYPE "claim_status" AS ENUM ('OPEN', 'UNDER_INVESTIGATION', 'ACCEPTED', 'DENIED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('DWC1_CLAIM_FORM', 'MEDICAL_REPORT', 'BILLING_STATEMENT', 'LEGAL_CORRESPONDENCE', 'EMPLOYER_REPORT', 'INVESTIGATION_REPORT', 'UTILIZATION_REVIEW', 'AME_QME_REPORT', 'DEPOSITION_TRANSCRIPT', 'IMAGING_REPORT', 'PHARMACY_RECORD', 'WAGE_STATEMENT', 'BENEFIT_NOTICE', 'SETTLEMENT_DOCUMENT', 'CORRESPONDENCE', 'OTHER', 'WCAB_FILING', 'LIEN_CLAIM', 'DISCOVERY_REQUEST', 'RETURN_TO_WORK', 'PAYMENT_RECORD', 'DWC_OFFICIAL_FORM', 'WORK_PRODUCT', 'MEDICAL_CHRONOLOGY', 'CLAIM_ADMINISTRATION');

-- CreateEnum
CREATE TYPE "access_level" AS ENUM ('SHARED', 'ATTORNEY_ONLY', 'EXAMINER_ONLY');

-- CreateEnum
CREATE TYPE "ocr_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "chat_role" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "upl_zone" AS ENUM ('GREEN', 'YELLOW', 'RED');

-- CreateEnum
CREATE TYPE "deadline_type" AS ENUM ('ACKNOWLEDGE_15DAY', 'DETERMINE_40DAY', 'TD_FIRST_14DAY', 'TD_SUBSEQUENT_14DAY', 'DELAY_NOTICE_30DAY', 'UR_PROSPECTIVE_5DAY', 'UR_RETROSPECTIVE_30DAY', 'EMPLOYER_NOTIFY_15DAY');

-- CreateEnum
CREATE TYPE "deadline_status" AS ENUM ('PENDING', 'MET', 'MISSED', 'WAIVED');

-- CreateEnum
CREATE TYPE "investigation_item_type" AS ENUM ('THREE_POINT_CONTACT_WORKER', 'THREE_POINT_CONTACT_EMPLOYER', 'THREE_POINT_CONTACT_PROVIDER', 'RECORDED_STATEMENT', 'EMPLOYER_REPORT', 'MEDICAL_RECORDS', 'DWC1_ON_FILE', 'INDEX_BUREAU_CHECK', 'AWE_VERIFIED', 'INITIAL_RESERVES_SET');

-- CreateEnum
CREATE TYPE "payment_type" AS ENUM ('TD', 'PD', 'DEATH_BENEFIT', 'SJDB_VOUCHER');

-- CreateEnum
CREATE TYPE "audit_event_type" AS ENUM ('DOCUMENT_UPLOADED', 'DOCUMENT_CLASSIFIED', 'DOCUMENT_VIEWED', 'DOCUMENT_DELETED', 'CLAIM_CREATED', 'CLAIM_STATUS_CHANGED', 'COVERAGE_DETERMINATION', 'RESERVE_CHANGED', 'BENEFIT_CALCULATED', 'BENEFIT_PAYMENT_ISSUED', 'DEADLINE_CREATED', 'DEADLINE_MET', 'DEADLINE_MISSED', 'DEADLINE_WAIVED', 'CHAT_MESSAGE_SENT', 'CHAT_RESPONSE_GENERATED', 'UPL_ZONE_CLASSIFICATION', 'UPL_OUTPUT_BLOCKED', 'UPL_DISCLAIMER_INJECTED', 'UPL_OUTPUT_VALIDATION_FAIL', 'COUNSEL_REFERRAL_GENERATED', 'UR_DECISION', 'INVESTIGATION_ACTIVITY', 'TRAINING_MODULE_COMPLETED', 'TRAINING_ASSESSMENT_PASSED', 'TIER1_TERM_DISMISSED', 'USER_LOGIN', 'USER_LOGOUT', 'PERMISSION_DENIED', 'LETTER_GENERATED', 'COUNSEL_REFERRAL_CREATED', 'COUNSEL_REFERRAL_STATUS_CHANGED', 'COMPLIANCE_REPORT_GENERATED', 'LIEN_CREATED', 'LIEN_STATUS_CHANGED', 'LIEN_OMFS_COMPARED', 'LIEN_RESOLVED', 'REGULATORY_CHANGE_ACKNOWLEDGED', 'MONTHLY_REVIEW_COMPLETED', 'QUARTERLY_REFRESHER_COMPLETED', 'USER_LOGIN_FAILED', 'USER_ACCOUNT_LOCKED', 'USER_MFA_ENROLLED', 'USER_MFA_VERIFIED', 'USER_PASSWORD_CHANGED', 'USER_CREATED', 'USER_DEACTIVATED', 'USER_ROLE_CHANGED', 'SESSION_EXPIRED', 'EXPORT_DATA_REQUESTED', 'DATA_DELETION_REQUESTED', 'DATA_DELETION_COMPLETED', 'SYSTEM_CONFIG_CHANGED', 'DEPLOYMENT_COMPLETED', 'ANOMALY_DETECTED', 'BODY_PART_STATUS_CHANGED', 'MEDICAL_PAYMENT_RECORDED');

-- CreateEnum
CREATE TYPE "letter_type" AS ENUM ('TD_BENEFIT_EXPLANATION', 'TD_PAYMENT_SCHEDULE', 'WAITING_PERIOD_NOTICE', 'EMPLOYER_NOTIFICATION_LC3761', 'BENEFIT_ADJUSTMENT_NOTICE');

-- CreateEnum
CREATE TYPE "referral_status" AS ENUM ('PENDING', 'SENT', 'RESPONDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "lien_type" AS ENUM ('MEDICAL_PROVIDER', 'ATTORNEY_FEE', 'EDD', 'EXPENSE', 'CHILD_SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "lien_status" AS ENUM ('RECEIVED', 'UNDER_REVIEW', 'OMFS_COMPARED', 'NEGOTIATING', 'PAID_IN_FULL', 'PAID_REDUCED', 'DISPUTED', 'WITHDRAWN', 'WCAB_HEARING', 'RESOLVED_BY_ORDER');

-- CreateEnum
CREATE TYPE "filing_fee_status" AS ENUM ('PAID', 'NOT_PAID', 'EXEMPT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "body_part_status" AS ENUM ('PENDING', 'ADMITTED', 'DENIED', 'UNDER_INVESTIGATION');

-- CreateEnum
CREATE TYPE "medical_payment_type" AS ENUM ('DIRECT_PAYMENT', 'LIEN_PAYMENT', 'PHARMACY', 'DME', 'DIAGNOSTICS');

-- CreateEnum
CREATE TYPE "workflow_step_status" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "graph_node_type" AS ENUM ('PERSON', 'ORGANIZATION', 'BODY_PART', 'CLAIM', 'DOCUMENT', 'PROCEEDING', 'LEGAL_ISSUE', 'LIEN', 'SETTLEMENT', 'TREATMENT', 'MEDICATION', 'RATING', 'BENEFIT');

-- CreateEnum
CREATE TYPE "graph_edge_type" AS ENUM ('ESTABLISHES', 'MENTIONS', 'AMENDS', 'SUPERSEDES', 'RESPONDS_TO', 'REPRESENTS', 'EMPLOYED_BY', 'AFFILIATED_WITH', 'DEPENDENT_OF', 'TREATS', 'EVALUATES', 'DIAGNOSES', 'INJURED', 'PRESCRIBED', 'PERFORMED', 'REVIEWS_UR', 'REVIEWS_IMR', 'REFERS', 'FILES', 'ADJUDICATES', 'DECIDES', 'ORDERS', 'AWARDS', 'PERTAINS_TO', 'APPEALS', 'CITES_STATUTE', 'PAYS', 'FILES_LIEN', 'SETTLES_LIEN', 'DENIES', 'INSURES', 'RATES', 'APPORTIONS', 'OFFERS_WORK', 'SENDS');

-- CreateEnum
CREATE TYPE "contradiction_status" AS ENUM ('NONE', 'UNRESOLVED', 'HUMAN_CONFIRMED', 'HUMAN_REJECTED', 'AUTO_RESOLVED');

-- CreateEnum
CREATE TYPE "person_role" AS ENUM ('APPLICANT', 'APPLICANT_ATTORNEY', 'DEFENSE_ATTORNEY', 'DEFENDANT', 'EMPLOYER_REP', 'CLAIMS_EXAMINER', 'CLAIMS_SUPERVISOR', 'TREATING_PHYSICIAN', 'QME', 'AME', 'IME', 'SURGEON', 'RADIOLOGIST', 'PSYCHIATRIST', 'PSYCHOLOGIST', 'CHIROPRACTOR', 'PHYSICAL_THERAPIST', 'PHARMACIST', 'VOCATIONAL_EXPERT', 'ECONOMIST', 'LIFE_CARE_PLANNER', 'INVESTIGATOR', 'WCAB_JUDGE', 'LIEN_CLAIMANT', 'WITNESS', 'GUARDIAN', 'INTERPRETER', 'NURSE_CASE_MANAGER');

-- CreateEnum
CREATE TYPE "org_type" AS ENUM ('EMPLOYER', 'CARRIER', 'TPA_ORG', 'MEDICAL_FACILITY', 'PHARMACY', 'LAW_FIRM', 'LIEN_CLAIMANT_ORG', 'VOCATIONAL_REHAB', 'WCAB', 'DEU', 'DWC', 'RECORD_COPY_SERVICE', 'BILLING_REVIEW');

-- CreateEnum
CREATE TYPE "maturity_label" AS ENUM ('NASCENT', 'GROWING', 'MATURE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "contradiction_type" AS ENUM ('DATE_CONFLICT', 'VALUE_CONFLICT', 'EXISTENCE_CONFLICT', 'ATTRIBUTION_CONFLICT', 'STATUS_CONFLICT');

-- CreateEnum
CREATE TYPE "query_type" AS ENUM ('FORM_FIELD', 'CHAT_QUERY');

-- CreateEnum
CREATE TYPE "execution_tier" AS ENUM ('MICRO', 'STANDARD', 'DEEP');

-- CreateEnum
CREATE TYPE "query_pattern" AS ENUM ('ENTITY_LOOKUP', 'RELATIONSHIP', 'TEMPORAL', 'NARRATIVE', 'ANALYTICAL');

-- CreateEnum
CREATE TYPE "query_outcome" AS ENUM ('GRAPH_HIT', 'VECTOR_HIT', 'FALLBACK', 'NO_RESULT');

-- CreateEnum
CREATE TYPE "routing_scope" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "organization_type" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "password_hash" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verification_token" TEXT,
    "email_verification_expiry" TIMESTAMP(3),
    "mfa_secret" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "claim_number" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "assigned_examiner_id" TEXT NOT NULL,
    "claimant_name" TEXT NOT NULL,
    "date_of_injury" DATE NOT NULL,
    "body_parts" JSONB NOT NULL,
    "employer" TEXT NOT NULL,
    "insurer" TEXT NOT NULL,
    "status" "claim_status" NOT NULL DEFAULT 'OPEN',
    "current_reserve_indemnity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "current_reserve_medical" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "current_reserve_legal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "current_reserve_lien" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_paid_indemnity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_paid_medical" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "date_received" TIMESTAMP(3) NOT NULL,
    "date_acknowledged" TIMESTAMP(3),
    "date_determined" TIMESTAMP(3),
    "date_closed" TIMESTAMP(3),
    "is_litigated" BOOLEAN NOT NULL DEFAULT false,
    "has_applicant_attorney" BOOLEAN NOT NULL DEFAULT false,
    "is_cumulative_trauma" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "document_type" "document_type",
    "document_subtype" TEXT,
    "classification_confidence" DOUBLE PRECISION,
    "access_level" "access_level" NOT NULL DEFAULT 'EXAMINER_ONLY',
    "contains_legal_analysis" BOOLEAN NOT NULL DEFAULT false,
    "contains_work_product" BOOLEAN NOT NULL DEFAULT false,
    "contains_privileged" BOOLEAN NOT NULL DEFAULT false,
    "ocr_status" "ocr_status" NOT NULL DEFAULT 'PENDING',
    "extracted_text" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "heading_l1" TEXT,
    "heading_l2" TEXT,
    "heading_l3" TEXT,
    "page_numbers" JSONB,
    "is_continuation" BOOLEAN NOT NULL DEFAULT false,
    "has_continuation" BOOLEAN NOT NULL DEFAULT false,
    "contains_table" BOOLEAN NOT NULL DEFAULT false,
    "contains_procedure" BOOLEAN NOT NULL DEFAULT false,
    "parent_chunk_id" TEXT,
    "is_parent" BOOLEAN NOT NULL DEFAULT false,
    "context_prefix" TEXT,
    "token_count" INTEGER,
    "chunk_vector_algorithm" TEXT,
    "chunk_vector_dimension" INTEGER,
    "embedding" vector,
    "search_vector" tsvector,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_fields" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "field_value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "source_page" INTEGER,

    CONSTRAINT "extracted_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "document_id" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "event_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "embedding" vector,
    "search_vector" tsvector,
    "embedding_model" TEXT,
    "embedding_dimension" INTEGER,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "chat_role" NOT NULL,
    "content" TEXT NOT NULL,
    "upl_zone" "upl_zone",
    "was_blocked" BOOLEAN NOT NULL DEFAULT false,
    "disclaimer_applied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_deadlines" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "deadline_type" "deadline_type" NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "deadline_status" NOT NULL DEFAULT 'PENDING',
    "statutory_authority" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "regulatory_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigation_items" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "item_type" "investigation_item_type" NOT NULL,
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "document_id" TEXT,

    CONSTRAINT "investigation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_payments" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "payment_type" "payment_type" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "penalty_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "calculation_inputs" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benefit_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "dismissed_terms" JSONB NOT NULL DEFAULT '[]',
    "training_modules_completed" JSONB,
    "is_training_complete" BOOLEAN NOT NULL DEFAULT false,
    "learning_mode_expiry" TIMESTAMP(3),
    "acknowledged_changes" JSONB NOT NULL DEFAULT '[]',
    "monthly_reviews_completed" JSONB,
    "quarterly_refreshers" JSONB,
    "audit_training_completed" JSONB,
    "last_recertification_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_progress" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "step_statuses" JSONB NOT NULL DEFAULT '[]',
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT,
    "user_id" TEXT NOT NULL,
    "event_type" "audit_event_type" NOT NULL,
    "event_data" JSONB,
    "upl_zone" "upl_zone",
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_letters" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "letter_type" "letter_type" NOT NULL,
    "content" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "populated_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counsel_referrals" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "legal_issue" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "referral_status" NOT NULL DEFAULT 'PENDING',
    "counsel_email" TEXT,
    "counsel_response" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counsel_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liens" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "lien_claimant" TEXT NOT NULL,
    "lien_type" "lien_type" NOT NULL,
    "total_amount_claimed" DECIMAL(12,2) NOT NULL,
    "total_omfs_allowed" DECIMAL(12,2),
    "discrepancy_amount" DECIMAL(12,2),
    "filing_date" DATE NOT NULL,
    "filing_fee_status" "filing_fee_status" NOT NULL DEFAULT 'UNKNOWN',
    "status" "lien_status" NOT NULL DEFAULT 'RECEIVED',
    "resolved_amount" DECIMAL(12,2),
    "resolved_at" TIMESTAMP(3),
    "wcab_case_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lien_line_items" (
    "id" TEXT NOT NULL,
    "lien_id" TEXT NOT NULL,
    "service_date" DATE NOT NULL,
    "cpt_code" TEXT,
    "description" TEXT NOT NULL,
    "amount_claimed" DECIMAL(10,2) NOT NULL,
    "omfs_rate" DECIMAL(10,2),
    "is_overcharge" BOOLEAN NOT NULL DEFAULT false,
    "overcharge_amount" DECIMAL(10,2),
    "body_part_id" TEXT,

    CONSTRAINT "lien_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_body_parts" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "body_part_name" TEXT NOT NULL,
    "icd_code" TEXT,
    "status" "body_part_status" NOT NULL DEFAULT 'PENDING',
    "status_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claim_body_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coverage_determinations" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "body_part_id" TEXT NOT NULL,
    "previous_status" "body_part_status",
    "new_status" "body_part_status" NOT NULL,
    "determination_date" DATE NOT NULL,
    "determined_by_id" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "counsel_referral_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coverage_determinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_payments" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "body_part_id" TEXT,
    "lien_id" TEXT,
    "provider_name" TEXT NOT NULL,
    "payment_type" "medical_payment_type" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "service_date" DATE,
    "cpt_code" TEXT,
    "description" TEXT NOT NULL,
    "check_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_nodes" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "node_type" "graph_node_type" NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "properties" JSONB NOT NULL DEFAULT '{}',
    "person_role" "person_role",
    "org_type" "org_type",
    "source_document_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "canonical_id" TEXT,
    "embedding" vector,
    "embedding_model" TEXT,
    "human_verified" BOOLEAN NOT NULL DEFAULT false,
    "human_verified_at" TIMESTAMP(3),
    "human_verified_by" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_edges" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "edge_type" "graph_edge_type" NOT NULL,
    "source_node_id" TEXT NOT NULL,
    "target_node_id" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "source_document_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_chunk_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source_confidences" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "traversal_count" INTEGER NOT NULL DEFAULT 0,
    "last_traversed_at" TIMESTAMP(3),
    "corroboration_count" INTEGER NOT NULL DEFAULT 1,
    "first_established_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_corroborated_at" TIMESTAMP(3),
    "contradiction_status" "contradiction_status" NOT NULL DEFAULT 'NONE',
    "contradicted_by_edge_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contradiction_type" "contradiction_type",
    "human_verified" BOOLEAN NOT NULL DEFAULT false,
    "human_verified_at" TIMESTAMP(3),
    "human_verified_by" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_summaries" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "node_ids" JSONB NOT NULL DEFAULT '[]',
    "edge_ids" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "summary_embedding" vector,
    "embedding_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_maturity" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "medical_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "insurance_benefit_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employment_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "regulatory_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidential_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maturity_label" "maturity_label" NOT NULL DEFAULT 'NASCENT',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_maturity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_status_changes" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "node_id" TEXT,
    "edge_id" TEXT,
    "property_name" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT NOT NULL,
    "effective_date" TIMESTAMP(3),
    "source_document_id" TEXT,
    "source_chunk_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_query_signals" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "query_id" TEXT NOT NULL,
    "query_type" "query_type" NOT NULL,
    "pattern" "query_pattern" NOT NULL,
    "observe_snapshot" JSONB,
    "is_c_target" JSONB,
    "selected_tier" "execution_tier" NOT NULL,
    "graph_result" JSONB,
    "vector_result" JSONB,
    "outcome" "query_outcome" NOT NULL,
    "coverage_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "response_accuracy" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_query_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_entity_merges" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "survivor_node_id" TEXT NOT NULL,
    "merged_node_id" TEXT NOT NULL,
    "merge_reason" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "merged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversed_at" TIMESTAMP(3),

    CONSTRAINT "graph_entity_merges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_routing_memory" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT,
    "organization_id" TEXT,
    "scope" "routing_scope" NOT NULL,
    "pattern" "query_pattern" NOT NULL,
    "preferred_tier" "execution_tier" NOT NULL,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_routing_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_facts" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claim_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fact_citations" (
    "id" TEXT NOT NULL,
    "fact_id" TEXT NOT NULL,
    "document_chunk_id" TEXT NOT NULL,
    "page_number" INTEGER,
    "excerpt" TEXT,
    "similarity_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fact_citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_citations" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "page_number" INTEGER,
    "excerpt" TEXT,
    "similarity_score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "chat_citations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_organization_id" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "claims_claim_number_key" ON "claims"("claim_number");

-- CreateIndex
CREATE INDEX "idx_claims_organization_id" ON "claims"("organization_id");

-- CreateIndex
CREATE INDEX "idx_claims_assigned_examiner_id" ON "claims"("assigned_examiner_id");

-- CreateIndex
CREATE INDEX "idx_claims_status" ON "claims"("status");

-- CreateIndex
CREATE INDEX "idx_claims_claim_number" ON "claims"("claim_number");

-- CreateIndex
CREATE INDEX "idx_claims_date_of_injury" ON "claims"("date_of_injury");

-- CreateIndex
CREATE INDEX "idx_claims_is_litigated" ON "claims"("is_litigated");

-- CreateIndex
CREATE INDEX "idx_claims_org_status" ON "claims"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_claims_org_examiner" ON "claims"("organization_id", "assigned_examiner_id");

-- CreateIndex
CREATE INDEX "idx_documents_claim_id" ON "documents"("claim_id");

-- CreateIndex
CREATE INDEX "idx_documents_document_type" ON "documents"("document_type");

-- CreateIndex
CREATE INDEX "idx_documents_ocr_status" ON "documents"("ocr_status");

-- CreateIndex
CREATE INDEX "idx_documents_access_level" ON "documents"("access_level");

-- CreateIndex
CREATE INDEX "idx_documents_claim_type" ON "documents"("claim_id", "document_type");

-- CreateIndex
CREATE INDEX "idx_document_chunks_document_id" ON "document_chunks"("document_id");

-- CreateIndex
CREATE INDEX "idx_document_chunks_doc_chunk_idx" ON "document_chunks"("document_id", "chunk_index");

-- CreateIndex
CREATE INDEX "idx_document_chunks_parent_id" ON "document_chunks"("parent_chunk_id");

-- CreateIndex
CREATE INDEX "idx_document_chunks_doc_is_parent" ON "document_chunks"("document_id", "is_parent");

-- CreateIndex
CREATE INDEX "idx_extracted_fields_document_id" ON "extracted_fields"("document_id");

-- CreateIndex
CREATE INDEX "idx_extracted_fields_field_name" ON "extracted_fields"("field_name");

-- CreateIndex
CREATE INDEX "idx_extracted_fields_doc_field" ON "extracted_fields"("document_id", "field_name");

-- CreateIndex
CREATE INDEX "idx_timeline_events_claim_id" ON "timeline_events"("claim_id");

-- CreateIndex
CREATE INDEX "idx_timeline_events_claim_date" ON "timeline_events"("claim_id", "event_date");

-- CreateIndex
CREATE INDEX "idx_timeline_events_event_type" ON "timeline_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_timeline_events_document_id" ON "timeline_events"("document_id");

-- CreateIndex
CREATE INDEX "idx_chat_sessions_claim_id" ON "chat_sessions"("claim_id");

-- CreateIndex
CREATE INDEX "idx_chat_sessions_user_id" ON "chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_chat_sessions_claim_user" ON "chat_sessions"("claim_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_chat_messages_session_id" ON "chat_messages"("session_id");

-- CreateIndex
CREATE INDEX "idx_chat_messages_session_created" ON "chat_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_chat_messages_upl_zone" ON "chat_messages"("upl_zone");

-- CreateIndex
CREATE INDEX "idx_regulatory_deadlines_claim_id" ON "regulatory_deadlines"("claim_id");

-- CreateIndex
CREATE INDEX "idx_regulatory_deadlines_due_date" ON "regulatory_deadlines"("due_date");

-- CreateIndex
CREATE INDEX "idx_regulatory_deadlines_status" ON "regulatory_deadlines"("status");

-- CreateIndex
CREATE INDEX "idx_regulatory_deadlines_claim_status" ON "regulatory_deadlines"("claim_id", "status");

-- CreateIndex
CREATE INDEX "idx_regulatory_deadlines_status_due" ON "regulatory_deadlines"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_deadlines_claim_id_deadline_type_key" ON "regulatory_deadlines"("claim_id", "deadline_type");

-- CreateIndex
CREATE INDEX "idx_investigation_items_claim_id" ON "investigation_items"("claim_id");

-- CreateIndex
CREATE INDEX "idx_investigation_items_is_complete" ON "investigation_items"("is_complete");

-- CreateIndex
CREATE INDEX "idx_investigation_items_claim_complete" ON "investigation_items"("claim_id", "is_complete");

-- CreateIndex
CREATE INDEX "idx_investigation_items_completed_by_id" ON "investigation_items"("completed_by_id");

-- CreateIndex
CREATE INDEX "idx_investigation_items_document_id" ON "investigation_items"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "investigation_items_claim_id_item_type_key" ON "investigation_items"("claim_id", "item_type");

-- CreateIndex
CREATE INDEX "idx_benefit_payments_claim_id" ON "benefit_payments"("claim_id");

-- CreateIndex
CREATE INDEX "idx_benefit_payments_payment_type" ON "benefit_payments"("payment_type");

-- CreateIndex
CREATE INDEX "idx_benefit_payments_payment_date" ON "benefit_payments"("payment_date");

-- CreateIndex
CREATE INDEX "idx_benefit_payments_claim_type" ON "benefit_payments"("claim_id", "payment_type");

-- CreateIndex
CREATE INDEX "idx_benefit_payments_is_late" ON "benefit_payments"("is_late");

-- CreateIndex
CREATE UNIQUE INDEX "education_profiles_user_id_key" ON "education_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_workflow_progress_claim_id" ON "workflow_progress"("claim_id");

-- CreateIndex
CREATE INDEX "idx_workflow_progress_user_id" ON "workflow_progress"("user_id");

-- CreateIndex
CREATE INDEX "idx_workflow_progress_claim_user" ON "workflow_progress"("claim_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_progress_claim_id_user_id_workflow_id_key" ON "workflow_progress"("claim_id", "user_id", "workflow_id");

-- CreateIndex
CREATE INDEX "idx_audit_events_claim_id" ON "audit_events"("claim_id");

-- CreateIndex
CREATE INDEX "idx_audit_events_user_id" ON "audit_events"("user_id");

-- CreateIndex
CREATE INDEX "idx_audit_events_event_type" ON "audit_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_audit_events_created_at" ON "audit_events"("created_at");

-- CreateIndex
CREATE INDEX "idx_audit_events_claim_event_type" ON "audit_events"("claim_id", "event_type");

-- CreateIndex
CREATE INDEX "idx_audit_events_user_event_type" ON "audit_events"("user_id", "event_type");

-- CreateIndex
CREATE INDEX "idx_audit_events_upl_zone" ON "audit_events"("upl_zone");

-- CreateIndex
CREATE INDEX "idx_generated_letters_claim_type" ON "generated_letters"("claim_id", "letter_type");

-- CreateIndex
CREATE INDEX "idx_generated_letters_user_id" ON "generated_letters"("user_id");

-- CreateIndex
CREATE INDEX "idx_counsel_referrals_claim_status" ON "counsel_referrals"("claim_id", "status");

-- CreateIndex
CREATE INDEX "idx_counsel_referrals_user_id" ON "counsel_referrals"("user_id");

-- CreateIndex
CREATE INDEX "idx_liens_claim_status" ON "liens"("claim_id", "status");

-- CreateIndex
CREATE INDEX "idx_liens_lien_type" ON "liens"("lien_type");

-- CreateIndex
CREATE INDEX "idx_liens_status" ON "liens"("status");

-- CreateIndex
CREATE INDEX "idx_lien_line_items_lien_id" ON "lien_line_items"("lien_id");

-- CreateIndex
CREATE INDEX "idx_lien_line_items_cpt_code" ON "lien_line_items"("cpt_code");

-- CreateIndex
CREATE INDEX "idx_lien_line_items_body_part_id" ON "lien_line_items"("body_part_id");

-- CreateIndex
CREATE INDEX "idx_claim_body_parts_claim_id" ON "claim_body_parts"("claim_id");

-- CreateIndex
CREATE INDEX "idx_claim_body_parts_claim_status" ON "claim_body_parts"("claim_id", "status");

-- CreateIndex
CREATE INDEX "idx_coverage_determinations_claim_id" ON "coverage_determinations"("claim_id");

-- CreateIndex
CREATE INDEX "idx_coverage_determinations_body_part_id" ON "coverage_determinations"("body_part_id");

-- CreateIndex
CREATE INDEX "idx_coverage_determinations_claim_date" ON "coverage_determinations"("claim_id", "determination_date");

-- CreateIndex
CREATE INDEX "idx_medical_payments_claim_id" ON "medical_payments"("claim_id");

-- CreateIndex
CREATE INDEX "idx_medical_payments_claim_date" ON "medical_payments"("claim_id", "payment_date");

-- CreateIndex
CREATE INDEX "idx_medical_payments_body_part_id" ON "medical_payments"("body_part_id");

-- CreateIndex
CREATE INDEX "idx_medical_payments_lien_id" ON "medical_payments"("lien_id");

-- CreateIndex
CREATE INDEX "idx_medical_payments_provider" ON "medical_payments"("provider_name");

-- CreateIndex
CREATE INDEX "idx_graph_nodes_claim_type" ON "graph_nodes"("claim_id", "node_type");

-- CreateIndex
CREATE INDEX "idx_graph_nodes_claim_name" ON "graph_nodes"("claim_id", "canonical_name");

-- CreateIndex
CREATE INDEX "idx_graph_nodes_type" ON "graph_nodes"("node_type");

-- CreateIndex
CREATE INDEX "idx_graph_nodes_canonical_id" ON "graph_nodes"("canonical_id");

-- CreateIndex
CREATE INDEX "idx_graph_edges_claim_type" ON "graph_edges"("claim_id", "edge_type");

-- CreateIndex
CREATE INDEX "idx_graph_edges_source" ON "graph_edges"("source_node_id");

-- CreateIndex
CREATE INDEX "idx_graph_edges_target" ON "graph_edges"("target_node_id");

-- CreateIndex
CREATE INDEX "idx_graph_edges_claim_weight" ON "graph_edges"("claim_id", "weight");

-- CreateIndex
CREATE INDEX "idx_graph_edges_contradiction" ON "graph_edges"("contradiction_status");

-- CreateIndex
CREATE INDEX "idx_graph_edges_traversal" ON "graph_edges"("claim_id", "traversal_count", "last_traversed_at");

-- CreateIndex
CREATE INDEX "idx_graph_summaries_claim" ON "graph_summaries"("claim_id");

-- CreateIndex
CREATE UNIQUE INDEX "graph_maturity_claim_id_key" ON "graph_maturity"("claim_id");

-- CreateIndex
CREATE INDEX "idx_graph_status_changes_claim" ON "graph_status_changes"("claim_id");

-- CreateIndex
CREATE INDEX "idx_graph_status_changes_node" ON "graph_status_changes"("node_id");

-- CreateIndex
CREATE INDEX "idx_graph_status_changes_edge" ON "graph_status_changes"("edge_id");

-- CreateIndex
CREATE INDEX "idx_graph_query_signals_claim" ON "graph_query_signals"("claim_id");

-- CreateIndex
CREATE INDEX "idx_graph_query_signals_query_type" ON "graph_query_signals"("query_type");

-- CreateIndex
CREATE INDEX "idx_graph_query_signals_pattern" ON "graph_query_signals"("pattern");

-- CreateIndex
CREATE INDEX "idx_graph_query_signals_created_at" ON "graph_query_signals"("created_at");

-- CreateIndex
CREATE INDEX "idx_graph_entity_merges_claim" ON "graph_entity_merges"("claim_id");

-- CreateIndex
CREATE INDEX "idx_graph_entity_merges_survivor" ON "graph_entity_merges"("survivor_node_id");

-- CreateIndex
CREATE INDEX "idx_graph_entity_merges_merged" ON "graph_entity_merges"("merged_node_id");

-- CreateIndex
CREATE INDEX "idx_graph_routing_scope_pattern" ON "graph_routing_memory"("scope", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "uq_routing_claim_scope_pattern" ON "graph_routing_memory"("claim_id", "scope", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "uq_routing_org_scope_pattern" ON "graph_routing_memory"("organization_id", "scope", "pattern");

-- CreateIndex
CREATE INDEX "idx_claim_facts_claim_key" ON "claim_facts"("claim_id", "key");

-- CreateIndex
CREATE INDEX "idx_fact_citations_fact_id" ON "fact_citations"("fact_id");

-- CreateIndex
CREATE INDEX "idx_fact_citations_chunk_id" ON "fact_citations"("document_chunk_id");

-- CreateIndex
CREATE INDEX "idx_chat_citations_message_id" ON "chat_citations"("message_id");

-- CreateIndex
CREATE INDEX "idx_chat_citations_document_id" ON "chat_citations"("document_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_assigned_examiner_id_fkey" FOREIGN KEY ("assigned_examiner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_parent_chunk_id_fkey" FOREIGN KEY ("parent_chunk_id") REFERENCES "document_chunks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_deadlines" ADD CONSTRAINT "regulatory_deadlines_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_items" ADD CONSTRAINT "investigation_items_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_items" ADD CONSTRAINT "investigation_items_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_items" ADD CONSTRAINT "investigation_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_payments" ADD CONSTRAINT "benefit_payments_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_profiles" ADD CONSTRAINT "education_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_progress" ADD CONSTRAINT "workflow_progress_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_progress" ADD CONSTRAINT "workflow_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_letters" ADD CONSTRAINT "generated_letters_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_letters" ADD CONSTRAINT "generated_letters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counsel_referrals" ADD CONSTRAINT "counsel_referrals_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counsel_referrals" ADD CONSTRAINT "counsel_referrals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liens" ADD CONSTRAINT "liens_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lien_line_items" ADD CONSTRAINT "lien_line_items_lien_id_fkey" FOREIGN KEY ("lien_id") REFERENCES "liens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lien_line_items" ADD CONSTRAINT "lien_line_items_body_part_id_fkey" FOREIGN KEY ("body_part_id") REFERENCES "claim_body_parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_body_parts" ADD CONSTRAINT "claim_body_parts_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_determinations" ADD CONSTRAINT "coverage_determinations_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_determinations" ADD CONSTRAINT "coverage_determinations_body_part_id_fkey" FOREIGN KEY ("body_part_id") REFERENCES "claim_body_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_determinations" ADD CONSTRAINT "coverage_determinations_determined_by_id_fkey" FOREIGN KEY ("determined_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_determinations" ADD CONSTRAINT "coverage_determinations_counsel_referral_id_fkey" FOREIGN KEY ("counsel_referral_id") REFERENCES "counsel_referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_payments" ADD CONSTRAINT "medical_payments_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_payments" ADD CONSTRAINT "medical_payments_body_part_id_fkey" FOREIGN KEY ("body_part_id") REFERENCES "claim_body_parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_payments" ADD CONSTRAINT "medical_payments_lien_id_fkey" FOREIGN KEY ("lien_id") REFERENCES "liens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_canonical_id_fkey" FOREIGN KEY ("canonical_id") REFERENCES "graph_nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "graph_nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "graph_nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "graph_summaries" ADD CONSTRAINT "graph_summaries_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_maturity" ADD CONSTRAINT "graph_maturity_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_status_changes" ADD CONSTRAINT "graph_status_changes_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_status_changes" ADD CONSTRAINT "graph_status_changes_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_status_changes" ADD CONSTRAINT "graph_status_changes_edge_id_fkey" FOREIGN KEY ("edge_id") REFERENCES "graph_edges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_query_signals" ADD CONSTRAINT "graph_query_signals_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_entity_merges" ADD CONSTRAINT "graph_entity_merges_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_entity_merges" ADD CONSTRAINT "graph_entity_merges_survivor_node_id_fkey" FOREIGN KEY ("survivor_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_entity_merges" ADD CONSTRAINT "graph_entity_merges_merged_node_id_fkey" FOREIGN KEY ("merged_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_routing_memory" ADD CONSTRAINT "graph_routing_memory_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_routing_memory" ADD CONSTRAINT "graph_routing_memory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_facts" ADD CONSTRAINT "claim_facts_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_citations" ADD CONSTRAINT "fact_citations_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "claim_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_citations" ADD CONSTRAINT "fact_citations_document_chunk_id_fkey" FOREIGN KEY ("document_chunk_id") REFERENCES "document_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_citations" ADD CONSTRAINT "chat_citations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_citations" ADD CONSTRAINT "chat_citations_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "document_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_citations" ADD CONSTRAINT "chat_citations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
