import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LienLineItem {
  id: string;
  lienId: string;
  serviceDate: string;
  cptCode: string | null;
  description: string;
  amountClaimed: number;
  omfsRate: number | null;
  isOvercharge: boolean;
  overchargeAmount: number | null;
  bodyPartId: string | null;
}

export interface Lien {
  id: string;
  claimId: string;
  lienClaimant: string;
  lienType: string;
  status:
    | 'RECEIVED'
    | 'UNDER_REVIEW'
    | 'OMFS_COMPARED'
    | 'NEGOTIATING'
    | 'PAID_IN_FULL'
    | 'PAID_REDUCED'
    | 'DISPUTED'
    | 'WCAB_HEARING'
    | 'RESOLVED_BY_ORDER'
    | 'WITHDRAWN';
  totalAmountClaimed: number;
  totalOmfsAllowed: number | null;
  discrepancyAmount: number | null;
  filingDate: string;
  filingFeeStatus: string;
  resolvedAmount: number | null;
  resolvedAt: string | null;
  wcabCaseNumber: string | null;
  notes: string | null;
  lineItems?: LienLineItem[];
}

export interface LienExposure {
  exposure: number;
  summary: {
    totalClaimed: number;
    totalOmfsAllowed: number | null;
    totalResolved: number | null;
    openCount: number;
    resolvedCount: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useClaimLiens(claimId: string) {
  return useQuery<Lien[]>({
    queryKey: ['liens', 'claim', claimId],
    queryFn: () => apiFetch<Lien[]>(`/claims/${claimId}/liens`),
    enabled: Boolean(claimId),
  });
}

export function useClaimLienExposure(claimId: string) {
  return useQuery<LienExposure>({
    queryKey: ['lien-exposure', 'claim', claimId],
    queryFn: () => apiFetch<LienExposure>(`/claims/${claimId}/lien-exposure`),
    enabled: Boolean(claimId),
  });
}

export function useUpdateLien(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      lienId,
      status,
      resolvedAmount,
    }: {
      lienId: string;
      status?: Lien['status'];
      resolvedAmount?: number;
    }) =>
      apiFetch<Lien>(`/liens/${lienId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, resolvedAmount }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['liens', 'claim', claimId] });
      void queryClient.invalidateQueries({ queryKey: ['lien-exposure', 'claim', claimId] });
    },
  });
}
