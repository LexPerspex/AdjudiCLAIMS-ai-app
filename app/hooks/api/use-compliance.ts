import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ComplianceMetrics {
  overallScore: number;
  trend: number; // percentage change from last period
  deadlineAdherence: number;
  trainingCompletion: number;
  uplCompliance: number;
  monthlyReviewDue: boolean;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useComplianceMetrics() {
  return useQuery<ComplianceMetrics>({
    queryKey: ['compliance', 'examiner'],
    queryFn: () => apiFetch<ComplianceMetrics>('/compliance/examiner'),
  });
}
