import { Outlet, NavLink, useParams } from 'react-router';
import {
  Play,
  Mail,
  Gavel,
  TrendingUp,
  Sprout,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { useClaim } from '~/hooks/api/use-claims';

/* ------------------------------------------------------------------ */
/*  Graph maturity badge                                               */
/* ------------------------------------------------------------------ */

const maturityConfig: Record<string, { icon: React.ElementType; label: string; className: string }> = {
  SEED: { icon: Sprout, label: 'Seed', className: 'bg-surface-container text-on-surface-variant' },
  GROWING: { icon: TrendingUp, label: 'Growing', className: 'bg-secondary-container text-on-secondary-container' },
  MATURE: { icon: CheckCircle2, label: 'Mature', className: 'bg-secondary-fixed-dim text-on-secondary-fixed-variant' },
  COMPLETE: { icon: Sparkles, label: 'Complete', className: 'bg-primary-fixed text-primary' },
};

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function statusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'accepted':
      return 'bg-secondary-fixed-dim text-on-secondary-fixed-variant';
    case 'open':
      return 'bg-primary-fixed text-primary';
    case 'investigation':
      return 'bg-[#D97706] text-white';
    case 'denied':
      return 'bg-error-container text-on-error-container';
    default:
      return 'bg-surface-container text-on-surface-variant';
  }
}

/* ------------------------------------------------------------------ */
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */

const tabs = [
  { label: 'Overview', to: '.' },
  { label: 'Documents', to: 'documents' },
  { label: 'Deadlines', to: 'deadlines' },
  { label: 'Investigation', to: 'investigation' },
  { label: 'Workflows', to: 'workflows' },
  { label: 'Chat', to: 'chat' },
  { label: 'Letters', to: 'letters' },
  { label: 'Liens', to: 'liens' },
  { label: 'Timeline', to: 'timeline' },
  { label: 'Referrals', to: 'referrals' },
] as const;

/* ------------------------------------------------------------------ */
/*  Claim Detail Layout                                                */
/* ------------------------------------------------------------------ */

export default function ClaimDetailLayout() {
  const { claimId } = useParams<{ claimId: string }>();
  const claimQuery = useClaim(claimId ?? '');
  const claim = claimQuery.data;

  const maturity = claim?.graphMaturity
    ? maturityConfig[claim.graphMaturity]
    : undefined;
  const MaturityIcon = maturity?.icon;

  return (
    <div className="flex flex-col gap-6 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-on-background">
              {claim ? `Claim ${claim.claimNumber}` : 'Loading...'}
            </h1>
            {claim && (
              <span
                className={cn(
                  'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                  statusColor(claim.status),
                )}
              >
                {claim.status}
              </span>
            )}
            {maturity && MaturityIcon && (
              <span
                className={cn(
                  'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1',
                  maturity.className,
                )}
              >
                <MaturityIcon className="w-3 h-3" />
                {maturity.label}
              </span>
            )}
          </div>
          {claim && (
            <p className="text-on-surface-variant flex items-center gap-2 font-medium">
              Claimant:{' '}
              <span className="text-on-surface font-bold">{claim.claimantName}</span>
              <span className="text-outline-variant">&#x2022;</span>
              DOI:{' '}
              <span className="text-on-surface font-bold">{claim.dateOfInjury}</span>
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-primary text-sm font-bold hover:bg-surface-container-high transition-colors rounded-lg">
            <Play className="w-4 h-4" />
            Start Workflow
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-primary text-sm font-bold hover:bg-surface-container-high transition-colors rounded-lg">
            <Mail className="w-4 h-4" />
            Generate Letter
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-primary text-sm font-bold hover:bg-surface-container-high transition-colors rounded-lg border border-primary/10">
            <Gavel className="w-4 h-4" />
            Refer to Counsel
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <nav className="flex gap-8 border-b border-outline-variant/20">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={tab.to === '.'}
            className={({ isActive }) =>
              cn(
                'pb-3 text-sm font-medium transition-colors',
                isActive
                  ? 'font-bold border-b-2 border-primary text-primary'
                  : 'text-on-surface-variant hover:text-primary',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
