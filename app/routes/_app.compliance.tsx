import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Users,
  CheckCircle,
  BookOpen,
  RefreshCw,
  Clock,
  FileBarChart,
  Activity,
  Lock,
  Bell,
  BellOff,
  UserX,
  ChevronRight,
  Save,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { PageHeader } from '~/components/layout/page-header';
import {
  useComplianceMetrics,
  useTeamCompliance,
  useAdminCompliance,
  useUplMonitoring,
  useRecentUplBlocks,
  useUplAlertConfig,
  useSetUplAlertConfig,
  type ExaminerBreakdown,
  type BlocksPerPeriod,
  type ComplianceScoreBreakdown,
  type RecentRedBlock,
} from '~/hooks/api/use-compliance';
import { useAuth } from '~/hooks/use-auth';

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ScoreRing({ score, size = 128 }: { score: number; size?: number }) {
  const r = (size / 2) * 0.9 - 8;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);
  const center = size / 2;

  const color =
    score >= 90 ? 'text-secondary' : score >= 70 ? 'text-tertiary-container' : 'text-error';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="8"
          className="text-surface-container"
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={color}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-on-surface">{score}</span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
          OF 100
        </span>
      </div>
    </div>
  );
}

function ComplianceBar({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500">
        <span>{label}</span>
        <span className="text-on-surface">{value}%</span>
      </div>
      <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', colorClass)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-24">
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <AlertCircle className="w-8 h-8 text-error" />
      <p className="text-sm text-error">{message}</p>
      <button
        onClick={onRetry}
        className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Examiner View                                                      */
/* ------------------------------------------------------------------ */

function ExaminerComplianceView() {
  const complianceQuery = useComplianceMetrics();
  const compliance = complianceQuery.data;

  if (complianceQuery.isLoading) {
    return <LoadingState message="Loading compliance metrics..." />;
  }

  if (complianceQuery.isError || !compliance) {
    return (
      <ErrorState
        message="Failed to load compliance data."
        onRetry={() => void complianceQuery.refetch()}
      />
    );
  }

  const { deadlineAdherence, uplSummary, activeClaimsCount } = compliance;
  const adherencePct = Math.round(deadlineAdherence.adherenceRate * 100);
  const uplTotal = uplSummary.total || 1;
  const uplCompliancePct = Math.round(((uplTotal - uplSummary.blocked) / uplTotal) * 100);

  // Derive an overall score: 50% deadline + 30% UPL + 20% activity signal
  const overallScore = Math.round(adherencePct * 0.5 + uplCompliancePct * 0.3 + Math.min(activeClaimsCount * 2, 20));

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Score card */}
      <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-2xl p-6 ambient-shadow relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-28 h-28 bg-primary/5 rounded-full blur-2xl" />
        <h3 className="text-base font-bold text-on-surface mb-6">Your Compliance Score</h3>
        <div className="flex flex-col items-center gap-4 mb-6">
          <ScoreRing score={Math.min(overallScore, 100)} />
        </div>
        <div className="space-y-4">
          <ComplianceBar
            label="Deadline Adherence"
            value={adherencePct}
            colorClass="bg-secondary"
          />
          <ComplianceBar
            label="UPL Compliance"
            value={uplCompliancePct}
            colorClass="bg-primary"
          />
        </div>
      </div>

      {/* Deadline breakdown */}
      <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest rounded-2xl p-6 ambient-shadow">
        <h3 className="text-base font-bold text-on-surface mb-6">Compliance Breakdown</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-secondary" />
              <span className="text-sm font-bold text-on-surface">Deadlines</span>
            </div>
            <p className="text-2xl font-extrabold text-on-surface">
              {deadlineAdherence.met}
              <span className="text-sm font-normal text-slate-400"> / {deadlineAdherence.total}</span>
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              {deadlineAdherence.met} met · {deadlineAdherence.missed} missed ·{' '}
              {deadlineAdherence.pending} pending
            </p>
          </div>

          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="text-sm font-bold text-on-surface">AI Interactions</span>
            </div>
            <p className="text-2xl font-extrabold text-on-surface">
              {uplSummary.total}
              <span className="text-sm font-normal text-slate-400"> total</span>
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              {uplSummary.green} green · {uplSummary.yellow} yellow · {uplSummary.red} red blocked
            </p>
          </div>

          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-tertiary-container" />
              <span className="text-sm font-bold text-on-surface">Active Claims</span>
            </div>
            <p className="text-2xl font-extrabold text-on-surface">{activeClaimsCount}</p>
            <p className="text-xs text-on-surface-variant mt-1">
              Open or under investigation
            </p>
          </div>

          <div
            className={cn(
              'rounded-xl p-4 border',
              uplSummary.blocked > 0
                ? 'bg-error/5 border-error/20'
                : 'bg-surface-container-low border-outline-variant/10',
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              {uplSummary.blocked > 0 ? (
                <AlertCircle className="w-5 h-5 text-error" />
              ) : (
                <CheckCircle className="w-5 h-5 text-secondary" />
              )}
              <span className="text-sm font-bold text-on-surface">UPL Blocks</span>
            </div>
            <p
              className={cn(
                'text-2xl font-extrabold',
                uplSummary.blocked > 0 ? 'text-error' : 'text-secondary',
              )}
            >
              {uplSummary.blocked}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              {uplSummary.blocked === 0
                ? 'No outputs blocked — full compliance'
                : 'Outputs blocked by UPL validator'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Supervisor Team View                                               */
/* ------------------------------------------------------------------ */

function TeamComplianceView() {
  const teamQuery = useTeamCompliance();
  const team = teamQuery.data;

  if (teamQuery.isLoading) {
    return <LoadingState message="Loading team metrics..." />;
  }

  if (teamQuery.isError || !team) {
    return (
      <ErrorState
        message="Failed to load team compliance data."
        onRetry={() => void teamQuery.refetch()}
      />
    );
  }

  const { teamDeadlineAdherence, teamUplCompliance, trainingCompletion, examinerBreakdown } = team;
  const adherencePct = Math.round(teamDeadlineAdherence.adherenceRate * 100);
  const trainingPct = Math.round(trainingCompletion.completionRate * 100);
  const greenPct = Math.round(teamUplCompliance.greenRate * 100);
  const yellowPct = Math.round(teamUplCompliance.yellowRate * 100);
  const redPct = Math.round(teamUplCompliance.redRate * 100);
  const teamScore = Math.round(adherencePct * 0.5 + (100 - Math.round(teamUplCompliance.blockRate * 100)) * 0.3 + trainingPct * 0.2);

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Team score */}
      <div className="col-span-12 lg:col-span-3 bg-surface-container-lowest rounded-2xl p-6 ambient-shadow">
        <h3 className="text-base font-bold text-on-surface mb-4">Team Score</h3>
        <div className="flex flex-col items-center gap-3">
          <ScoreRing score={Math.min(teamScore, 100)} size={112} />
        </div>
        <div className="mt-4 space-y-3">
          <ComplianceBar
            label="Deadline Adherence"
            value={adherencePct}
            colorClass="bg-secondary"
          />
          <ComplianceBar
            label="Training Completion"
            value={trainingPct}
            colorClass="bg-tertiary-container"
          />
        </div>
      </div>

      {/* UPL zone distribution */}
      <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-2xl p-6 ambient-shadow">
        <h3 className="text-base font-bold text-on-surface mb-4">UPL Zone Distribution</h3>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold uppercase">
              <span className="text-secondary">GREEN — Factual</span>
              <span>{greenPct}%</span>
            </div>
            <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
              <div className="h-full bg-secondary rounded-full" style={{ width: `${greenPct}%` }} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold uppercase">
              <span className="text-tertiary-container">YELLOW — Statistical</span>
              <span>{yellowPct}%</span>
            </div>
            <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
              <div
                className="h-full bg-tertiary-container rounded-full"
                style={{ width: `${yellowPct}%` }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold uppercase">
              <span className="text-error">RED — Blocked</span>
              <span>{redPct}%</span>
            </div>
            <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
              <div className="h-full bg-error rounded-full" style={{ width: `${redPct}%` }} />
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-surface-container flex justify-between text-[10px] text-slate-400">
          <span>Block rate: {Math.round(teamUplCompliance.blockRate * 100)}%</span>
          <span>
            Training: {trainingCompletion.complete}/{trainingCompletion.total} complete
          </span>
        </div>
      </div>

      {/* Examiner table */}
      <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-container flex items-center gap-2">
          <Users className="w-4 h-4 text-on-surface-variant" />
          <h3 className="text-base font-bold text-on-surface">Examiner Breakdown</h3>
        </div>
        {examinerBreakdown.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            No examiners with assigned claims
          </div>
        ) : (
          <ul className="divide-y divide-surface-container">
            {examinerBreakdown.map((examiner: ExaminerBreakdown) => {
              const adherence = Math.round(examiner.deadlineAdherence.adherenceRate * 100);
              const blockPct = Math.round(examiner.uplBlockRate * 100);
              const score = Math.max(0, 100 - blockPct * 5 - (100 - adherence));
              const scoreColor =
                score >= 90
                  ? 'text-secondary'
                  : score >= 70
                    ? 'text-tertiary-container'
                    : 'text-error';
              return (
                <li key={examiner.userId} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{examiner.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {examiner.deadlineAdherence.met}/{examiner.deadlineAdherence.total} deadlines
                      met · {blockPct}% UPL block rate
                    </p>
                  </div>
                  <span className={cn('text-xl font-extrabold', scoreColor)}>{score}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Admin DOI Audit Readiness View                                     */
/* ------------------------------------------------------------------ */

function AdminComplianceView() {
  const adminQuery = useAdminCompliance();
  const report = adminQuery.data;

  if (adminQuery.isLoading) {
    return <LoadingState message="Loading admin compliance report..." />;
  }

  if (adminQuery.isError || !report) {
    return (
      <ErrorState
        message="Failed to load admin compliance report."
        onRetry={() => void adminQuery.refetch()}
      />
    );
  }

  const { doiAuditReadinessScore, complianceScoreBreakdown: bd, teamDeadlineAdherence, teamUplCompliance, trainingCompletion } = report;

  const readinessColor =
    doiAuditReadinessScore >= 90
      ? 'text-secondary'
      : doiAuditReadinessScore >= 70
        ? 'text-tertiary-container'
        : 'text-error';

  const readinessBg =
    doiAuditReadinessScore >= 90
      ? 'bg-secondary/10 border-secondary/20'
      : doiAuditReadinessScore >= 70
        ? 'bg-tertiary-container/10 border-tertiary-container/20'
        : 'bg-error/10 border-error/20';

  const scoreCategories: Array<{ label: string; score: number; max: number; note: string }> = [
    {
      label: 'Deadline Adherence',
      score: bd.deadlineScore,
      max: 40,
      note: 'Missed deadlines are the #1 DOI audit finding',
    },
    {
      label: 'Investigation Completeness',
      score: bd.investigationScore,
      max: 30,
      note: 'Incomplete investigations underpin bad faith claims',
    },
    {
      label: 'Documentation',
      score: bd.documentationScore,
      max: 20,
      note: 'Claims with at least one supporting document',
    },
    {
      label: 'UPL Compliance',
      score: bd.uplScore,
      max: 10,
      note: 'AI output block rate (lower is better)',
    },
  ];

  return (
    <div className="space-y-6">
      {/* DOI readiness banner */}
      <div className={cn('rounded-2xl p-6 border ambient-shadow', readinessBg)}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileBarChart className={cn('w-5 h-5', readinessColor)} />
              <h3 className="text-base font-bold text-on-surface">DOI Audit Readiness Score</h3>
            </div>
            <p className="text-xs text-on-surface-variant max-w-lg">
              Composite score indicating organizational readiness for a California Department of
              Insurance market conduct examination. Scores below 70 indicate material compliance
              gaps requiring remediation.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={cn('text-5xl font-extrabold', readinessColor)}>
              {doiAuditReadinessScore}
            </p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
              OUT OF 100
            </p>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-3 border-t border-current/10 pt-3">
          Metrics computed from system data. Consult qualified counsel for regulatory compliance
          determinations.
        </p>
      </div>

      {/* Score breakdown */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7 bg-surface-container-lowest rounded-2xl p-6 ambient-shadow">
          <h3 className="text-base font-bold text-on-surface mb-4">Score Breakdown</h3>
          <div className="space-y-5">
            {scoreCategories.map(({ label, score, max, note }) => {
              const pct = Math.round((score / max) * 100);
              const barColor =
                pct >= 80 ? 'bg-secondary' : pct >= 60 ? 'bg-tertiary-container' : 'bg-error';
              return (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <div>
                      <span className="font-bold text-on-surface">{label}</span>
                      <span className="ml-2 text-[10px] text-slate-400">{note}</span>
                    </div>
                    <span className="font-extrabold text-on-surface shrink-0 ml-2">
                      {score}/{max}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Org-wide summary stats */}
        <div className="col-span-12 lg:col-span-5 grid grid-cols-2 gap-4 content-start">
          <div className="bg-surface-container-lowest rounded-2xl p-4 ambient-shadow">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-secondary" />
              <span className="text-xs font-bold text-on-surface">Deadline Adherence</span>
            </div>
            <p className="text-2xl font-extrabold text-on-surface">
              {Math.round(teamDeadlineAdherence.adherenceRate * 100)}%
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {teamDeadlineAdherence.met} met · {teamDeadlineAdherence.missed} missed
            </p>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl p-4 ambient-shadow">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-tertiary-container" />
              <span className="text-xs font-bold text-on-surface">Training</span>
            </div>
            <p className="text-2xl font-extrabold text-on-surface">
              {Math.round(trainingCompletion.completionRate * 100)}%
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {trainingCompletion.complete}/{trainingCompletion.total} users complete
            </p>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl p-4 ambient-shadow">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-on-surface">UPL Block Rate</span>
            </div>
            <p
              className={cn(
                'text-2xl font-extrabold',
                teamUplCompliance.blockRate < 0.05 ? 'text-secondary' : 'text-error',
              )}
            >
              {Math.round(teamUplCompliance.blockRate * 100)}%
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {Math.round(teamUplCompliance.greenRate * 100)}% green zone
            </p>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl p-4 ambient-shadow">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-secondary" />
              <span className="text-xs font-bold text-on-surface">Exam Status</span>
            </div>
            <p
              className={cn(
                'text-sm font-extrabold',
                doiAuditReadinessScore >= 70 ? 'text-secondary' : 'text-error',
              )}
            >
              {doiAuditReadinessScore >= 90
                ? 'Audit Ready'
                : doiAuditReadinessScore >= 70
                  ? 'Adequate'
                  : 'Needs Work'}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {doiAuditReadinessScore < 70 ? 'Material gaps — remediate before exam' : 'No critical gaps detected'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  UPL Recent Blocks Table                                           */
/* ------------------------------------------------------------------ */

function RecentBlocksTable() {
  const blocksQuery = useRecentUplBlocks(25);
  const data = blocksQuery.data;

  if (blocksQuery.isLoading) {
    return <LoadingState message="Loading recent blocks..." />;
  }

  if (blocksQuery.isError || !data) {
    return (
      <ErrorState
        message="Failed to load recent block events."
        onRetry={() => void blocksQuery.refetch()}
      />
    );
  }

  const { blocks } = data;

  const bucketLabel: Record<RecentRedBlock['queryLengthBucket'], string> = {
    short: '< 50 chars',
    medium: '50–200 chars',
    long: '> 200 chars',
  };

  return (
    <div className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-container flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserX className="w-4 h-4 text-error" />
          <h4 className="text-sm font-bold text-on-surface">Recent RED-Zone Blocks</h4>
        </div>
        <span className="text-[10px] text-slate-400">{blocks.length} most recent</span>
      </div>

      {blocks.length === 0 ? (
        <div className="px-5 py-8 flex items-center justify-center gap-2 text-secondary">
          <CheckCircle className="w-5 h-5" />
          <p className="text-sm font-bold">No RED-zone blocks recorded</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-container">
                <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Query Size
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Adversarial
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {blocks.map((block) => (
                <tr key={block.id} className="hover:bg-surface-container/50 transition-colors">
                  <td className="px-4 py-2.5 text-on-surface-variant whitespace-nowrap">
                    {new Date(block.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-on-surface">{block.userName}</span>
                    <span className="ml-1.5 text-[9px] text-slate-400 font-mono">
                      {block.userId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-on-surface-variant">
                    {bucketLabel[block.queryLengthBucket]}
                  </td>
                  <td className="px-4 py-2.5">
                    {block.isAdversarial ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-error bg-error/10 px-2 py-0.5 rounded-full">
                        <ChevronRight className="w-3 h-3" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">No</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-5 py-2 text-[9px] text-slate-400 border-t border-surface-container">
        Query content is never stored or displayed — metadata only. Timestamps in local time.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  UPL Alert Configuration Panel                                     */
/* ------------------------------------------------------------------ */

function AlertConfigPanel() {
  const configQuery = useUplAlertConfig();
  const setConfig = useSetUplAlertConfig();

  const [redRatePct, setRedRatePct] = useState<string>('');
  const [blockCount, setBlockCount] = useState<string>('');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);

  const config = configQuery.data;
  const currentRedRatePct = config ? Math.round(config.redRateThreshold * 100) : 5;
  const currentBlockCount = config?.blockCountThreshold ?? 10;
  const currentEnabled = enabled !== null ? enabled : (config?.alertsEnabled ?? true);

  const handleSave = () => {
    const updates: Parameters<typeof setConfig.mutate>[0] = {};

    const parsedRate = parseFloat(redRatePct);
    if (!Number.isNaN(parsedRate) && parsedRate >= 0 && parsedRate <= 100) {
      updates.redRateThreshold = parsedRate / 100;
    }

    const parsedCount = parseInt(blockCount, 10);
    if (!Number.isNaN(parsedCount) && parsedCount >= 0) {
      updates.blockCountThreshold = parsedCount;
    }

    if (enabled !== null) {
      updates.alertsEnabled = enabled;
    }

    setConfig.mutate(updates, {
      onSuccess: () => {
        setRedRatePct('');
        setBlockCount('');
        setEnabled(null);
        setSaved(true);
        setTimeout(() => { setSaved(false); }, 2500);
      },
    });
  };

  if (configQuery.isLoading) {
    return <LoadingState message="Loading alert configuration..." />;
  }

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 ambient-shadow">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-bold text-on-surface">Alert Configuration</h4>
        <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase">
          Supervisor+
        </span>
      </div>

      <div className="space-y-4">
        {/* Alerts enabled toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-on-surface">Alerts Enabled</p>
            <p className="text-[10px] text-slate-400">
              Show warning banner when thresholds are exceeded
            </p>
          </div>
          <button
            onClick={() => { setEnabled(!currentEnabled); }}
            className={cn(
              'flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-colors',
              currentEnabled
                ? 'bg-secondary/10 text-secondary hover:bg-secondary/20'
                : 'bg-surface-container text-slate-400 hover:bg-surface-container-high',
            )}
          >
            {currentEnabled ? (
              <>
                <Bell className="w-3 h-3" />
                On
              </>
            ) : (
              <>
                <BellOff className="w-3 h-3" />
                Off
              </>
            )}
          </button>
        </div>

        {/* RED rate threshold */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="red-rate-threshold">
            RED Zone Rate Alert Threshold
          </label>
          <p className="text-[10px] text-slate-400">
            Alert if RED queries exceed this % of total in the last 24h (current: {currentRedRatePct}%)
          </p>
          <div className="flex items-center gap-2">
            <input
              id="red-rate-threshold"
              type="number"
              min="0"
              max="100"
              step="1"
              placeholder={String(currentRedRatePct)}
              value={redRatePct}
              onChange={(e) => { setRedRatePct(e.target.value); }}
              className="w-24 px-2 py-1.5 text-xs bg-surface-container border border-outline-variant/30 rounded-lg text-on-surface focus:outline-none focus:border-primary/50"
            />
            <span className="text-xs text-slate-400">%</span>
          </div>
        </div>

        {/* Block count threshold */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="block-count-threshold">
            Block Count Alert Threshold
          </label>
          <p className="text-[10px] text-slate-400">
            Alert if absolute block count exceeds this in 24h (current: {currentBlockCount})
          </p>
          <div className="flex items-center gap-2">
            <input
              id="block-count-threshold"
              type="number"
              min="0"
              step="1"
              placeholder={String(currentBlockCount)}
              value={blockCount}
              onChange={(e) => { setBlockCount(e.target.value); }}
              className="w-24 px-2 py-1.5 text-xs bg-surface-container border border-outline-variant/30 rounded-lg text-on-surface focus:outline-none focus:border-primary/50"
            />
            <span className="text-xs text-slate-400">blocks</span>
          </div>
        </div>

        {/* Save button */}
        <div className="pt-1 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={setConfig.isPending}
            className="flex items-center gap-1.5 text-xs font-bold bg-primary text-on-primary px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            {setConfig.isPending ? 'Saving...' : 'Save Configuration'}
          </button>
          {saved && (
            <span className="text-[10px] text-secondary font-bold flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Saved
            </span>
          )}
          {setConfig.isError && (
            <span className="text-[10px] text-error font-bold flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Save failed — retry
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  UPL Monitoring Panel (Supervisor + Admin)                         */
/* ------------------------------------------------------------------ */

function UplMonitoringPanel() {
  const uplQuery = useUplMonitoring();
  const alertConfigQuery = useUplAlertConfig();
  const data = uplQuery.data;
  const alertConfig = alertConfigQuery.data;

  if (uplQuery.isLoading) {
    return <LoadingState message="Loading UPL monitoring data..." />;
  }

  if (uplQuery.isError || !data) {
    return (
      <ErrorState
        message="Failed to load UPL monitoring data."
        onRetry={() => void uplQuery.refetch()}
      />
    );
  }

  const { zoneDistribution, blocksPerPeriod, adversarialDetectionRate } = data;
  const total = zoneDistribution.green + zoneDistribution.yellow + zoneDistribution.red || 1;
  const greenPct = Math.round((zoneDistribution.green / total) * 100);
  const yellowPct = Math.round((zoneDistribution.yellow / total) * 100);
  const redPct = Math.round((zoneDistribution.red / total) * 100);

  const adversarialPct = Math.round(adversarialDetectionRate * 100);
  const maxBlockDay = blocksPerPeriod.reduce(
    (max, b) => (b.count > max ? b.count : max),
    0,
  );
  const totalBlocks24h = blocksPerPeriod.slice(-1)[0]?.count ?? 0;
  const redRate = zoneDistribution.red / total;

  // Threshold alert banner
  const alertsEnabled = alertConfig?.alertsEnabled ?? true;
  const redRateThreshold = alertConfig?.redRateThreshold ?? 0.05;
  const blockCountThreshold = alertConfig?.blockCountThreshold ?? 10;
  const redRateBreached = alertsEnabled && redRate > redRateThreshold;
  const blockCountBreached = alertsEnabled && totalBlocks24h > blockCountThreshold;
  const showAlert = redRateBreached || blockCountBreached;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-primary" />
        <h3 className="text-base font-bold text-on-surface">UPL Monitoring Dashboard</h3>
        <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase">
          Supervisor+
        </span>
      </div>

      {/* Threshold alert banner */}
      {showAlert && (
        <div className="flex items-start gap-3 bg-error/10 border border-error/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-error">UPL Alert Threshold Exceeded</p>
            <ul className="text-[11px] text-error/80 mt-0.5 space-y-0.5">
              {redRateBreached && (
                <li>
                  RED zone rate {redPct}% exceeds configured threshold of{' '}
                  {Math.round(redRateThreshold * 100)}%
                </li>
              )}
              {blockCountBreached && (
                <li>
                  Block count {totalBlocks24h} (latest day) exceeds threshold of {blockCountThreshold}
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Zone distribution */}
        <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-2xl p-5 ambient-shadow">
          <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-4">
            Zone Distribution (30 days)
          </h4>
          {/* Mini donut chart */}
          <div className="flex items-center gap-4 mb-4">
            <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
              {(() => {
                const radius = 24;
                const cx = 32;
                const cy = 32;
                const circumference = 2 * Math.PI * radius;
                // Segments: GREEN, YELLOW, RED
                const segments = [
                  { pct: greenPct, color: 'text-secondary' },
                  { pct: yellowPct, color: 'text-tertiary-container' },
                  { pct: redPct, color: 'text-error' },
                ];
                let offset = 0;
                return segments.map(({ pct, color }) => {
                  const dashArray = (pct / 100) * circumference;
                  const dashOffset = circumference - dashArray;
                  const rotationOffset = (offset / 100) * circumference;
                  offset += pct;
                  return (
                    <circle
                      key={color}
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="10"
                      strokeDasharray={`${dashArray} ${circumference - dashArray}`}
                      strokeDashoffset={-rotationOffset}
                      className={color}
                    />
                  );
                });
              })()}
            </svg>
            <div className="space-y-1 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-secondary shrink-0" />
                <span className="text-slate-400">Green {greenPct}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-tertiary-container shrink-0" />
                <span className="text-slate-400">Yellow {yellowPct}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-error shrink-0" />
                <span className="text-slate-400">Red {redPct}%</span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { label: 'GREEN — Factual', pct: greenPct, count: zoneDistribution.green, color: 'bg-secondary', textColor: 'text-secondary' },
              { label: 'YELLOW — Statistical', pct: yellowPct, count: zoneDistribution.yellow, color: 'bg-tertiary-container', textColor: 'text-tertiary-container' },
              { label: 'RED — Blocked', pct: redPct, count: zoneDistribution.red, color: 'bg-error', textColor: 'text-error' },
            ].map(({ label, pct, count, color, textColor }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold uppercase">
                  <span className={textColor}>{label}</span>
                  <span className="text-on-surface">
                    {count} ({pct}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-4">{total} total AI queries</p>
        </div>

        {/* Adversarial detection */}
        <div className="col-span-12 lg:col-span-3 bg-surface-container-lowest rounded-2xl p-5 ambient-shadow flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
              Adversarial Detection Rate
            </h4>
            <p className="text-[10px] text-slate-400 mb-4">
              Fraction of RED-zone queries that also triggered output validation failure —
              indicates users attempting to circumvent UPL protections.
            </p>
          </div>
          <div>
            <p
              className={cn(
                'text-5xl font-extrabold',
                adversarialPct < 10 ? 'text-secondary' : adversarialPct < 30 ? 'text-tertiary-container' : 'text-error',
              )}
            >
              {adversarialPct}%
            </p>
            <p
              className={cn(
                'text-xs font-bold mt-1',
                adversarialPct < 10 ? 'text-secondary' : adversarialPct < 30 ? 'text-tertiary-container' : 'text-error',
              )}
            >
              {adversarialPct < 10
                ? 'Normal — no policy review needed'
                : adversarialPct < 30
                  ? 'Elevated — monitor closely'
                  : 'High — policy review required'}
            </p>
          </div>
        </div>

        {/* Blocks per period chart */}
        <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest rounded-2xl p-5 ambient-shadow">
          <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-4">
            Blocked Outputs by Day
          </h4>
          {blocksPerPeriod.length === 0 ? (
            <div className="flex items-center justify-center h-24">
              <div className="flex items-center gap-2 text-secondary">
                <CheckCircle className="w-5 h-5" />
                <p className="text-sm font-bold">No blocked outputs in this period</p>
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-1 h-24">
              {blocksPerPeriod.map((entry: BlocksPerPeriod) => {
                const barHeight = maxBlockDay > 0 ? Math.round((entry.count / maxBlockDay) * 100) : 0;
                return (
                  <div
                    key={entry.period}
                    className="flex-1 flex flex-col items-center gap-1 group relative"
                    title={`${entry.period}: ${String(entry.count)} blocks`}
                  >
                    <div
                      className="w-full bg-error rounded-sm transition-all"
                      style={{ height: `${barHeight}%` }}
                    />
                    <span className="text-[8px] text-slate-400 rotate-45 origin-left hidden group-hover:block absolute -bottom-4 left-0">
                      {entry.period.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {blocksPerPeriod.length > 0 && (
            <p className="text-[10px] text-slate-400 mt-2">
              {blocksPerPeriod.reduce((sum, b) => sum + b.count, 0)} total blocks over{' '}
              {blocksPerPeriod.length} days
            </p>
          )}
        </div>
      </div>

      {/* Recent RED-zone blocks table */}
      <RecentBlocksTable />

      {/* Alert configuration */}
      <AlertConfigPanel />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compliance Page                                                    */
/* ------------------------------------------------------------------ */

export default function CompliancePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isSupervisorOrAdmin =
    user?.role === 'CLAIMS_SUPERVISOR' || user?.role === 'CLAIMS_ADMIN';
  const isAdmin = user?.role === 'CLAIMS_ADMIN';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['compliance'] });
    setIsRefreshing(false);
  };

  return (
    <>
      <PageHeader
        title="Compliance"
        subtitle="UPL compliance tracking, training status, and deadline adherence"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Compliance' }]}
      />

      <div className="flex items-center justify-end gap-3 mb-6 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Auto-refreshes every 60s
        </span>
        <button
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
          {isRefreshing ? 'Refreshing...' : 'Refresh now'}
        </button>
      </div>

      <div className="space-y-8">
        {/* Examiner personal view — always shown */}
        {!isSupervisorOrAdmin && <ExaminerComplianceView />}

        {/* Supervisor team view — supervisors and admins */}
        {isSupervisorOrAdmin && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-on-surface-variant" />
              <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                Team Overview
              </h2>
              {isAdmin && (
                <TrendingUp className="w-3 h-3 text-on-surface-variant" />
              )}
            </div>
            <TeamComplianceView />
          </div>
        )}

        {/* Admin DOI audit readiness — admin only */}
        {isAdmin && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileBarChart className="w-4 h-4 text-on-surface-variant" />
              <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                DOI Audit Readiness
              </h2>
            </div>
            <AdminComplianceView />
          </div>
        )}

        {/* UPL monitoring panel — supervisors and admins */}
        {isSupervisorOrAdmin && (
          <div className="space-y-2">
            <UplMonitoringPanel />
          </div>
        )}

        {/* Trend indicator for non-privileged users */}
        {!isSupervisorOrAdmin && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <TrendingDown className="w-3 h-3" />
            <span>
              Supervisor and admin views include team metrics, DOI audit readiness, and UPL
              monitoring.
            </span>
          </div>
        )}
      </div>
    </>
  );
}
