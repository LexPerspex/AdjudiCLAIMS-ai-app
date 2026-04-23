import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/**
 * Training-sandbox hooks (AJC-19).
 *
 * Backed by /api/training/sandbox/*. Provides the per-user training-mode
 * state and toggle/reset actions. The status query drives the "TRAINING
 * SANDBOX — Synthetic Data" banner in the app shell.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrainingSandboxStatus {
  trainingModeEnabled: boolean;
  syntheticClaimCount: number;
  availableScenarios: number;
}

interface SeedResult {
  claimsCreated: number;
  documentsCreated: number;
  deadlinesCreated: number;
}

interface ResetResult {
  claimsRemoved: number;
  reseed: SeedResult;
}

// ---------------------------------------------------------------------------
// Status query
// ---------------------------------------------------------------------------

export function useTrainingSandboxStatus() {
  return useQuery({
    queryKey: ['training-sandbox', 'status'],
    queryFn: async () => {
      return await apiFetch<TrainingSandboxStatus>('/training/sandbox/status');
    },
    // Banner UX is fine with 1-min cache — the user toggles the flag
    // through one of our own mutations which invalidate this key.
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useEnableTrainingMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return await apiFetch<{ success: true } & SeedResult>('/training/sandbox/enable', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['training-sandbox'] });
      // Synthetic claims now exist for this user — refresh dashboard listings.
      void queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}

export function useDisableTrainingMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return await apiFetch<{ success: true }>('/training/sandbox/disable', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['training-sandbox'] });
    },
  });
}

export function useResetSandbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return await apiFetch<{ success: true } & ResetResult>('/training/sandbox/reset', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['training-sandbox'] });
      void queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}
