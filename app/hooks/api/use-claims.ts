import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Claim {
  id: string;
  claimNumber: string;
  claimantName: string;
  dateOfInjury: string;
  status: string;
  nextDeadline?: string;
  nextDeadlineUrgency?: 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'UPCOMING' | 'ON_TRACK';
  daysOpen: number;
  employer?: string;
  examiner?: string;
  carrier?: string;
  policyNumber?: string;
  jurisdiction?: string;
  bodyParts?: string[];
  graphMaturity?: 'SEED' | 'GROWING' | 'MATURE' | 'COMPLETE';
  reserves?: {
    temporaryDisability: number;
    medicalServices: number;
    legalExpenses: number;
    totalIncurred: number;
  };
  entities?: ClaimEntity[];
  createdAt: string;
  updatedAt: string;
}

export interface ClaimEntity {
  id: string;
  role: string;
  name: string;
  detail?: string;
  icon: string;
  colorClass: string;
}

interface ClaimsResponse {
  data: Claim[];
  total: number;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useClaims(params?: { take?: number; skip?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.take) searchParams.set('take', String(params.take));
  if (params?.skip) searchParams.set('skip', String(params.skip));
  const qs = searchParams.toString();

  return useQuery<ClaimsResponse>({
    queryKey: ['claims', params],
    queryFn: () => apiFetch<ClaimsResponse>(`/claims${qs ? `?${qs}` : ''}`),
  });
}

export function useClaim(claimId: string) {
  return useQuery<Claim>({
    queryKey: ['claims', claimId],
    queryFn: () => apiFetch<Claim>(`/claims/${claimId}`),
    enabled: Boolean(claimId),
  });
}

export function useCreateClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Claim>) =>
      apiFetch<Claim>('/claims', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}

export function useUpdateClaim(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Claim>) =>
      apiFetch<Claim>(`/claims/${claimId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}
