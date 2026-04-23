import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types — aligned with backend (server/routes/referrals.ts)          */
/* ------------------------------------------------------------------ */

/**
 * Counsel referral lifecycle status.
 *
 * Valid transitions (enforced server-side):
 *   PENDING → SENT | CLOSED
 *   SENT → RESPONDED | CLOSED
 *   RESPONDED → CLOSED
 *   CLOSED → (terminal)
 */
export type ReferralStatus = 'PENDING' | 'SENT' | 'RESPONDED' | 'CLOSED';

/**
 * Counsel referral record as returned by the backend.
 *
 * Field names mirror the Prisma `CounselReferral` model.
 */
export interface Referral {
  id: string;
  claimId: string;
  userId: string;
  legalIssue: string;
  summary: string;
  status: ReferralStatus;
  counselEmail: string | null;
  counselResponse: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReferralsListResponse {
  referrals: Referral[];
}

interface ReferralResponse {
  referral: Referral;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Fetch all counsel referrals for a claim, newest-first.
 */
export function useClaimReferrals(claimId: string) {
  return useQuery<Referral[]>({
    queryKey: ['referrals', 'claim', claimId],
    queryFn: async () => {
      const data = await apiFetch<ReferralsListResponse>(
        `/claims/${claimId}/referrals`,
      );
      return data.referrals;
    },
    enabled: Boolean(claimId),
  });
}

/**
 * Create a new counsel referral. The backend generates a UPL-validated
 * factual summary and persists the record with status PENDING.
 */
export function useCreateReferral(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { legalIssue: string }) => {
      const data = await apiFetch<ReferralResponse>(
        `/claims/${claimId}/referrals`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      return data.referral;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['referrals', 'claim', claimId] });
    },
  });
}

/**
 * Update a referral's status. The backend enforces valid transitions and,
 * when transitioning to SENT with a counsel email, fires an email
 * notification (CC'd to the requesting examiner) as a side effect.
 */
export function useUpdateReferralStatus(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      referralId: string;
      status: ReferralStatus;
      counselEmail?: string;
      counselResponse?: string;
    }) => {
      const { referralId, ...body } = payload;
      const data = await apiFetch<ReferralResponse>(
        `/referrals/${referralId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
      );
      return data.referral;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['referrals', 'claim', claimId] });
    },
  });
}
