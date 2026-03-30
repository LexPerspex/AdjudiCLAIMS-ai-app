import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TimelineEvent {
  id: string;
  claimId: string;
  eventType:
    | 'CLAIM_CREATED'
    | 'DOCUMENT_UPLOADED'
    | 'DEADLINE_MET'
    | 'DEADLINE_MISSED'
    | 'STATUS_CHANGED'
    | 'NOTE_ADDED'
    | 'PAYMENT_ISSUED'
    | 'REFERRAL_MADE'
    | 'LETTER_SENT'
    | 'EXAMINATION_SCHEDULED'
    | 'EXAMINATION_COMPLETED'
    | 'INVESTIGATION_UPDATED';
  description: string;
  actor?: string;
  actorRole?: string;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useClaimTimeline(
  claimId: string,
  params?: { eventType?: string; from?: string; to?: string },
) {
  const searchParams = new URLSearchParams();
  if (params?.eventType) searchParams.set('eventType', params.eventType);
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  const qs = searchParams.toString();

  return useQuery<TimelineEvent[]>({
    queryKey: ['timeline', 'claim', claimId, params],
    queryFn: () => apiFetch<TimelineEvent[]>(`/claims/${claimId}/timeline${qs ? `?${qs}` : ''}`),
    enabled: Boolean(claimId),
  });
}
