import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  TrendingUp,
  AlertCircle,
  Users,
  CheckCircle,
  BookOpen,
  RefreshCw,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { PageHeader } from '~/components/layout/page-header';
import { useComplianceMetrics } from '~/hooks/api/use-compliance';
import { useAuth } from '~/hooks/use-auth';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ExaminerComplianceRecord {
  examinerId: string;
  examinerName: string;
  overallScore: number;
  deadlineAdherence: number;
  uplCompliance: number;
  trainingCompletion: number;
  uplInteractions: number;
  redZoneBlocked: number;
}

interface TeamComplianceMetrics {
  teamScore: number;
  trend: number;
  examiners: ExaminerComplianceRecord[];
  uplZoneDistribution: {
    green: number;
    yellow: number;
    red: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useTeamCompliance() {
  return useQuery<TeamComplianceMetrics>({
    queryKey: ['compliance', 'team'],
    queryFn: () => apiFetch<TeamComplianceMetrics>('/compliance/team'),
  });
}

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

function ComplianceBar({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
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

/* ------------------------------------------------------------------ */
/*  Examiner View                                                      */
/* ------------------------------------------------------------------ */

function ExaminerComplianceView() {
  const complianceQuery = useComplianceMetrics();
  const compliance = complianceQuery.data;

  if (complianceQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading compliance metrics...</p>
      </div>
    );
  }

  if (complianceQuery.isError || !compliance) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load compliance data.</p>
        <button
          onClick={() => void complianceQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Score card */}
      <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-2xl p-6 ambient-shadow relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-28 h-28 bg-primary/5 rounded-full blur-2xl" />
        <h3 className="text-base font-bold text-on-surface mb-6">Your Compliance Score</h3>
        <div className="flex flex-col items-center gap-4 mb-6">
          <ScoreRing score={compliance.overallScore} />
          {compliance.trend !== 0 && (
            <p
              className={cn(
                'text-xs font-bold flex items-center gap-1',
                compliance.trend > 0 ? 'text-secondary' : 'text-error',
              )}
            >
              <TrendingUp className="w-3 h-3" />
              {compliance.trend > 0 ? '+' : ''}
              {compliance.trend}% FROM LAST MONTH
            </p>
          )}
        </div>
        <div className="space-y-4">
          <ComplianceBar
            label="Deadline Adherence"
            value={compliance.deadlineAdherence}
            colorClass="bg-secondary"
          />
          <ComplianceBar
            label="Training Completion"
            value={compliance.trainingCompletion}
            colorClass="bg-tertiary-container"
          />
          <ComplianceBar
            label="UPL Compliance"
            value={compliance.uplCompliance}
            colorClass="bg-primary"
          />
        </div>
      </div>

      {/* Training status */}
      <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest rounded-2xl p-6 ambient-shadow">
        <h3 className="text-base font-bold text-on-surface mb-6">Training Status</h3>
        <div className="grid grid-cols-2 gap-4">
          <div
            className={cn(
              'rounded-xl p-4 border',
              compliance.monthlyReviewDue
                ? 'bg-error/5 border-error/20'
                : 'bg-surface-container-low border-outline-variant/10',
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              {compliance.monthlyReviewDue ? (
                <AlertCircle className="w-5 h-5 text-error" />
              ) : (
                <CheckCircle className="w-5 h-5 text-secondary" />
              )}
              <span className="text-sm font-bold text-on-surface">Monthly Review</span>
            </div>
            <p
              className={cn(
                'text-xs',
                compliance.monthlyReviewDue ? 'text-error' : 'text-on-surface-variant',
              )}
            >
              {compliance.monthlyReviewDue
                ? 'Due — complete your monthly compliance review'
                : 'Complete — no action needed'}
            </p>
          </div>
          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <span className="text-sm font-bold text-on-surface">Training Modules</span>
            </div>
            <p className="text-xs text-on-surface-variant">
              {compliance.trainingCompletion}% of required modules completed
            </p>
          </div>
          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-secondary" />
              <span className="text-sm font-bold text-on-surface">UPL Compliance</span>
            </div>
            <p className="text-xs text-on-surface-variant">
              {compliance.uplCompliance}% of AI interactions in compliance
            </p>
          </div>
          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-secondary" />
              <span className="text-sm font-bold text-on-surface">Deadline Adherence</span>
            </div>
            <p className="text-xs text-on-surface-variant">
              {compliance.deadlineAdherence}% of deadlines met on time
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Supervisor / Admin View                                            */
/* ------------------------------------------------------------------ */

function TeamComplianceView() {
  const teamQuery = useTeamCompliance();
  const team = teamQuery.data;

  if (teamQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading team metrics...</p>
      </div>
    );
  }

  if (teamQuery.isError || !team) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load team compliance data.</p>
        <button
          onClick={() => void teamQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const total =
    team.uplZoneDistribution.green +
    team.uplZoneDistribution.yellow +
    team.uplZoneDistribution.red;
  const greenPct = total > 0 ? Math.round((team.uplZoneDistribution.green / total) * 100) : 0;
  const yellowPct = total > 0 ? Math.round((team.uplZoneDistribution.yellow / total) * 100) : 0;
  const redPct = total > 0 ? Math.round((team.uplZoneDistribution.red / total) * 100) : 0;

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Team score */}
      <div className="col-span-12 lg:col-span-3 bg-surface-container-lowest rounded-2xl p-6 ambient-shadow">
        <h3 className="text-base font-bold text-on-surface mb-4">Team Score</h3>
        <div className="flex flex-col items-center gap-3">
          <ScoreRing score={team.teamScore} size={112} />
          <p
            className={cn(
              'text-xs font-bold flex items-center gap-1',
              team.trend >= 0 ? 'text-secondary' : 'text-error',
            )}
          >
            <TrendingUp className="w-3 h-3" />
            {team.trend >= 0 ? '+' : ''}
            {team.trend}% THIS MONTH
          </p>
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
        <p className="text-[10px] text-slate-400 mt-4">{total} total AI interactions</p>
      </div>

      {/* Examiner table */}
      <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-container flex items-center gap-2">
          <Users className="w-4 h-4 text-on-surface-variant" />
          <h3 className="text-base font-bold text-on-surface">Examiner Scores</h3>
        </div>
        <ul className="divide-y divide-surface-container">
          {team.examiners.map((examiner) => {
            const scoreColor =
              examiner.overallScore >= 90
                ? 'text-secondary'
                : examiner.overallScore >= 70
                  ? 'text-tertiary-container'
                  : 'text-error';
            return (
              <li key={examiner.examinerId} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-on-surface">{examiner.examinerName}</p>
                  <p className="text-[10px] text-slate-400">
                    {examiner.uplInteractions} AI interactions ·{' '}
                    {examiner.redZoneBlocked} RED blocked
                  </p>
                </div>
                <span className={cn('text-xl font-extrabold', scoreColor)}>
                  {examiner.overallScore}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compliance Page                                                    */
/* ------------------------------------------------------------------ */

export default function CompliancePage() {
  const { user } = useAuth();
  const isSupervisorOrAdmin =
    user?.role === 'CLAIMS_SUPERVISOR' || user?.role === 'CLAIMS_ADMIN';

  return (
    <>
      <PageHeader
        title="Compliance"
        subtitle="UPL compliance tracking, training status, and deadline adherence"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Compliance' }]}
      />

      {isSupervisorOrAdmin ? <TeamComplianceView /> : <ExaminerComplianceView />}
    </>
  );
}
