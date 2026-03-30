import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface WorkflowStep {
  id: string;
  workflowId: string;
  stepNumber: number;
  title: string;
  description: string;
  authorityReference?: string;
  complianceNote?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  completedAt?: string;
  completedBy?: string;
  skippable: boolean;
  skipReason?: string;
}

export interface Workflow {
  id: string;
  claimId: string;
  name: string;
  description: string;
  category: string;
  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
  totalSteps: number;
  completedSteps: number;
  percentComplete: number;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useClaimWorkflows(claimId: string) {
  return useQuery<Workflow[]>({
    queryKey: ['workflows', 'claim', claimId],
    queryFn: () => apiFetch<Workflow[]>(`/claims/${claimId}/workflows`),
    enabled: Boolean(claimId),
  });
}

export function useUpdateWorkflowStep(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      stepId,
      status,
      skipReason,
    }: {
      workflowId: string;
      stepId: string;
      status: WorkflowStep['status'];
      skipReason?: string;
    }) =>
      apiFetch<WorkflowStep>(`/workflows/${workflowId}/steps/${stepId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, skipReason }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflows', 'claim', claimId] });
    },
  });
}
