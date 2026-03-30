import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ClaimBodyPart {
  id: string;
  claimId: string;
  bodyPartName: string;
  icdCode: string | null;
  status: 'PENDING' | 'ADMITTED' | 'DENIED' | 'UNDER_INVESTIGATION';
  statusChangedAt: string | null;
}

export interface CoverageDetermination {
  id: string;
  bodyPartId: string;
  previousStatus: string | null;
  newStatus: string;
  determinationDate: string;
  basis: string;
  notes: string | null;
  determinedBy: { id: string; name: string };
  bodyPart: { bodyPartName: string };
  counselReferral: {
    legalIssue: string;
    counselResponse: string | null;
    respondedAt: string | null;
  } | null;
  createdAt: string;
}

export interface CoverageSummary {
  counts: {
    admitted: number;
    denied: number;
    pending: number;
    underInvestigation: number;
    total: number;
  };
  bodyParts: {
    admitted: { id: string; name: string; icdCode: string | null; statusChangedAt: string | null }[];
    denied: { id: string; name: string; icdCode: string | null; statusChangedAt: string | null }[];
    pending: { id: string; name: string; icdCode: string | null; statusChangedAt: string | null }[];
    underInvestigation: { id: string; name: string; icdCode: string | null; statusChangedAt: string | null }[];
  };
  counselAdvice: {
    bodyPartName: string;
    legalIssue: string;
    counselResponse: string;
    respondedAt: string | null;
  }[];
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useClaimBodyParts(claimId: string) {
  return useQuery({
    queryKey: ['body-parts', claimId],
    queryFn: () => apiFetch<ClaimBodyPart[]>(`/claims/${claimId}/body-parts`),
    enabled: !!claimId,
  });
}

export function useCoverageSummary(claimId: string) {
  return useQuery({
    queryKey: ['coverage-summary', claimId],
    queryFn: () => apiFetch<CoverageSummary>(`/claims/${claimId}/coverage-summary`),
    enabled: !!claimId,
  });
}

export function useDeterminationHistory(claimId: string) {
  return useQuery({
    queryKey: ['coverage-determinations', claimId],
    queryFn: () => apiFetch<CoverageDetermination[]>(`/claims/${claimId}/coverage-determinations`),
    enabled: !!claimId,
  });
}

export function useAddBodyPart(claimId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { bodyPartName: string; icdCode?: string }) =>
      apiFetch(`/claims/${claimId}/body-parts`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['body-parts', claimId] });
      void qc.invalidateQueries({ queryKey: ['coverage-summary', claimId] });
    },
  });
}

export function useRecordDetermination(claimId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      bodyPartId: string;
      newStatus: string;
      determinationDate: string;
      basis: string;
      counselReferralId?: string;
      notes?: string;
    }) =>
      apiFetch(`/claims/${claimId}/coverage-determinations`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['body-parts', claimId] });
      void qc.invalidateQueries({ queryKey: ['coverage-summary', claimId] });
      void qc.invalidateQueries({ queryKey: ['coverage-determinations', claimId] });
    },
  });
}
