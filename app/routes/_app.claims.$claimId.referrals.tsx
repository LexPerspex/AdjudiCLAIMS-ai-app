import { useState } from 'react';
import { useParams } from 'react-router';
import {
  AlertCircle,
  RefreshCw,
  UserPlus,
  Plus,
  X,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  useClaimReferrals,
  useCreateReferral,
  type Referral,
} from '~/hooks/api/use-referrals';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function referralStatusConfig(status: Referral['status']) {
  switch (status) {
    case 'RESOLVED':
      return {
        label: 'RESOLVED',
        icon: CheckCircle,
        className: 'text-secondary',
        badge: 'bg-secondary-fixed-dim text-on-secondary-fixed-variant',
      };
    case 'IN_PROGRESS':
      return {
        label: 'IN PROGRESS',
        icon: Loader2,
        className: 'text-primary',
        badge: 'bg-primary-fixed text-primary',
      };
    case 'ACKNOWLEDGED':
      return {
        label: 'ACKNOWLEDGED',
        icon: CheckCircle,
        className: 'text-tertiary-container',
        badge: 'bg-tertiary-fixed text-tertiary',
      };
    default:
      return {
        label: 'PENDING',
        icon: Clock,
        className: 'text-slate-400',
        badge: 'bg-surface-container-high text-on-surface-variant',
      };
  }
}

function urgencyConfig(urgency: Referral['urgency']) {
  switch (urgency) {
    case 'EMERGENCY':
      return { label: 'EMERGENCY', className: 'bg-error text-white' };
    case 'URGENT':
      return { label: 'URGENT', className: 'bg-tertiary-container text-white' };
    default:
      return { label: 'ROUTINE', className: 'bg-surface-container-high text-on-surface-variant' };
  }
}

/* ------------------------------------------------------------------ */
/*  New Referral Form Modal                                            */
/* ------------------------------------------------------------------ */

function NewReferralForm({
  onClose,
  onCreate,
  isCreating,
}: {
  onClose: () => void;
  onCreate: (params: {
    reason: string;
    urgency: Referral['urgency'];
    notes?: string;
    uplClassification?: string;
  }) => void;
  isCreating: boolean;
}) {
  const [reason, setReason] = useState('');
  const [urgency, setUrgency] = useState<Referral['urgency']>('ROUTINE');
  const [notes, setNotes] = useState('');
  const [uplClassification, setUplClassification] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    onCreate({
      reason: reason.trim(),
      urgency,
      notes: notes.trim() || undefined,
      uplClassification: uplClassification.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-5 m-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-on-surface">New Counsel Referral</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
          >
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        <div className="bg-error/5 border border-error/20 rounded-lg px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
            <p className="text-xs text-on-surface">
              This referral is for issues requiring attorney analysis. Per UPL guidelines,
              legal conclusions may only be made by licensed counsel.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Reason for Referral *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              placeholder="Describe the legal issue requiring counsel review..."
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Urgency
            </label>
            <div className="flex gap-2">
              {(['ROUTINE', 'URGENT', 'EMERGENCY'] as Referral['urgency'][]).map((u) => {
                const cfg = urgencyConfig(u);
                return (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUrgency(u)}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all border',
                      urgency === u
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-outline-variant/20 bg-surface-container-low text-on-surface-variant hover:border-primary/30',
                    )}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              UPL Classification (from AI)
            </label>
            <input
              value={uplClassification}
              onChange={(e) => setUplClassification(e.target.value)}
              placeholder="e.g. RED — legal analysis required"
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Additional Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional context for defense counsel..."
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-surface-container-high text-on-surface-variant rounded-lg text-sm font-bold hover:bg-surface-container-highest transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!reason.trim() || isCreating}
              className="flex-1 primary-gradient text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
            >
              {isCreating ? 'Creating...' : 'Create Referral'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Referrals Tab                                                      */
/* ------------------------------------------------------------------ */

export default function ClaimReferralsTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const referralsQuery = useClaimReferrals(claimId ?? '');
  const createMutation = useCreateReferral(claimId ?? '');
  const [showForm, setShowForm] = useState(false);

  const referrals = referralsQuery.data ?? [];

  if (referralsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading referrals...</p>
      </div>
    );
  }

  if (referralsQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load referrals.</p>
        <button
          onClick={() => void referralsQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {showForm && (
        <NewReferralForm
          onClose={() => setShowForm(false)}
          onCreate={(params) => {
            createMutation.mutate(params, {
              onSuccess: () => setShowForm(false),
            });
          }}
          isCreating={createMutation.isPending}
        />
      )}

      <section className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between">
          <h3 className="text-lg font-bold text-on-surface">
            Counsel Referrals
            {referrals.length > 0 && (
              <span className="ml-2 text-sm font-normal text-on-surface-variant">
                ({referrals.length})
              </span>
            )}
          </h3>
          <button
            onClick={() => setShowForm(true)}
            className="primary-gradient text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            New Referral
          </button>
        </div>

        {referrals.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <UserPlus className="w-10 h-10 text-slate-300" />
            <p className="text-sm text-on-surface-variant">No referrals on this claim.</p>
            <p className="text-xs text-slate-400">
              Create a referral when a legal issue requires counsel review.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-container">
            {referrals.map((referral) => {
              const statusCfg = referralStatusConfig(referral.status);
              const urgCfg = urgencyConfig(referral.urgency);
              const StatusIcon = statusCfg.icon;

              return (
                <li key={referral.id} className="px-6 py-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <UserPlus className="w-5 h-5 text-error" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface">{referral.reason}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                              statusCfg.badge,
                            )}
                          >
                            <StatusIcon className="w-3 h-3 inline mr-1" />
                            {statusCfg.label}
                          </span>
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                              urgCfg.className,
                            )}
                          >
                            {urgCfg.label}
                          </span>
                          {referral.uplClassification && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-error/10 text-error">
                              {referral.uplClassification}
                            </span>
                          )}
                        </div>
                        {referral.notes && (
                          <p className="text-xs text-on-surface-variant mt-1">{referral.notes}</p>
                        )}
                        {referral.counselName && (
                          <p className="text-xs text-primary font-medium mt-1">
                            {referral.counselName}
                            {referral.counselFirm && ` · ${referral.counselFirm}`}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-on-surface-variant">
                          {new Date(referral.referredAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                        {referral.referredBy && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            by {referral.referredBy}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
