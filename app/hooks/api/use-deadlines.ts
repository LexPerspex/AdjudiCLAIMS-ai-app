import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Deadline {
  id: string;
  claimId: string;
  claimNumber: string;
  title: string;
  dueDate: string;
  urgency: 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'UPCOMING' | 'ON_TRACK';
  status: 'PENDING' | 'COMPLETED' | 'MISSED';
  statutoryCitation?: string;
}

export interface DeadlineSummary {
  overdue: number;
  dueToday: number;
  dueSoon: number;
  upcoming: Deadline[];
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useClaimDeadlines(claimId: string) {
  return useQuery<Deadline[]>({
    queryKey: ['deadlines', 'claim', claimId],
    queryFn: () => apiFetch<Deadline[]>(`/claims/${claimId}/deadlines`),
    enabled: Boolean(claimId),
  });
}

export function useAllDeadlines(params?: { urgency?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.urgency) searchParams.set('urgency', params.urgency);
  const qs = searchParams.toString();

  return useQuery<DeadlineSummary>({
    queryKey: ['deadlines', params],
    queryFn: () => apiFetch<DeadlineSummary>(`/deadlines${qs ? `?${qs}` : ''}`),
  });
}
