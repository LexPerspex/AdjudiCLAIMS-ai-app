import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface InvestigationItem {
  id: string;
  claimId: string;
  description: string;
  category: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
  required: boolean;
  sortOrder: number;
}

export interface InvestigationChecklist {
  items: InvestigationItem[];
  totalItems: number;
  completedItems: number;
  percentComplete: number;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useClaimInvestigation(claimId: string) {
  return useQuery<InvestigationChecklist>({
    queryKey: ['investigation', 'claim', claimId],
    queryFn: () => apiFetch<InvestigationChecklist>(`/claims/${claimId}/investigation`),
    enabled: Boolean(claimId),
  });
}

export function useUpdateInvestigationItem(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      apiFetch<InvestigationItem>(`/investigation/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['investigation', 'claim', claimId] });
    },
  });
}
