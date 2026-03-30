import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Referral {
  id: string;
  claimId: string;
  reason: string;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  status: 'PENDING' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED';
  notes?: string;
  referredBy: string;
  referredAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  counselName?: string;
  counselFirm?: string;
  uplClassification?: string;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useClaimReferrals(claimId: string) {
  return useQuery<Referral[]>({
    queryKey: ['referrals', 'claim', claimId],
    queryFn: () => apiFetch<Referral[]>(`/claims/${claimId}/referrals`),
    enabled: Boolean(claimId),
  });
}

export function useCreateReferral(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      reason: string;
      urgency: Referral['urgency'];
      notes?: string;
      uplClassification?: string;
    }) =>
      apiFetch<Referral>('/referrals', {
        method: 'POST',
        body: JSON.stringify({ claimId, ...payload }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['referrals', 'claim', claimId] });
    },
  });
}
