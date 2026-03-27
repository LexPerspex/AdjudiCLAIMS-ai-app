import { describe, it, expect } from 'vitest';
import { mapClassifierResult } from '../../server/services/classifier-taxonomy-map.js';

describe('Classifier Taxonomy Map', () => {
  describe('subtype-level mapping', () => {
    it('maps DWC-1 claim form subtypes → DWC1_CLAIM_FORM', () => {
      const result = mapClassifierResult('OFFICIAL_FORMS', 'CLAIM_FORM_DWC1', '');
      expect(result.prismaDocumentType).toBe('DWC1_CLAIM_FORM');
    });

    it('maps QME report subtypes → AME_QME_REPORT', () => {
      for (const subtype of [
        'QME_REPORT_INITIAL',
        'QME_REPORT_SUPPLEMENTAL',
        'AME_REPORT',
        'IME_REPORT',
        'PSYCH_EVAL_REPORT_QME_AME',
      ]) {
        const result = mapClassifierResult('MEDICAL', subtype, '');
        expect(result.prismaDocumentType).toBe('AME_QME_REPORT');
      }
    });

    it('maps imaging subtypes → IMAGING_REPORT', () => {
      for (const subtype of [
        'DIAGNOSTICS_IMAGING',
        'DIAGNOSTICS_LAB_RESULTS',
        'DIAGNOSTICS',
      ]) {
        const result = mapClassifierResult('MEDICAL', subtype, '');
        expect(result.prismaDocumentType).toBe('IMAGING_REPORT');
      }
    });

    it('maps utilization review subtypes → UTILIZATION_REVIEW', () => {
      for (const subtype of [
        'UTILIZATION_REVIEW_DECISION_REGULAR',
        'UTILIZATION_REVIEW_DECISION',
        'MEDICAL_TREATMENT_AUTHORIZATION',
        'MEDICAL_TREATMENT_DENIAL_UR',
      ]) {
        const result = mapClassifierResult('MEDICAL', subtype, '');
        expect(result.prismaDocumentType).toBe('UTILIZATION_REVIEW');
      }
    });

    it('maps billing subtypes → BILLING_STATEMENT', () => {
      for (const subtype of [
        'BILLING_UB04',
        'BILLING_CMS_1500',
        'MEDICAL_BILL_INITIAL',
        'EXPLANATION_OF_REVIEW_EOR',
      ]) {
        const result = mapClassifierResult('MEDICAL', subtype, '');
        expect(result.prismaDocumentType).toBe('BILLING_STATEMENT');
      }
    });

    it('maps pharmacy subtype → PHARMACY_RECORD', () => {
      const result = mapClassifierResult('MEDICAL', 'PHARMACY_RECORDS', '');
      expect(result.prismaDocumentType).toBe('PHARMACY_RECORD');
    });

    it('maps deposition transcript → DEPOSITION_TRANSCRIPT', () => {
      const result = mapClassifierResult('DISCOVERY', 'DEPOSITION_TRANSCRIPT', '');
      expect(result.prismaDocumentType).toBe('DEPOSITION_TRANSCRIPT');
    });

    it('maps wage subtypes → WAGE_STATEMENT', () => {
      for (const subtype of [
        'WAGE_STATEMENTS_PRE_INJURY',
        'WAGE_STATEMENTS_POST_INJURY',
        'WAGE_STATEMENTS_EARNING_RECORDS',
        'TIMECARDS_SCHEDULES',
      ]) {
        const result = mapClassifierResult('EMPLOYMENT', subtype, '');
        expect(result.prismaDocumentType).toBe('WAGE_STATEMENT');
      }
    });

    it('maps settlement subtypes → SETTLEMENT_DOCUMENT', () => {
      for (const subtype of [
        'COMPROMISE_AND_RELEASE_STANDARD',
        'COMPROMISE_AND_RELEASE',
        'STIPULATIONS_WITH_REQUEST_FOR_AWARD',
        'SETTLEMENT_AGREEMENT_EXECUTED',
      ]) {
        const result = mapClassifierResult('ADMINISTRATIVE_COURT', subtype, '');
        expect(result.prismaDocumentType).toBe('SETTLEMENT_DOCUMENT');
      }
    });

    it('maps employer subtypes → EMPLOYER_REPORT', () => {
      for (const subtype of [
        'EMPLOYER_REPORT_INJURY',
        'EMPLOYER_REPORT',
        'JOB_DESCRIPTION_PRE_INJURY',
        'PERSONNEL_FILES',
      ]) {
        const result = mapClassifierResult(
          subtype.startsWith('EMPLOYER') ? 'OFFICIAL_FORMS' : 'EMPLOYMENT',
          subtype,
          '',
        );
        expect(result.prismaDocumentType).toBe('EMPLOYER_REPORT');
      }
    });

    it('maps benefit notice subtypes → BENEFIT_NOTICE', () => {
      for (const subtype of [
        'CLAIM_ACCEPTANCE_LETTER',
        'CLAIM_DENIAL_LETTER',
        'CLAIM_DELAY_NOTICE',
        'NOTICE_OF_BENEFITS',
      ]) {
        const result = mapClassifierResult('OFFICIAL_FORMS', subtype, '');
        expect(result.prismaDocumentType).toBe('BENEFIT_NOTICE');
      }
    });

    it('maps payment record subtypes → PAYMENT_RECORD', () => {
      for (const subtype of [
        'TD_PAYMENT_RECORD_ONGOING',
        'TD_PAYMENT_RECORD_RETROACTIVE',
        'PD_PAYMENT_RECORD_ADVANCE',
        'PD_PAYMENT_RECORD_ONGOING',
        'PD_PAYMENT_RECORD_FINAL',
        'PD_RATING_CONVERSION',
        'PD_RATING_CALCULATION_WORKSHEET',
        'EXPENSE_REIMBURSEMENT',
      ]) {
        const result = mapClassifierResult('RATING_RTW_AIDS', subtype, '');
        expect(result.prismaDocumentType).toBe('PAYMENT_RECORD');
      }
    });

    it('maps defense counsel subtypes → LEGAL_CORRESPONDENCE', () => {
      for (const subtype of [
        'DEFENSE_COUNSEL_LETTER',
        'DEFENSE_COUNSEL_LETTER_DEMAND',
        'DEMAND_LETTER_FORMAL',
      ]) {
        const result = mapClassifierResult('CORRESPONDENCE', subtype, '');
        expect(result.prismaDocumentType).toBe('LEGAL_CORRESPONDENCE');
      }
    });

    it('maps WCAB filing subtypes → WCAB_FILING', () => {
      for (const subtype of [
        'APPLICATION_FOR_ADJUDICATION_ORIGINAL',
        'APPLICATION_FOR_ADJUDICATION',
        'DECLARATION_OF_READINESS_REGULAR',
        'DECLARATION_OF_READINESS',
        'DOR_STATUS_MSC_EXPEDITED',
        'PETITION_RECONSIDERATION_FILED',
        'PETITION_REMOVAL_FILED',
        'PETITION_REOPENING',
        'PETITION_SERIOUS_WILLFUL',
        'ORDER_APPOINTING_QME_PANEL',
        'ORDER_ON_SANCTIONS',
        'ORDER_ON_LIEN',
        'ORDER_FINAL',
        'MINUTES_ORDERS_FINDINGS_AWARD',
        'ATTORNEY_FEE_DISCLOSURE',
      ]) {
        const result = mapClassifierResult('ADMINISTRATIVE_COURT', subtype, '');
        expect(result.prismaDocumentType).toBe('WCAB_FILING');
      }
    });

    it('maps lien subtypes → LIEN_CLAIM', () => {
      for (const subtype of [
        'LIEN_MEDICAL_PROVIDER',
        'LIEN_ATTORNEY_COSTS',
        'LIEN_HOSPITAL',
        'LIEN_PHARMACY',
        'LIEN_AMBULANCE_TRANSPORT',
        'LIEN_SELF_PROCUREMENT_MEDICAL',
        'LIEN_EDD_OVERPAYMENT',
        'LIEN_RESOLUTION',
        'LIEN_DISMISSAL',
      ]) {
        const result = mapClassifierResult('LIENS', subtype, '');
        expect(result.prismaDocumentType).toBe('LIEN_CLAIM');
      }
    });

    it('maps discovery request subtypes → DISCOVERY_REQUEST', () => {
      for (const subtype of [
        'SUBPOENA_SDT_ISSUED',
        'SUBPOENA_SDT_RECEIVED',
        'SUBPOENAED_RECORDS_MEDICAL',
        'SUBPOENAED_RECORDS_EMPLOYMENT',
        'DEPOSITION_NOTICE_APPLICANT',
        'DEPOSITION_NOTICE_DEFENDANT',
        'DEPOSITION_NOTICE_MEDICAL_WITNESS',
        'DEPOSITION_NOTICE',
      ]) {
        const result = mapClassifierResult('DISCOVERY', subtype, '');
        expect(result.prismaDocumentType).toBe('DISCOVERY_REQUEST');
      }
    });

    it('maps return-to-work subtypes → RETURN_TO_WORK', () => {
      for (const subtype of [
        'OFFER_OF_WORK_REGULAR_AD_10133_53',
        'OFFER_OF_WORK_MODIFIED_AD_10118',
        'SJDB_VOUCHER_6000',
        'SJDB_VOUCHER_8000',
        'SJDB_VOUCHER_10000',
      ]) {
        const result = mapClassifierResult('OFFICIAL_FORMS', subtype, '');
        expect(result.prismaDocumentType).toBe('RETURN_TO_WORK');
      }
      // Employment subtypes
      for (const subtype of [
        'WORK_RESTRICTIONS_POST_INJURY',
        'VOCATIONAL_EVALUATION_REPORT',
        'TRAINING_COMPLETION_CERTIFICATE',
      ]) {
        const result = mapClassifierResult('EMPLOYMENT', subtype, '');
        expect(result.prismaDocumentType).toBe('RETURN_TO_WORK');
      }
    });

    it('maps DWC official form subtypes → DWC_OFFICIAL_FORM', () => {
      for (const subtype of [
        'DEU_RATING_REQUEST_FORM',
        'QME_PANEL_REQUEST_FORM_105',
        'QME_PANEL_REQUEST_FORM_106',
        'FIRST_FILL_PHARMACY_FORM',
        'MPN_AUTHORIZATION',
        'DISTRICT_SPECIFIC_FORM',
      ]) {
        const result = mapClassifierResult('OFFICIAL_FORMS', subtype, '');
        expect(result.prismaDocumentType).toBe('DWC_OFFICIAL_FORM');
      }
    });

    it('maps work product subtypes → WORK_PRODUCT', () => {
      for (const subtype of [
        'TRIAL_BRIEF',
        'PRETRIAL_CONFERENCE_STATEMENT',
        'SETTLEMENT_VALUATION_MEMO',
        'CASE_ANALYSIS_MEMO',
      ]) {
        const result = mapClassifierResult('SUMMARIES_CHRONOLOGIES', subtype, '');
        expect(result.prismaDocumentType).toBe('WORK_PRODUCT');
      }
    });

    it('maps medical chronology subtypes → MEDICAL_CHRONOLOGY', () => {
      for (const subtype of [
        'MEDICAL_CHRONOLOGY_TIMELINE',
        'QME_AME_SUMMARY_WITH_ISSUE_LIST',
        'DEPOSITION_SUMMARY',
        'VOCATIONAL_EXPERT_REPORT',
        'ECONOMIST_REPORT',
        'LIFE_CARE_PLANNER_REPORT',
        'ACCIDENT_RECONSTRUCTIONIST_REPORT',
        'BIOMECHANICAL_EXPERT_REPORT',
      ]) {
        const result = mapClassifierResult('SUMMARIES_CHRONOLOGIES', subtype, '');
        expect(result.prismaDocumentType).toBe('MEDICAL_CHRONOLOGY');
      }
    });

    it('maps surveillance subtypes → INVESTIGATION_REPORT', () => {
      for (const subtype of [
        'INVESTIGATOR_REPORT',
        'WITNESS_STATEMENT',
        'SURVEILLANCE_VIDEO',
        'SOCIAL_MEDIA_EVIDENCE',
        'ACTIVITY_DIARY_SELF_REPORTED',
      ]) {
        const result = mapClassifierResult('SURVEILLANCE_INVESTIGATION', subtype, '');
        expect(result.prismaDocumentType).toBe('INVESTIGATION_REPORT');
      }
    });
  });

  describe('type-level fallback', () => {
    it('falls back to MEDICAL_REPORT for unknown MEDICAL subtypes', () => {
      const result = mapClassifierResult('MEDICAL', 'SOME_UNKNOWN_SUBTYPE', '');
      expect(result.prismaDocumentType).toBe('MEDICAL_REPORT');
    });

    it('falls back to CORRESPONDENCE for unknown CORRESPONDENCE subtypes', () => {
      const result = mapClassifierResult('CORRESPONDENCE', 'SOME_UNKNOWN', '');
      expect(result.prismaDocumentType).toBe('CORRESPONDENCE');
    });

    it('falls back to EMPLOYER_REPORT for unknown EMPLOYMENT subtypes', () => {
      const result = mapClassifierResult('EMPLOYMENT', 'SOME_UNKNOWN', '');
      expect(result.prismaDocumentType).toBe('EMPLOYER_REPORT');
    });

    it('falls back to LIEN_CLAIM for LIENS type', () => {
      const result = mapClassifierResult('LIENS', 'SOME_UNKNOWN', '');
      expect(result.prismaDocumentType).toBe('LIEN_CLAIM');
    });

    it('falls back to WCAB_FILING for ADMINISTRATIVE_COURT type', () => {
      const result = mapClassifierResult('ADMINISTRATIVE_COURT', 'SOME_UNKNOWN', '');
      expect(result.prismaDocumentType).toBe('WCAB_FILING');
    });

    it('falls back to DISCOVERY_REQUEST for DISCOVERY type', () => {
      const result = mapClassifierResult('DISCOVERY', 'SOME_UNKNOWN', '');
      expect(result.prismaDocumentType).toBe('DISCOVERY_REQUEST');
    });

    it('falls back to MEDICAL_CHRONOLOGY for SUMMARIES_CHRONOLOGIES type', () => {
      const result = mapClassifierResult('SUMMARIES_CHRONOLOGIES', 'SOME_UNKNOWN', '');
      expect(result.prismaDocumentType).toBe('MEDICAL_CHRONOLOGY');
    });

    it('falls back to PAYMENT_RECORD for RATING_RTW_AIDS type', () => {
      const result = mapClassifierResult('RATING_RTW_AIDS', 'SOME_UNKNOWN', '');
      expect(result.prismaDocumentType).toBe('PAYMENT_RECORD');
    });

    it('falls back to DWC_OFFICIAL_FORM for OFFICIAL_FORMS type', () => {
      const result = mapClassifierResult('OFFICIAL_FORMS', 'SOME_UNKNOWN', '');
      expect(result.prismaDocumentType).toBe('DWC_OFFICIAL_FORM');
    });

    it('falls back to INVESTIGATION_REPORT for SURVEILLANCE_INVESTIGATION', () => {
      const result = mapClassifierResult('SURVEILLANCE_INVESTIGATION', 'SOME_UNKNOWN', '');
      expect(result.prismaDocumentType).toBe('INVESTIGATION_REPORT');
    });

    it('returns OTHER when both type and subtype are null', () => {
      const result = mapClassifierResult(null, null, '');
      expect(result.prismaDocumentType).toBe('OTHER');
    });

    it('returns OTHER for unknown type', () => {
      const result = mapClassifierResult('UNKNOWN_TYPE', null, '');
      expect(result.prismaDocumentType).toBe('OTHER');
    });
  });

  describe('access level detection', () => {
    it('detects attorney-client privilege', () => {
      const result = mapClassifierResult(null, null, 'This is attorney-client privilege material.');
      expect(result.accessLevel).toBe('ATTORNEY_ONLY');
      expect(result.containsPrivileged).toBe(true);
    });

    it('detects legal analysis content', () => {
      const result = mapClassifierResult(null, null, 'Contains legal analysis of the liability exposure.');
      expect(result.accessLevel).toBe('ATTORNEY_ONLY');
      expect(result.containsLegalAnalysis).toBe(true);
    });

    it('detects work product indicators', () => {
      const result = mapClassifierResult(null, null, 'This is attorney work product — defense strategy memo.');
      expect(result.accessLevel).toBe('ATTORNEY_ONLY');
      expect(result.containsWorkProduct).toBe(true);
    });

    it('marks attorney-only subtypes', () => {
      const result = mapClassifierResult('DISCOVERY', 'DEPOSITION_TRANSCRIPT', 'Standard medical deposition.');
      expect(result.accessLevel).toBe('ATTORNEY_ONLY');
    });

    it('marks settlement subtypes as attorney-only', () => {
      const result = mapClassifierResult('ADMINISTRATIVE_COURT', 'SETTLEMENT_DEMAND_LETTER', 'Settlement demand.');
      expect(result.accessLevel).toBe('ATTORNEY_ONLY');
    });

    it('defaults to EXAMINER_ONLY for standard content', () => {
      const result = mapClassifierResult('MEDICAL', 'TREATING_PHYSICIAN_REPORT', 'Standard PR-2 report.');
      expect(result.accessLevel).toBe('EXAMINER_ONLY');
      expect(result.containsLegalAnalysis).toBe(false);
      expect(result.containsWorkProduct).toBe(false);
      expect(result.containsPrivileged).toBe(false);
    });

    it('combines subtype and text detection', () => {
      const result = mapClassifierResult(
        'ADMINISTRATIVE_COURT',
        'TRIAL_BRIEF',
        'Trial brief with legal strategy for settlement negotiations.',
      );
      expect(result.accessLevel).toBe('ATTORNEY_ONLY');
      // Both the subtype (TRIAL_BRIEF) and text pattern ('legal strategy') trigger
    });
  });
});
