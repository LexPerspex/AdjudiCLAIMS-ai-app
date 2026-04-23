import { GraduationCap, RotateCw, X } from 'lucide-react';
import {
  useTrainingSandboxStatus,
  useResetSandbox,
  useDisableTrainingMode,
} from '~/hooks/api/use-training-sandbox';

/**
 * Training-sandbox banner (AJC-19).
 *
 * Renders a high-visibility yellow strip across the top of the app shell
 * whenever the authenticated user has training mode enabled. Provides:
 *   - "Reset" — wipes and re-seeds the trainees synthetic catalog
 *   - "Exit" — turns off training mode (claims persist for re-entry)
 *
 * Hidden when training mode is off, when the status query is loading, or
 * when it errors (banner failure should never block the main UI).
 */
export function TrainingSandboxBanner() {
  const { data: status } = useTrainingSandboxStatus();
  const resetMutation = useResetSandbox();
  const disableMutation = useDisableTrainingMode();

  if (!status?.trainingModeEnabled) return null;

  const isBusy = resetMutation.isPending || disableMutation.isPending;

  return (
    <div
      role="status"
      aria-label="Training sandbox active"
      className="fixed top-0 left-0 right-0 z-50 bg-yellow-400 text-yellow-950 border-b-2 border-yellow-600 shadow-md"
    >
      <div className="flex items-center justify-between px-6 py-2 gap-4">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-5 h-5 flex-shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider">
            Training Sandbox — Synthetic Data
          </span>
          <span className="text-xs opacity-80 hidden md:inline">
            {status.syntheticClaimCount} of {status.availableScenarios} practice claims
            loaded — no real PHI/PII
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              resetMutation.mutate();
            }}
            disabled={isBusy}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded bg-yellow-500/40 hover:bg-yellow-500/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCw className={`w-3 h-3 ${resetMutation.isPending ? 'animate-spin' : ''}`} />
            Reset
          </button>
          <button
            type="button"
            onClick={() => {
              disableMutation.mutate();
            }}
            disabled={isBusy}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded bg-yellow-600/30 hover:bg-yellow-600/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <X className="w-3 h-3" />
            Exit Training
          </button>
        </div>
      </div>
    </div>
  );
}
