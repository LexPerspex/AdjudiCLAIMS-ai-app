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
  Send,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  useClaimReferrals,
  useCreateReferral,
  useUpdateReferralStatus,
  type Referral,
  type ReferralStatus,
} from '~/hooks/api/use-referrals';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function referralStatusConfig(status: ReferralStatus) {
  switch (status) {
    case 'CLOSED':
      return {
        label: 'CLOSED',
        icon: XCircle,
        badge: 'bg-surface-container-high text-on-surface-variant',
      };
    case 'RESPONDED':
      return {
        label: 'RESPONDED',
        icon: CheckCircle,
        badge: 'bg-secondary-fixed-dim text-on-secondary-fixed-variant',
      };
    case 'SENT':
      return {
        label: 'SENT',
        icon: Loader2,
        badge: 'bg-primary-fixed text-primary',
      };
    default:
      return {
        label: 'PENDING',
        icon: Clock,
        badge: 'bg-surface-container-high text-on-surface-variant',
      };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
  onCreate: (params: { legalIssue: string }) => void;
  isCreating: boolean;
}) {
  const [legalIssue, setLegalIssue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!legalIssue.trim()) return;
    onCreate({ legalIssue: legalIssue.trim() });
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
              legal conclusions may only be made by licensed counsel. AdjudiCLAIMS will
              generate a factual claim summary for counsel; the text below is forwarded
              verbatim.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Legal Issue *
            </label>
            <textarea
              value={legalIssue}
              onChange={(e) => { setLegalIssue(e.target.value); }}
              required
              rows={5}
              placeholder="Describe the legal issue requiring counsel review..."
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
              disabled={!legalIssue.trim() || isCreating}
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
/*  Send to Counsel Modal — collects email, transitions PENDING → SENT */
/* ------------------------------------------------------------------ */

function SendToCounselModal({
  referral,
  onClose,
  onSend,
  isSubmitting,
}: {
  referral: Referral;
  onClose: () => void;
  onSend: (counselEmail: string) => void;
  isSubmitting: boolean;
}) {
  const [counselEmail, setCounselEmail] = useState(referral.counselEmail ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!counselEmail.trim()) return;
    onSend(counselEmail.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5 m-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-on-surface">Send to Counsel</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
          >
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        <p className="text-xs text-on-surface-variant">
          The factual summary will be emailed to defense counsel. You will be CC&apos;d
          on the message so you retain a record. The legal issue text is forwarded
          verbatim — no AI characterization is added.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Defense Counsel Email *
            </label>
            <input
              type="email"
              value={counselEmail}
              onChange={(e) => { setCounselEmail(e.target.value); }}
              required
              placeholder="counsel@firm.example"
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-surface-container-high text-on-surface-variant rounded-lg text-sm font-bold hover:bg-surface-container-highest transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!counselEmail.trim() || isSubmitting}
              className="flex-1 primary-gradient text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
            >
              {isSubmitting ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mark Responded Modal — collects response, transitions SENT → RESPONDED */
/* ------------------------------------------------------------------ */

function MarkRespondedModal({
  onClose,
  onSubmit,
  isSubmitting,
}: {
  onClose: () => void;
  onSubmit: (counselResponse: string) => void;
  isSubmitting: boolean;
}) {
  const [counselResponse, setCounselResponse] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!counselResponse.trim()) return;
    onSubmit(counselResponse.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5 m-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-on-surface">Mark Responded</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
          >
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        <p className="text-xs text-on-surface-variant">
          Record counsel&apos;s response (verbatim or summary). This text is stored
          on the referral record for audit purposes.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Counsel Response *
            </label>
            <textarea
              value={counselResponse}
              onChange={(e) => { setCounselResponse(e.target.value); }}
              required
              rows={5}
              placeholder="Enter counsel's response..."
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-surface-container-high text-on-surface-variant rounded-lg text-sm font-bold hover:bg-surface-container-highest transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!counselResponse.trim() || isSubmitting}
              className="flex-1 primary-gradient text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
            >
              {isSubmitting ? 'Saving...' : 'Save Response'}
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
  const updateMutation = useUpdateReferralStatus(claimId ?? '');
  const [showForm, setShowForm] = useState(false);
  const [sendingReferral, setSendingReferral] = useState<Referral | null>(null);
  const [respondingReferral, setRespondingReferral] = useState<Referral | null>(null);

  const referrals = referralsQuery.data ?? [];

  function handleClose(referralId: string) {
    updateMutation.mutate({ referralId, status: 'CLOSED' });
  }

  function handleSend(counselEmail: string) {
    if (!sendingReferral) return;
    updateMutation.mutate(
      {
        referralId: sendingReferral.id,
        status: 'SENT',
        counselEmail,
      },
      {
        onSuccess: () => { setSendingReferral(null); },
      },
    );
  }

  function handleResponded(counselResponse: string) {
    if (!respondingReferral) return;
    updateMutation.mutate(
      {
        referralId: respondingReferral.id,
        status: 'RESPONDED',
        counselResponse,
      },
      {
        onSuccess: () => { setRespondingReferral(null); },
      },
    );
  }

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
          onClose={() => { setShowForm(false); }}
          onCreate={(params) => {
            createMutation.mutate(params, {
              onSuccess: () => { setShowForm(false); },
            });
          }}
          isCreating={createMutation.isPending}
        />
      )}

      {sendingReferral && (
        <SendToCounselModal
          referral={sendingReferral}
          onClose={() => { setSendingReferral(null); }}
          onSend={handleSend}
          isSubmitting={updateMutation.isPending}
        />
      )}

      {respondingReferral && (
        <MarkRespondedModal
          onClose={() => { setRespondingReferral(null); }}
          onSubmit={handleResponded}
          isSubmitting={updateMutation.isPending}
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
            onClick={() => { setShowForm(true); }}
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
              const StatusIcon = statusCfg.icon;
              const canSend = referral.status === 'PENDING';
              const canRespond = referral.status === 'SENT';
              const canClose = referral.status !== 'CLOSED';

              return (
                <li key={referral.id} className="px-6 py-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <UserPlus className="w-5 h-5 text-error" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface">
                          {referral.legalIssue}
                        </p>
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
                        </div>
                        {referral.counselEmail && (
                          <p className="text-xs text-primary font-medium mt-1">
                            Counsel: {referral.counselEmail}
                          </p>
                        )}
                        {referral.counselResponse && (
                          <p className="text-xs text-on-surface-variant mt-1 italic">
                            &ldquo;{referral.counselResponse}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-on-surface-variant">
                          {formatDate(referral.createdAt)}
                        </p>
                        {referral.respondedAt && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Responded {formatDate(referral.respondedAt)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    {(canSend || canRespond || canClose) && (
                      <div className="flex gap-2 mt-3">
                        {canSend && (
                          <button
                            onClick={() => { setSendingReferral(referral); }}
                            disabled={updateMutation.isPending}
                            className="px-3 py-1.5 bg-primary text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                          >
                            <Send className="w-3 h-3" />
                            Send to Counsel
                          </button>
                        )}
                        {canRespond && (
                          <button
                            onClick={() => { setRespondingReferral(referral); }}
                            disabled={updateMutation.isPending}
                            className="px-3 py-1.5 bg-secondary text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                          >
                            <MessageSquare className="w-3 h-3" />
                            Mark Responded
                          </button>
                        )}
                        {canClose && (
                          <button
                            onClick={() => { handleClose(referral.id); }}
                            disabled={updateMutation.isPending}
                            className="px-3 py-1.5 bg-surface-container-high text-on-surface-variant text-[11px] font-bold rounded-lg flex items-center gap-1.5 hover:bg-surface-container-highest transition-all disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" />
                            Close
                          </button>
                        )}
                      </div>
                    )}
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
