import { Link } from 'react-router';
import {
  AlertTriangle,
  Plus,
  ArrowRight,
  AlertCircle,
  Clock,
  Calendar,
  TrendingUp,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { PageHeader } from '~/components/layout/page-header';
import { useClaims } from '~/hooks/api/use-claims';
import { useAllDeadlines } from '~/hooks/api/use-deadlines';
import { useComplianceMetrics } from '~/hooks/api/use-compliance';

/* ------------------------------------------------------------------ */
/*  Urgency helpers                                                    */
/* ------------------------------------------------------------------ */

function urgencyLabel(urgency?: string) {
  switch (urgency) {
    case 'OVERDUE':
      return { text: 'OVERDUE', icon: AlertCircle, className: 'text-error font-bold' };
    case 'DUE_TODAY':
      return { text: 'TOMORROW', icon: Clock, className: 'text-tertiary-container font-bold' };
    case 'DUE_SOON':
      return { text: 'IN 2 DAYS', icon: Clock, className: 'text-tertiary-container font-bold' };
    default:
      return {
        text: urgency ?? '',
        icon: Calendar,
        className: 'text-on-surface-variant font-bold',
      };
  }
}

function statusBadge(status: string) {
  switch (status.toLowerCase()) {
    case 'accepted':
      return 'bg-secondary-fixed-dim text-on-secondary-fixed-variant';
    case 'open':
      return 'bg-primary-fixed text-primary';
    case 'investigation':
      return 'bg-tertiary-fixed text-tertiary';
    case 'denied':
      return 'bg-error-container text-on-error-container';
    default:
      return 'bg-surface-container text-on-surface-variant';
  }
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                     */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const claimsQuery = useClaims({ take: 10 });
  const deadlinesQuery = useAllDeadlines();
  const complianceQuery = useComplianceMetrics();

  const claims = claimsQuery.data?.data ?? [];
  const totalClaims = claimsQuery.data?.total ?? 0;
  const deadlines = deadlinesQuery.data;
  const compliance = complianceQuery.data;

  return (
    <>
      {/* Education / compliance alert banner */}
      {compliance?.monthlyReviewDue && (
        <div className="mb-8 bg-error/5 border-l-4 border-error p-4 flex items-center justify-between rounded-r-xl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-error" />
            <span className="text-on-surface font-medium">Monthly compliance review due</span>
          </div>
          <Link
            to="/education"
            className="text-sm font-bold text-error hover:underline flex items-center gap-1"
          >
            COMPLETE REVIEW <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Page header with New Claim button */}
      <PageHeader
        title="Dashboard"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Dashboard' }]}
      >
        <Link
          to="/claims/new"
          className="primary-gradient text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" />
          New Claim
        </Link>
      </PageHeader>

      {/* Dashboard grid */}
      <div className="grid grid-cols-12 gap-8">
        {/* Claims Queue -- 8 cols */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <section className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between">
              <h3 className="text-lg font-bold text-on-surface">Claims Queue</h3>
              <div className="flex items-center gap-2">
                <button className="text-xs font-bold text-slate-400 hover:text-primary transition-colors">
                  FILTER
                </button>
                <span className="text-slate-300">|</span>
                <button className="text-xs font-bold text-slate-400 hover:text-primary transition-colors">
                  EXPORT
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Claim #
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Claimant
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      DOI
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Next Deadline
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                      Days Open
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {claimsQuery.isLoading && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-12 text-center text-sm text-slate-400"
                      >
                        Loading claims...
                      </td>
                    </tr>
                  )}
                  {claimsQuery.isError && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-12 text-center text-sm text-error"
                      >
                        Failed to load claims.
                      </td>
                    </tr>
                  )}
                  {claims.map((claim) => {
                    const urg = urgencyLabel(claim.nextDeadlineUrgency);
                    const UrgIcon = urg.icon;
                    return (
                      <tr
                        key={claim.id}
                        className="hover:bg-surface-container-low transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-4 text-sm font-bold text-primary">
                          <Link to={`/claims/${claim.id}`}>{claim.claimNumber}</Link>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-on-surface">
                          {claim.claimantName}
                        </td>
                        <td className="px-6 py-4 text-sm text-on-surface-variant">
                          {claim.dateOfInjury}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                              statusBadge(claim.status),
                            )}
                          >
                            {claim.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div
                            className={cn(
                              'flex items-center gap-1.5 text-sm',
                              urg.className,
                            )}
                          >
                            <UrgIcon className="w-4 h-4" />
                            {urg.text}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-on-surface-variant">
                          {claim.daysOpen}d
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-surface-container-low/30 text-center">
              <Link to="/claims" className="text-xs font-bold text-primary hover:underline">
                VIEW ALL {totalClaims} ACTIVE CLAIMS
              </Link>
            </div>
          </section>
        </div>

        {/* Sidebar cards -- 4 cols */}
        <div className="col-span-12 lg:col-span-4 space-y-8">
          {/* Deadline Summary */}
          <section className="bg-surface-container-lowest rounded-2xl p-6 ambient-shadow">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-on-surface">Deadline Summary</h3>
              <div className="flex gap-2">
                <span className="w-6 h-6 rounded flex items-center justify-center bg-error text-white text-[10px] font-bold">
                  {deadlines?.overdue ?? 0}
                </span>
                <span className="w-6 h-6 rounded flex items-center justify-center bg-tertiary-container text-white text-[10px] font-bold">
                  {deadlines?.dueToday ?? 0}
                </span>
                <span className="w-6 h-6 rounded flex items-center justify-center bg-secondary text-white text-[10px] font-bold">
                  {deadlines?.dueSoon ?? 0}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {deadlines?.upcoming.map((dl) => {
                const isOverdue = dl.urgency === 'OVERDUE';
                const isDueSoon =
                  dl.urgency === 'DUE_TODAY' || dl.urgency === 'DUE_SOON';
                return (
                  <Link
                    key={dl.id}
                    to={`/claims/${dl.claimId}`}
                    className={cn(
                      'p-3 border-l-2 rounded flex items-center justify-between cursor-pointer transition-all block',
                      isOverdue && 'bg-error/5 border-error hover:bg-error/10',
                      isDueSoon &&
                        'bg-tertiary-container/5 border-tertiary-container hover:bg-tertiary-container/10',
                      !isOverdue &&
                        !isDueSoon &&
                        'bg-surface-container border-surface-container hover:bg-surface-container-high',
                    )}
                  >
                    <div>
                      <p
                        className={cn(
                          'text-xs font-bold uppercase mb-0.5',
                          isOverdue && 'text-error',
                          isDueSoon && 'text-tertiary-container',
                          !isOverdue && !isDueSoon && 'text-slate-500',
                        )}
                      >
                        {dl.urgency === 'OVERDUE'
                          ? 'Overdue'
                          : dl.urgency === 'DUE_TODAY'
                            ? 'Due in 18h'
                            : dl.urgency === 'DUE_SOON'
                              ? 'Due in 2d'
                              : dl.dueDate}
                      </p>
                      <p className="text-sm font-semibold text-on-surface">{dl.title}</p>
                    </div>
                    <span className="text-[10px] font-bold text-on-surface-variant">
                      {dl.claimNumber}
                    </span>
                  </Link>
                );
              })}

              {deadlinesQuery.isLoading && (
                <p className="text-sm text-slate-400 text-center py-4">
                  Loading deadlines...
                </p>
              )}
            </div>
          </section>

          {/* Compliance Score */}
          <section className="bg-surface-container-lowest rounded-2xl p-6 ambient-shadow relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl" />
            <h3 className="text-lg font-bold text-on-surface mb-6">Compliance Score</h3>

            <div className="flex flex-col items-center mb-8">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-surface-container"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 58}`}
                    strokeDashoffset={`${2 * Math.PI * 58 * (1 - (compliance?.overallScore ?? 0) / 100)}`}
                    className="text-secondary"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold text-on-surface">
                    {compliance?.overallScore ?? '--'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                    OF 100
                  </span>
                </div>
              </div>
              {compliance && (
                <p className="mt-4 text-xs font-bold text-secondary flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {compliance.trend >= 0 ? '+' : ''}
                  {compliance.trend}% FROM LAST MONTH
                </p>
              )}
            </div>

            <div className="space-y-4">
              <ComplianceBar
                label="Deadline Adherence"
                value={compliance?.deadlineAdherence ?? 0}
                colorClass="bg-secondary"
              />
              <ComplianceBar
                label="Training Completion"
                value={compliance?.trainingCompletion ?? 0}
                colorClass="bg-tertiary-container"
              />
              <ComplianceBar
                label="UPL Compliance"
                value={compliance?.uplCompliance ?? 0}
                colorClass="bg-secondary"
              />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

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
      <div className="h-1 w-full bg-surface-container rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full', colorClass)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
