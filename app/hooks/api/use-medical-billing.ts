import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MedicalOverview {
  medicalReserve: number;
  liensOutstanding: number;
  totalMedicalPaid: number;
  netExposure: number;
  omfsComparison: {
    totalBilled: number;
    totalAllowed: number;
    discrepancyAmount: number;
    discrepancyPercent: number;
    overchargeCount: number;
  };
  admittedBodyPartTotals: {
    admitted: number;
    denied: number;
    pending: number;
    unlinked: number;
  };
}

export interface MedicalPayment {
  id: string;
  claimId: string;
  provider: string;
  amount: number;
  paymentType: string;
  paymentDate: string;
  bodyPartId: string | null;
  bodyPartName: string | null;
  description: string | null;
  createdAt: string;
}

export interface ProviderSummary {
  providerName: string;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  lienCount: number;
}

export interface MedicalBillingEvent {
  id: string;
  eventType: 'LIEN_FILED' | 'PAYMENT' | 'STATUS_CHANGE' | 'OMFS_REVIEW';
  date: string;
  description: string;
  amount: number | null;
  provider: string | null;
  status: string | null;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useMedicalOverview(claimId: string) {
  return useQuery({
    queryKey: ['medical-overview', claimId],
    queryFn: () => apiFetch<MedicalOverview>(`/claims/${claimId}/medical-overview`),
    enabled: !!claimId,
  });
}

export function useMedicalPayments(claimId: string) {
  return useQuery({
    queryKey: ['medical-payments', claimId],
    queryFn: () => apiFetch<MedicalPayment[]>(`/claims/${claimId}/medical-payments`),
    enabled: !!claimId,
  });
}

export function useRecordMedicalPayment(claimId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      provider: string;
      amount: number;
      paymentType: string;
      paymentDate: string;
      bodyPartId?: string;
      description?: string;
    }) =>
      apiFetch(`/claims/${claimId}/medical-payments`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['medical-payments', claimId] });
      void qc.invalidateQueries({ queryKey: ['medical-overview', claimId] });
    },
  });
}

export function useProviderSummary(claimId: string) {
  return useQuery({
    queryKey: ['provider-summary', claimId],
    queryFn: () => apiFetch<ProviderSummary[]>(`/claims/${claimId}/provider-summary`),
    enabled: !!claimId,
  });
}
