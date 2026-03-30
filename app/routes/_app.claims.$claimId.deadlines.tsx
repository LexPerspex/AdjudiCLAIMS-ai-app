import { useParams } from 'react-router';
import { AlertCircle, Clock, Calendar, CheckCircle, RefreshCw } from 'lucide-react';
import { cn } from '~/lib/utils';
import { useClaimDeadlines, type Deadline } from '~/hooks/api/use-deadlines';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function urgencyConfig(urgency: Deadline['urgency']) {
  switch (urgency) {
    case 'OVERDUE':
      return {
        dot: 'bg-error',
        border: 'border-error',
        bg: 'bg-error/5',
        text: 'text-error',
        label: 'OVERDUE',
        icon: AlertCircle,
      };
    case 'DUE_TODAY':
      return {
        dot: 'bg-tertiary-container',
        border: 'border-tertiary-container',
        bg: 'bg-tertiary-container/5',
        text: 'text-tertiary-container',
        label: 'DUE TODAY',
        icon: Clock,
      };
    case 'DUE_SOON':
      return {
        dot: 'bg-tertiary-container',
        border: 'border-tertiary-container',
        bg: 'bg-tertiary-container/5',
        text: 'text-tertiary-container',
        label: 'DUE SOON',
        icon: Clock,
      };
    default:
      return {
        dot: 'bg-secondary',
        border: 'border-surface-container',
        bg: 'bg-surface-container-low',
        text: 'text-secondary',
        label: 'ON TRACK',
        icon: Calendar,
      };
  }
}

/* ------------------------------------------------------------------ */
/*  Deadline Action Hook                                               */
/* ------------------------------------------------------------------ */

function useUpdateDeadlineStatus(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deadlineId, status }: { deadlineId: string; status: 'COMPLETED' | 'WAIVED' }) =>
      apiFetch<Deadline>(`/deadlines/${deadlineId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deadlines', 'claim', claimId] });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Deadlines Tab                                                      */
/* ------------------------------------------------------------------ */

export default function ClaimDeadlinesTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const deadlinesQuery = useClaimDeadlines(claimId ?? '');
  const updateMutation = useUpdateDeadlineStatus(claimId ?? '');

  const deadlines = deadlinesQuery.data ?? [];

  if (deadlinesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading deadlines...</p>
      </div>
    );
  }

  if (deadlinesQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load deadlines.</p>
        <button
          onClick={() => void deadlinesQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (deadlines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Calendar className="w-10 h-10 text-slate-300" />
        <p className="text-sm text-on-surface-variant">No deadlines found for this claim.</p>
      </div>
    );
  }

  const overdueCount = deadlines.filter((d) => d.urgency === 'OVERDUE').length;
  const dueSoonCount = deadlines.filter(
    (d) => d.urgency === 'DUE_TODAY' || d.urgency === 'DUE_SOON',
  ).length;
  const pendingDeadlines = deadlines.filter((d) => d.status === 'PENDING');
  const resolvedDeadlines = deadlines.filter((d) => d.status !== 'PENDING');

  return (
    <div className="flex flex-col gap-6">
      {/* Summary strip */}
      {(overdueCount > 0 || dueSoonCount > 0) && (
        <div className="flex gap-4">
          {overdueCount > 0 && (
            <div className="flex items-center gap-2 bg-error/5 border border-error/20 rounded-lg px-4 py-2">
              <AlertCircle className="w-4 h-4 text-error" />
              <span className="text-sm font-bold text-error">
                {overdueCount} overdue deadline{overdueCount > 1 ? 's' : ''}
              </span>
            </div>
          )}
          {dueSoonCount > 0 && (
            <div className="flex items-center gap-2 bg-tertiary-container/5 border border-tertiary-container/20 rounded-lg px-4 py-2">
              <Clock className="w-4 h-4 text-tertiary-container" />
              <span className="text-sm font-bold text-tertiary-container">
                {dueSoonCount} due within 3 days
              </span>
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="relative flex flex-col gap-0">
        <div className="absolute left-[23px] top-4 bottom-4 w-0.5 bg-outline-variant/20" />

        {pendingDeadlines.map((deadline) => {
          const cfg = urgencyConfig(deadline.urgency);
          const UrgIcon = cfg.icon;
          const isUpdating =
            updateMutation.isPending &&
            (updateMutation.variables as { deadlineId: string } | undefined)?.deadlineId ===
              deadline.id;

          return (
            <div key={deadline.id} className="relative flex gap-6 pb-6">
              <div
                className={cn(
                  'relative z-10 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0',
                  cfg.bg,
                  cfg.border,
                  'border-2',
                )}
              >
                <UrgIcon className={cn('w-5 h-5', cfg.text)} />
              </div>

              <div className={cn('flex-1 rounded-xl p-5 border-l-4', cfg.border, cfg.bg)}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn('text-[10px] font-bold uppercase tracking-wider', cfg.text)}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        Due{' '}
                        {new Date(deadline.dueDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-on-surface">{deadline.title}</h4>
                    {deadline.statutoryCitation && (
                      <p className="text-xs text-primary font-mono mt-1">
                        {deadline.statutoryCitation}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      disabled={isUpdating}
                      onClick={() =>
                        updateMutation.mutate({ deadlineId: deadline.id, status: 'COMPLETED' })
                      }
                      className="px-3 py-1.5 bg-secondary text-white rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
                      Mark Met
                    </button>
                    <button
                      disabled={isUpdating}
                      onClick={() =>
                        updateMutation.mutate({ deadlineId: deadline.id, status: 'WAIVED' })
                      }
                      className="px-3 py-1.5 bg-surface-container-high text-on-surface-variant rounded-lg text-xs font-bold hover:bg-surface-container-highest transition-all disabled:opacity-50"
                    >
                      Waive
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {resolvedDeadlines.length > 0 && (
          <>
            <div className="py-4 pl-16">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Resolved ({resolvedDeadlines.length})
              </span>
            </div>
            {resolvedDeadlines.map((deadline) => (
              <div key={deadline.id} className="relative flex gap-6 pb-4 opacity-60">
                <div className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 bg-surface-container-high border-2 border-outline-variant/20">
                  <CheckCircle className="w-5 h-5 text-secondary" />
                </div>
                <div className="flex-1 rounded-xl p-4 bg-surface-container-low border-l-4 border-outline-variant/20">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
                      {deadline.status}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {new Date(deadline.dueDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-on-surface mt-0.5">{deadline.title}</h4>
                  {deadline.statutoryCitation && (
                    <p className="text-xs text-slate-400 font-mono mt-1">
                      {deadline.statutoryCitation}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
