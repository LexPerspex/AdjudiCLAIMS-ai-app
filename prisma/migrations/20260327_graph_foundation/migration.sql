-- Graph RAG Foundation: 6 models + 6 enums for neurosymbolic per-claim knowledge graphs.
-- All tables claim-scoped. Edges support neuro-plastic weights and contradiction tracking.

-- GraphNode: per-claim entities (13 types)
CREATE TABLE `graph_nodes` (
  `id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `node_type` ENUM('PERSON','ORGANIZATION','BODY_PART','CLAIM','DOCUMENT','PROCEEDING','LEGAL_ISSUE','LIEN','SETTLEMENT','TREATMENT','MEDICATION','RATING','BENEFIT') NOT NULL,
  `canonical_name` VARCHAR(500) NOT NULL,
  `aliases` JSON NOT NULL DEFAULT ('[]'),
  `properties` JSON NOT NULL DEFAULT ('{}'),
  `person_role` ENUM('APPLICANT','APPLICANT_ATTORNEY','DEFENSE_ATTORNEY','DEFENDANT','EMPLOYER_REP','CLAIMS_EXAMINER','CLAIMS_SUPERVISOR','TREATING_PHYSICIAN','QME','AME','IME','SURGEON','RADIOLOGIST','PSYCHIATRIST','PSYCHOLOGIST','CHIROPRACTOR','PHYSICAL_THERAPIST','PHARMACIST','VOCATIONAL_EXPERT','ECONOMIST','LIFE_CARE_PLANNER','INVESTIGATOR','WCAB_JUDGE','LIEN_CLAIMANT','WITNESS','GUARDIAN','INTERPRETER','NURSE_CASE_MANAGER') NULL,
  `org_type` ENUM('EMPLOYER','CARRIER','TPA_ORG','MEDICAL_FACILITY','PHARMACY','LAW_FIRM','LIEN_CLAIMANT_ORG','VOCATIONAL_REHAB','WCAB','DEU','DWC','RECORD_COPY_SERVICE','BILLING_REVIEW') NULL,
  `source_document_ids` JSON NOT NULL DEFAULT ('[]'),
  `confidence` DOUBLE NOT NULL DEFAULT 0,
  `embedding_model` VARCHAR(191) NULL,
  `human_verified` BOOLEAN NOT NULL DEFAULT false,
  `human_verified_by` VARCHAR(191) NULL,
  `locked` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `idx_graph_nodes_claim_type` ON `graph_nodes`(`claim_id`, `node_type`);
CREATE INDEX `idx_graph_nodes_claim_name` ON `graph_nodes`(`claim_id`, `canonical_name`(191));
CREATE INDEX `idx_graph_nodes_type` ON `graph_nodes`(`node_type`);

-- GraphEdge: per-claim relationships (35 types) with neuro-plastic properties
CREATE TABLE `graph_edges` (
  `id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `edge_type` ENUM('ESTABLISHES','MENTIONS','AMENDS','SUPERSEDES','RESPONDS_TO','REPRESENTS','EMPLOYED_BY','AFFILIATED_WITH','DEPENDENT_OF','TREATS','EVALUATES','DIAGNOSES','INJURED','PRESCRIBED','PERFORMED','REVIEWS_UR','REVIEWS_IMR','REFERS','FILES','ADJUDICATES','DECIDES','ORDERS','AWARDS','PERTAINS_TO','APPEALS','CITES_STATUTE','PAYS','FILES_LIEN','SETTLES_LIEN','DENIES','INSURES','RATES','APPORTIONS','OFFERS_WORK','SENDS') NOT NULL,
  `source_node_id` VARCHAR(191) NOT NULL,
  `target_node_id` VARCHAR(191) NOT NULL,
  `properties` JSON NOT NULL DEFAULT ('{}'),
  `source_document_ids` JSON NOT NULL DEFAULT ('[]'),
  `source_chunk_ids` JSON NOT NULL DEFAULT ('[]'),
  `confidence` DOUBLE NOT NULL DEFAULT 0,
  `source_confidences` JSON NOT NULL DEFAULT ('[]'),
  `weight` DOUBLE NOT NULL DEFAULT 1.0,
  `traversal_count` INTEGER NOT NULL DEFAULT 0,
  `last_traversed_at` DATETIME(3) NULL,
  `contradiction_status` ENUM('NONE','UNRESOLVED','HUMAN_CONFIRMED','HUMAN_REJECTED','AUTO_RESOLVED') NOT NULL DEFAULT 'NONE',
  `contradicted_by_edge_ids` JSON NOT NULL DEFAULT ('[]'),
  `contradiction_type` VARCHAR(191) NULL,
  `human_verified` BOOLEAN NOT NULL DEFAULT false,
  `human_verified_by` VARCHAR(191) NULL,
  `locked` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `idx_graph_edges_claim_type` ON `graph_edges`(`claim_id`, `edge_type`);
CREATE INDEX `idx_graph_edges_source` ON `graph_edges`(`source_node_id`);
CREATE INDEX `idx_graph_edges_target` ON `graph_edges`(`target_node_id`);
CREATE INDEX `idx_graph_edges_claim_weight` ON `graph_edges`(`claim_id`, `weight`);
CREATE INDEX `idx_graph_edges_contradiction` ON `graph_edges`(`contradiction_status`);

-- GraphSummary: subgraph natural language summaries
CREATE TABLE `graph_summaries` (
  `id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `node_ids` JSON NOT NULL DEFAULT ('[]'),
  `edge_ids` JSON NOT NULL DEFAULT ('[]'),
  `summary` TEXT NOT NULL,
  `is_valid` BOOLEAN NOT NULL DEFAULT true,
  `embedding_model` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `idx_graph_summaries_claim` ON `graph_summaries`(`claim_id`);

-- GraphMaturity: per-claim enrichment completeness (5 examiner facets)
CREATE TABLE `graph_maturity` (
  `id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `overall_score` DOUBLE NOT NULL DEFAULT 0,
  `medical_score` DOUBLE NOT NULL DEFAULT 0,
  `insurance_benefit_score` DOUBLE NOT NULL DEFAULT 0,
  `employment_score` DOUBLE NOT NULL DEFAULT 0,
  `regulatory_score` DOUBLE NOT NULL DEFAULT 0,
  `evidential_score` DOUBLE NOT NULL DEFAULT 0,
  `maturity_label` ENUM('NASCENT','GROWING','MATURE','COMPLETE') NOT NULL DEFAULT 'NASCENT',
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `graph_maturity_claim_id_key`(`claim_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- GraphStatusChange: property change audit trail
CREATE TABLE `graph_status_changes` (
  `id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `target_node_id` VARCHAR(191) NOT NULL,
  `field` VARCHAR(191) NOT NULL,
  `old_value` TEXT NULL,
  `new_value` TEXT NULL,
  `effective_date` DATETIME(3) NULL,
  `document_id` VARCHAR(191) NULL,
  `confidence` DOUBLE NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `idx_graph_status_changes_claim` ON `graph_status_changes`(`claim_id`);
CREATE INDEX `idx_graph_status_changes_node` ON `graph_status_changes`(`target_node_id`);

-- GraphQuerySignal: cognitive router telemetry
CREATE TABLE `graph_query_signals` (
  `id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `query_text` TEXT NOT NULL,
  `query_pattern` VARCHAR(191) NULL,
  `observe_snapshot` JSON NULL,
  `tier_selected` VARCHAR(191) NULL,
  `tier_used` VARCHAR(191) NULL,
  `escalated` BOOLEAN NOT NULL DEFAULT false,
  `isc_drift_score` DOUBLE NULL,
  `succeeded` BOOLEAN NULL,
  `latency_ms` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `idx_graph_query_signals_claim` ON `graph_query_signals`(`claim_id`);
CREATE INDEX `idx_graph_query_signals_pattern` ON `graph_query_signals`(`query_pattern`);
