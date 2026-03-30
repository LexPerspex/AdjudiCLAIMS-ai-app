import { useState } from 'react';
import { useParams } from 'react-router';
import {
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  SkipForward,
  BookOpen,
  CircleDot,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  useClaimWorkflows,
  useUpdateWorkflowStep,
  type Workflow,
  type WorkflowStep,
} from '~/hooks/api/use-workflows';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function stepStatusConfig(status: WorkflowStep['status']) {
  switch (status) {
    case 'COMPLETED':
      return { icon: CheckCircle, className: 'text-secondary', bg: 'bg-secondary/10' };
    case 'SKIPPED':
      return { icon: SkipForward, className: 'text-slate-400', bg: 'bg-surface-container' };
    case 'IN_PROGRESS':
      return { icon: CircleDot, className: 'text-primary', bg: 'bg-primary/10' };
    default:
      return { icon: CircleDot, className: 'text-slate-300', bg: 'bg-surface-container-low' };
  }
}

function workflowStatusBadge(status: Workflow['status']) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-secondary-fixed-dim text-on-secondary-fixed-variant';
    case 'PAUSED':
      return 'bg-surface-container-high text-on-surface-variant';
    default:
      return 'bg-primary-fixed text-primary';
  }
}

/* ------------------------------------------------------------------ */
/*  Workflow Card                                                      */
/* ------------------------------------------------------------------ */

function WorkflowCard({
  workflow,
  onStepAction,
  isUpdating,
  updatingStepId,
}: {
  workflow: Workflow;
  onStepAction: (params: {
    workflowId: string;
    stepId: string;
    status: WorkflowStep['status'];
    skipReason?: string;
  }) => void;
  isUpdating: boolean;
  updatingStepId?: string;
}) {
  const [expanded, setExpanded] = useState(workflow.status === 'ACTIVE');

  return (
    <div className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-6 py-5 flex items-center justify-between hover:bg-surface-container-low transition-colors"
      >
        <div className="flex items-center gap-4 text-left">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-on-surface">{workflow.name}</h3>
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                  workflowStatusBadge(workflow.status),
                )}
              >
                {workflow.status}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">{workflow.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <span className="text-xs font-bold text-on-surface">
              {workflow.completedSteps}/{workflow.totalSteps}
            </span>
            <div className="w-24 h-1.5 bg-surface-container rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-secondary rounded-full"
                style={{ width: `${workflow.percentComplete}%` }}
              />
            </div>
          </div>
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-surface-container">
          <ol className="divide-y divide-surface-container">
            {workflow.steps
              .slice()
              .sort((a, b) => a.stepNumber - b.stepNumber)
              .map((step) => {
                const cfg = stepStatusConfig(step.status);
                const StepIcon = cfg.icon;
                const isStepUpdating = isUpdating && updatingStepId === step.id;

                return (
                  <li key={step.id} className="px-6 py-5 flex gap-4">
                    <div
                      className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                        cfg.bg,
                      )}
                    >
                      <StepIcon className={cn('w-4 h-4', cfg.className)} />
                    </div>

                    <div className="flex-1 flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 font-bold">
                              STEP {step.stepNumber}
                            </span>
                          </div>
                          <h4
                            className={cn(
                              'text-sm font-bold mt-0.5',
                              step.status === 'COMPLETED' || step.status === 'SKIPPED'
                                ? 'text-on-surface-variant line-through'
                                : 'text-on-surface',
                            )}
                          >
                            {step.title}
                          </h4>
                          <p className="text-xs text-on-surface-variant mt-1">{step.description}</p>
                          {step.authorityReference && (
                            <p className="text-xs text-primary font-mono mt-1 flex items-center gap-1">
                              <BookOpen className="w-3 h-3" />
                              {step.authorityReference}
                            </p>
                          )}
                          {step.complianceNote && (
                            <div className="mt-2 px-3 py-2 bg-primary/5 rounded-lg border-l-2 border-primary">
                              <p className="text-[11px] text-on-surface">{step.complianceNote}</p>
                            </div>
                          )}
                          {step.completedAt && (
                            <p className="text-[10px] text-on-surface-variant mt-1">
                              {step.status === 'COMPLETED' ? 'Completed' : 'Skipped'}{' '}
                              {new Date(step.completedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                              {step.completedBy && ` by ${step.completedBy}`}
                            </p>
                          )}
                        </div>
                        {step.status === 'PENDING' && (
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              disabled={isStepUpdating}
                              onClick={() =>
                                onStepAction({
                                  workflowId: workflow.id,
                                  stepId: step.id,
                                  status: 'COMPLETED',
                                })
                              }
                              className="px-3 py-1.5 bg-secondary text-white rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
                              Complete
                            </button>
                            {step.skippable && (
                              <button
                                disabled={isStepUpdating}
                                onClick={() =>
                                  onStepAction({
                                    workflowId: workflow.id,
                                    stepId: step.id,
                                    status: 'SKIPPED',
                                    skipReason: 'Not applicable',
                                  })
                                }
                                className="px-3 py-1.5 bg-surface-container-high text-on-surface-variant rounded-lg text-xs font-bold hover:bg-surface-container-highest transition-all disabled:opacity-50"
                              >
                                Skip
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Workflows Tab                                                      */
/* ------------------------------------------------------------------ */

export default function ClaimWorkflowsTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const workflowsQuery = useClaimWorkflows(claimId ?? '');
  const updateMutation = useUpdateWorkflowStep(claimId ?? '');

  if (workflowsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading workflows...</p>
      </div>
    );
  }

  if (workflowsQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load workflows.</p>
        <button
          onClick={() => void workflowsQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const workflows = workflowsQuery.data ?? [];

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <BookOpen className="w-10 h-10 text-slate-300" />
        <p className="text-sm text-on-surface-variant">No active workflows for this claim.</p>
      </div>
    );
  }

  const updatingVars = updateMutation.variables as
    | { workflowId: string; stepId: string }
    | undefined;

  return (
    <div className="flex flex-col gap-4">
      {workflows.map((workflow) => (
        <WorkflowCard
          key={workflow.id}
          workflow={workflow}
          onStepAction={(params) => updateMutation.mutate(params)}
          isUpdating={updateMutation.isPending && updatingVars?.workflowId === workflow.id}
          updatingStepId={updatingVars?.stepId}
        />
      ))}
    </div>
  );
}
