import { useState } from 'react';
import { useParams } from 'react-router';
import {
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Scale,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { useClaimLiens, useClaimLienExposure, useUpdateLien, type Lien } from '~/hooks/api/use-liens';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const statusConfig: Record<string, { label: string; className: string }> = {
  RECEIVED: { label: 'Received', className: 'bg-surface-container-high text-on-surface' },
  UNDER_REVIEW: { label: 'Under Review', className: 'bg-tertiary-container text-on-tertiary-container' },
  OMFS_COMPARED: { label: 'OMFS Compared', className: 'bg-tertiary-fixed text-on-tertiary-fixed' },
  NEGOTIATING: { label: 'Negotiating', className: 'bg-secondary-container text-on-secondary-container' },
  PAID_IN_FULL: { label: 'Paid in Full', className: 'bg-secondary-fixed-dim text-on-secondary-fixed-variant' },
  PAID_REDUCED: { label: 'Paid Reduced', className: 'bg-secondary-fixed-dim text-on-secondary-fixed-variant' },
  DISPUTED: { label: 'Disputed', className: 'bg-error-container text-on-error-container' },
  WCAB_HEARING: { label: 'WCAB Hearing', className: 'bg-error-container text-on-error-container' },
  RESOLVED_BY_ORDER: { label: 'Resolved by Order', className: 'bg-surface-container text-on-surface-variant' },
  WITHDRAWN: { label: 'Withdrawn', className: 'bg-surface-container text-on-surface-variant' },
};

function getLienStatusConfig(status: string) {
  return statusConfig[status] ?? { label: status, className: 'bg-surface-container text-on-surface-variant' };
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/* ------------------------------------------------------------------ */
/*  Lien Row                                                           */
/* ------------------------------------------------------------------ */

function LienRow({
  lien,
  onStatusChange,
  isUpdating,
}: {
  lien: Lien;
  onStatusChange: (lienId: string, status: Lien['status']) => void;
  isUpdating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = getLienStatusConfig(lien.status);
  const omfsDiff =
    lien.totalOmfsAllowed != null
      ? lien.totalAmountClaimed - lien.totalOmfsAllowed
      : undefined;

  const isActionable =
    lien.status === 'RECEIVED' || lien.status === 'UNDER_REVIEW' || lien.status === 'OMFS_COMPARED';

  return (
    <>
      <tr className="hover:bg-surface-container-low transition-colors">
        <td className="px-6 py-4">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-on-surface hover:text-primary transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            )}
            {lien.lienClaimant}
          </button>
          <p className="text-xs text-on-surface-variant ml-6 mt-0.5">{lien.lienType}</p>
          {lien.wcabCaseNumber && (
            <p className="text-[10px] text-slate-400 ml-6 mt-0.5 font-mono">
              WCAB: {lien.wcabCaseNumber}
            </p>
          )}
        </td>
        <td className="px-6 py-4 text-sm font-bold text-on-surface text-right">
          {formatCurrency(lien.totalAmountClaimed)}
        </td>
        <td className="px-6 py-4 text-right">
          {lien.totalOmfsAllowed != null ? (
            <div>
              <span className="text-sm text-on-surface-variant">
                {formatCurrency(lien.totalOmfsAllowed)}
              </span>
              {omfsDiff !== undefined && omfsDiff > 0 && (
                <p className="text-[10px] text-error font-bold mt-0.5">
                  +{formatCurrency(omfsDiff)} over OMFS
                </p>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400">--</span>
          )}
        </td>
        <td className="px-6 py-4">
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
              cfg.className,
            )}
          >
            {cfg.label}
          </span>
        </td>
        <td className="px-6 py-4 text-right">
          {isActionable && (
            <div className="flex gap-2 justify-end">
              <button
                disabled={isUpdating}
                onClick={() => onStatusChange(lien.id, 'NEGOTIATING')}
                className="px-3 py-1.5 bg-secondary text-white rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
              >
                Negotiate
              </button>
              <button
                disabled={isUpdating}
                onClick={() => onStatusChange(lien.id, 'DISPUTED')}
                className="px-3 py-1.5 bg-error-container text-on-error-container rounded-lg text-xs font-bold hover:opacity-90 transition-all disabled:opacity-50"
              >
                Dispute
              </button>
            </div>
          )}
        </td>
      </tr>
      {expanded && lien.lineItems && lien.lineItems.length > 0 && (
        <tr>
          <td colSpan={5} className="px-6 pb-4">
            <div className="ml-6 bg-surface-container-low rounded-lg overflow-hidden border border-outline-variant/10">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-outline-variant/10">
                    <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Service Date
                    </th>
                    <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      CPT Code
                    </th>
                    <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Description
                    </th>
                    <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                      Amount Claimed
                    </th>
                    <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                      OMFS Rate
                    </th>
                    <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">
                      Overcharge
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {lien.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-xs text-on-surface-variant">
                        {new Date(item.serviceDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-2 text-xs font-mono text-on-surface">
                        {item.cptCode ?? '--'}
                      </td>
                      <td className="px-4 py-2 text-xs text-on-surface">{item.description}</td>
                      <td className="px-4 py-2 text-xs font-bold text-on-surface text-right">
                        {formatCurrency(item.amountClaimed)}
                      </td>
                      <td className="px-4 py-2 text-xs text-on-surface-variant text-right">
                        {item.omfsRate != null ? formatCurrency(item.omfsRate) : '--'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {item.isOvercharge ? (
                          <span className="text-[10px] font-bold text-error">
                            +{item.overchargeAmount != null ? formatCurrency(item.overchargeAmount) : 'YES'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Liens Tab                                                          */
/* ------------------------------------------------------------------ */

export default function ClaimLiensTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const liensQuery = useClaimLiens(claimId ?? '');
  const exposureQuery = useClaimLienExposure(claimId ?? '');
  const updateMutation = useUpdateLien(claimId ?? '');

  if (liensQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading liens...</p>
      </div>
    );
  }

  if (liensQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load liens.</p>
        <button
          onClick={() => void liensQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const liens = liensQuery.data ?? [];
  const exposure = exposureQuery.data;

  if (liens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Scale className="w-10 h-10 text-slate-300" />
        <p className="text-sm text-on-surface-variant">No liens filed on this claim.</p>
      </div>
    );
  }

  const updatingId = (updateMutation.variables as { lienId: string } | undefined)?.lienId;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface-container-low rounded-xl p-4 flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-error" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Total Claimed
            </p>
            <p className="text-lg font-extrabold text-on-surface">
              {formatCurrency(exposure?.summary.totalClaimed ?? 0)}
            </p>
          </div>
        </div>
        <div className="bg-surface-container-low rounded-xl p-4 flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-secondary" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              OMFS Allowed
            </p>
            <p className="text-lg font-extrabold text-on-surface">
              {formatCurrency(exposure?.summary.totalOmfsAllowed ?? 0)}
            </p>
          </div>
        </div>
        <div className="bg-surface-container-low rounded-xl p-4 flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-tertiary-container" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Net Exposure
            </p>
            <p className="text-lg font-extrabold text-on-surface">
              {formatCurrency(exposure?.exposure ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Liens Table */}
      <section className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-container">
          <h3 className="text-lg font-bold text-on-surface">Filed Liens ({liens.length})</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {exposure?.summary.openCount ?? 0} open · {exposure?.summary.resolvedCount ?? 0} resolved
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Lien Claimant
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                  Amount Claimed
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                  OMFS Allowance
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Status
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {liens.map((lien) => (
                <LienRow
                  key={lien.id}
                  lien={lien}
                  onStatusChange={(lienId, status) => updateMutation.mutate({ lienId, status })}
                  isUpdating={updateMutation.isPending && updatingId === lien.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
