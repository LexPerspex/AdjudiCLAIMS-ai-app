import { useState } from 'react';
import { useParams } from 'react-router';
import {
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  PlusCircle,
  ChevronRight,
  Info,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  useClaimBodyParts,
  useCoverageSummary,
  useDeterminationHistory,
  useAddBodyPart,
  useRecordDetermination,
  type ClaimBodyPart,
  type CoverageDetermination,
} from '~/hooks/api/use-coverage';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const bodyPartStatusConfig: Record<
  string,
  { label: string; className: string; icon: React.ElementType }
> = {
  ADMITTED: {
    label: 'Admitted',
    className: 'bg-secondary-fixed-dim text-on-secondary-fixed-variant',
    icon: CheckCircle2,
  },
  DENIED: {
    label: 'Denied',
    className: 'bg-error-container text-on-error-container',
    icon: XCircle,
  },
  PENDING: {
    label: 'Pending',
    className: 'bg-tertiary-container text-on-tertiary-container',
    icon: Clock,
  },
  UNDER_INVESTIGATION: {
    label: 'Under Investigation',
    className: 'bg-secondary-container text-on-secondary-container',
    icon: Search,
  },
};

function getBodyPartStatusCfg(status: string) {
  return (
    bodyPartStatusConfig[status] ?? {
      label: status,
      className: 'bg-surface-container text-on-surface-variant',
      icon: Info,
    }
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* ------------------------------------------------------------------ */
/*  Summary Card                                                       */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  count,
  colorClass,
  icon: Icon,
}: {
  label: string;
  count: number;
  colorClass: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-surface-container-low rounded-xl p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', colorClass)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
        <p className="text-2xl font-extrabold text-on-surface">{count}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Body Part Badge Row                                                */
/* ------------------------------------------------------------------ */

function BodyPartRow({ part }: { part: ClaimBodyPart }) {
  const cfg = getBodyPartStatusCfg(part.status);
  const StatusIcon = cfg.icon;
  return (
    <div className="flex items-center justify-between py-3 border-b border-outline-variant/10 last:border-0">
      <div className="flex items-center gap-3">
        <StatusIcon className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-on-surface">{part.bodyPartName}</p>
          {part.icdCode && (
            <p className="text-[10px] font-mono text-slate-400 mt-0.5">{part.icdCode}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {part.statusChangedAt && (
          <p className="text-[10px] text-slate-400">{formatDate(part.statusChangedAt)}</p>
        )}
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
            cfg.className,
          )}
        >
          {cfg.label}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Determination History Entry                                        */
/* ------------------------------------------------------------------ */

function DeterminationEntry({ entry }: { entry: CoverageDetermination }) {
  const prevCfg = entry.previousStatus ? getBodyPartStatusCfg(entry.previousStatus) : null;
  const newCfg = getBodyPartStatusCfg(entry.newStatus);

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center flex-shrink-0">
          <ChevronRight className="w-4 h-4 text-primary" />
        </div>
        <div className="w-px flex-1 bg-outline-variant/20 mt-2" />
      </div>
      <div className="pb-6 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-on-surface">{entry.bodyPart.bodyPartName}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {prevCfg && (
                <>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                      prevCfg.className,
                    )}
                  >
                    {prevCfg.label}
                  </span>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                </>
              )}
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                  newCfg.className,
                )}
              >
                {newCfg.label}
              </span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-slate-400">{formatDate(entry.determinationDate)}</p>
            <p className="text-[10px] text-on-surface-variant mt-0.5">{entry.determinedBy.name}</p>
          </div>
        </div>
        <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">{entry.basis}</p>
        {entry.notes && (
          <p className="text-[11px] text-slate-400 mt-1 italic">{entry.notes}</p>
        )}
        {entry.counselReferral && (
          <div className="mt-2 p-3 bg-secondary-container/30 rounded-lg border border-secondary-container/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-secondary-container mb-1">
              Counsel Advice
            </p>
            <p className="text-xs text-on-surface-variant">{entry.counselReferral.legalIssue}</p>
            {entry.counselReferral.counselResponse && (
              <p className="text-xs text-on-surface mt-1">{entry.counselReferral.counselResponse}</p>
            )}
            {entry.counselReferral.respondedAt && (
              <p className="text-[10px] text-slate-400 mt-1">
                Responded: {formatDate(entry.counselReferral.respondedAt)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add Body Part Form                                                 */
/* ------------------------------------------------------------------ */

function AddBodyPartForm({
  claimId,
  onClose,
}: {
  claimId: string;
  onClose: () => void;
}) {
  const [bodyPartName, setBodyPartName] = useState('');
  const [icdCode, setIcdCode] = useState('');
  const addMutation = useAddBodyPart(claimId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bodyPartName.trim()) return;
    addMutation.mutate(
      { bodyPartName: bodyPartName.trim(), icdCode: icdCode.trim() || undefined },
      { onSuccess: onClose },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-low rounded-xl p-4 flex flex-col gap-3">
      <h4 className="text-sm font-bold text-on-surface">Add Body Part</h4>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Body Part Name *
          </label>
          <input
            type="text"
            value={bodyPartName}
            onChange={(e) => setBodyPartName(e.target.value)}
            placeholder="e.g. Lumbar Spine"
            className="w-full bg-surface-container rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
            required
          />
        </div>
        <div className="w-36">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            ICD Code (optional)
          </label>
          <input
            type="text"
            value={icdCode}
            onChange={(e) => setIcdCode(e.target.value)}
            placeholder="e.g. M54.5"
            className="w-full bg-surface-container rounded-lg px-3 py-2 text-sm font-mono text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={addMutation.isPending || !bodyPartName.trim()}
          className="px-4 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {addMutation.isPending ? 'Adding...' : 'Add Body Part'}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Record Determination Form                                          */
/* ------------------------------------------------------------------ */

const DETERMINATION_STATUSES = [
  { value: 'ADMITTED', label: 'Admitted' },
  { value: 'DENIED', label: 'Denied' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'UNDER_INVESTIGATION', label: 'Under Investigation' },
] as const;

function RecordDeterminationForm({
  claimId,
  bodyParts,
  onClose,
}: {
  claimId: string;
  bodyParts: ClaimBodyPart[];
  onClose: () => void;
}) {
  const [bodyPartId, setBodyPartId] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [determinationDate, setDeterminationDate] = useState(
    new Date().toISOString().split('T')[0] ?? '',
  );
  const [basis, setBasis] = useState('');
  const [notes, setNotes] = useState('');
  const recordMutation = useRecordDetermination(claimId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bodyPartId || !newStatus || !determinationDate || !basis.trim()) return;
    recordMutation.mutate(
      {
        bodyPartId,
        newStatus,
        determinationDate,
        basis: basis.trim(),
        notes: notes.trim() || undefined,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-container-low rounded-xl p-4 flex flex-col gap-3"
    >
      <h4 className="text-sm font-bold text-on-surface">Record Determination</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Body Part *
          </label>
          <select
            value={bodyPartId}
            onChange={(e) => setBodyPartId(e.target.value)}
            className="w-full bg-surface-container rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
            required
          >
            <option value="">Select body part...</option>
            {bodyParts.map((bp) => (
              <option key={bp.id} value={bp.id}>
                {bp.bodyPartName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            New Status *
          </label>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className="w-full bg-surface-container rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
            required
          >
            <option value="">Select status...</option>
            {DETERMINATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Determination Date *
          </label>
          <input
            type="date"
            value={determinationDate}
            onChange={(e) => setDeterminationDate(e.target.value)}
            className="w-full bg-surface-container rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
            required
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes..."
            className="w-full bg-surface-container rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
          Basis for Determination *
        </label>
        <textarea
          value={basis}
          onChange={(e) => setBasis(e.target.value)}
          rows={3}
          placeholder="Describe the factual and administrative basis for this determination..."
          className="w-full bg-surface-container rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary resize-none"
          required
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={
            recordMutation.isPending ||
            !bodyPartId ||
            !newStatus ||
            !determinationDate ||
            !basis.trim()
          }
          className="px-4 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {recordMutation.isPending ? 'Saving...' : 'Record Determination'}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Coverage Tab                                                       */
/* ------------------------------------------------------------------ */

export default function ClaimCoverageTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const bodyPartsQuery = useClaimBodyParts(claimId ?? '');
  const summaryQuery = useCoverageSummary(claimId ?? '');
  const historyQuery = useDeterminationHistory(claimId ?? '');

  const [showAddForm, setShowAddForm] = useState(false);
  const [showDetermineForm, setShowDetermineForm] = useState(false);

  const isLoading = bodyPartsQuery.isLoading || summaryQuery.isLoading;
  const isError = bodyPartsQuery.isError || summaryQuery.isError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading coverage data...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load coverage data.</p>
        <button
          onClick={() => {
            void bodyPartsQuery.refetch();
            void summaryQuery.refetch();
          }}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const summary = summaryQuery.data;
  const bodyParts = bodyPartsQuery.data ?? [];
  const history = historyQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-on-surface">
            Coverage / AOE-COE Status
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Administrative record of body part coverage determinations
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowDetermineForm((v) => !v);
              setShowAddForm(false);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold hover:opacity-90 active:scale-95 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
            Record Determination
          </button>
          <button
            onClick={() => {
              setShowAddForm((v) => !v);
              setShowDetermineForm(false);
            }}
            className="flex items-center gap-2 px-4 py-2 text-primary text-sm font-bold hover:bg-surface-container-high transition-colors rounded-lg border border-primary/20"
          >
            <PlusCircle className="w-4 h-4" />
            Add Body Part
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          label="Admitted"
          count={summary?.counts.admitted ?? 0}
          colorClass="bg-secondary-fixed-dim text-on-secondary-fixed-variant"
          icon={CheckCircle2}
        />
        <SummaryCard
          label="Denied"
          count={summary?.counts.denied ?? 0}
          colorClass="bg-error-container text-on-error-container"
          icon={XCircle}
        />
        <SummaryCard
          label="Pending"
          count={summary?.counts.pending ?? 0}
          colorClass="bg-tertiary-container text-on-tertiary-container"
          icon={Clock}
        />
        <SummaryCard
          label="Under Investigation"
          count={summary?.counts.underInvestigation ?? 0}
          colorClass="bg-secondary-container text-on-secondary-container"
          icon={Search}
        />
      </div>

      {/* Inline forms */}
      {showAddForm && claimId && (
        <AddBodyPartForm claimId={claimId} onClose={() => setShowAddForm(false)} />
      )}
      {showDetermineForm && claimId && (
        <RecordDeterminationForm
          claimId={claimId}
          bodyParts={bodyParts}
          onClose={() => setShowDetermineForm(false)}
        />
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Body Parts list */}
        <section className="col-span-5 bg-surface-container-lowest rounded-2xl ambient-shadow p-6">
          <h3 className="text-base font-bold text-on-surface mb-4">
            Body Parts ({bodyParts.length})
          </h3>
          {bodyParts.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">
              No body parts recorded yet.
            </p>
          ) : (
            <div>
              {bodyParts.map((part) => (
                <BodyPartRow key={part.id} part={part} />
              ))}
            </div>
          )}
        </section>

        {/* Determination history */}
        <section className="col-span-7 bg-surface-container-lowest rounded-2xl ambient-shadow p-6">
          <h3 className="text-base font-bold text-on-surface mb-4">
            Determination History
          </h3>
          {historyQuery.isLoading ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading history...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">
              No determinations recorded yet.
            </p>
          ) : (
            <div>
              {history.map((entry) => (
                <DeterminationEntry key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Counsel advice section */}
      {summary?.counselAdvice && summary.counselAdvice.length > 0 && (
        <section className="bg-surface-container-lowest rounded-2xl ambient-shadow p-6">
          <h3 className="text-base font-bold text-on-surface mb-4">Counsel Advice on Record</h3>
          <div className="grid grid-cols-2 gap-4">
            {summary.counselAdvice.map((advice, i) => (
              <div
                key={i}
                className="p-4 bg-secondary-container/20 rounded-xl border border-secondary-container/30"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-secondary-container mb-1">
                  {advice.bodyPartName}
                </p>
                <p className="text-xs font-semibold text-on-surface mb-2">{advice.legalIssue}</p>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {advice.counselResponse}
                </p>
                {advice.respondedAt && (
                  <p className="text-[10px] text-slate-400 mt-2">
                    {formatDate(advice.respondedAt)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* UPL disclaimer */}
      <div className="flex items-start gap-3 p-4 bg-surface-container rounded-xl border border-outline-variant/20">
        <Info className="w-4 h-4 text-on-surface-variant flex-shrink-0 mt-0.5" />
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Coverage status shown here is a factual record of administrative decisions made on this
          claim. It does not constitute legal analysis. For AOE/COE legal analysis or lien
          compensability questions, consult defense counsel.
        </p>
      </div>
    </div>
  );
}
