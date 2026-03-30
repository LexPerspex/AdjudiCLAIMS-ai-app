import { useState } from 'react';
import { useParams } from 'react-router';
import {
  AlertCircle,
  RefreshCw,
  DollarSign,
  FileText,
  TrendingDown,
  Activity,
  PlusCircle,
  X,
  Info,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  useMedicalOverview,
  useMedicalPayments,
  useRecordMedicalPayment,
  useProviderSummary,
} from '~/hooks/api/use-medical-billing';
import { useClaimBodyParts } from '~/hooks/api/use-coverage';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
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
  value,
  colorClass,
  icon: Icon,
  subtitle,
}: {
  label: string;
  value: string;
  colorClass: string;
  icon: React.ElementType;
  subtitle?: string;
}) {
  return (
    <div className="bg-surface-container-low rounded-xl p-4 flex items-start gap-3">
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          colorClass,
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
        <p className="text-xl font-extrabold text-on-surface">{value}</p>
        {subtitle && <p className="text-[10px] text-on-surface-variant mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Record Payment Modal                                               */
/* ------------------------------------------------------------------ */

const PAYMENT_TYPES = [
  'TREATMENT',
  'SURGERY',
  'PHARMACY',
  'DURABLE_MEDICAL_EQUIPMENT',
  'DIAGNOSTIC',
  'LIEN_SETTLEMENT',
  'OTHER',
] as const;

function RecordPaymentModal({
  claimId,
  onClose,
}: {
  claimId: string;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split('T')[0] ?? '',
  );
  const [bodyPartId, setBodyPartId] = useState('');
  const [description, setDescription] = useState('');

  const bodyPartsQuery = useClaimBodyParts(claimId);
  const recordMutation = useRecordMedicalPayment(claimId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!provider.trim() || isNaN(parsedAmount) || !paymentType || !paymentDate) return;
    recordMutation.mutate(
      {
        provider: provider.trim(),
        amount: parsedAmount,
        paymentType,
        paymentDate,
        bodyPartId: bodyPartId || undefined,
        description: description.trim() || undefined,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <h3 className="text-base font-bold text-on-surface">Record Medical Payment</h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Provider *
              </label>
              <input
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Provider name"
                className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Amount *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  $
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full bg-surface-container-low rounded-lg pl-7 pr-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Payment Type *
              </label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
                required
              >
                <option value="">Select type...</option>
                {PAYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Payment Date *
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Body Part (optional)
              </label>
              <select
                value={bodyPartId}
                onChange={(e) => setBodyPartId(e.target.value)}
                className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
              >
                <option value="">Unlinked</option>
                {(bodyPartsQuery.data ?? []).map((bp) => (
                  <option key={bp.id} value={bp.id}>
                    {bp.bodyPartName}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Payment description..."
                className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                recordMutation.isPending ||
                !provider.trim() ||
                !amount ||
                !paymentType ||
                !paymentDate
              }
              className="px-5 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {recordMutation.isPending ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Medicals Tab                                                       */
/* ------------------------------------------------------------------ */

export default function ClaimMedicalsTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const overviewQuery = useMedicalOverview(claimId ?? '');
  const paymentsQuery = useMedicalPayments(claimId ?? '');
  const providersQuery = useProviderSummary(claimId ?? '');
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const isLoading = overviewQuery.isLoading;
  const isError = overviewQuery.isError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading medical billing data...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load medical billing data.</p>
        <button
          onClick={() => void overviewQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const overview = overviewQuery.data;
  const payments = paymentsQuery.data ?? [];
  const providers = providersQuery.data ?? [];

  return (
    <>
      {showPaymentModal && claimId && (
        <RecordPaymentModal claimId={claimId} onClose={() => setShowPaymentModal(false)} />
      )}

      <div className="flex flex-col gap-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-on-surface">
              Medical Billing Overview
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Payments, reserves, liens, and OMFS analysis
            </p>
          </div>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold hover:opacity-90 active:scale-95 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            Record Payment
          </button>
        </div>

        {/* Top 4 summary cards */}
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            label="Medical Reserve"
            value={formatCurrency(overview?.medicalReserve ?? 0)}
            colorClass="bg-secondary-container text-on-secondary-container"
            icon={DollarSign}
          />
          <SummaryCard
            label="Liens Outstanding"
            value={formatCurrency(overview?.liensOutstanding ?? 0)}
            colorClass="bg-error-container text-on-error-container"
            icon={FileText}
          />
          <SummaryCard
            label="Total Medical Paid"
            value={formatCurrency(overview?.totalMedicalPaid ?? 0)}
            colorClass="bg-secondary-fixed-dim text-on-secondary-fixed-variant"
            icon={Activity}
          />
          <SummaryCard
            label="Net Exposure"
            value={formatCurrency(overview?.netExposure ?? 0)}
            colorClass="bg-tertiary-container text-on-tertiary-container"
            icon={TrendingDown}
          />
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* OMFS comparison card */}
          <div className="col-span-5 bg-surface-container-lowest rounded-2xl ambient-shadow p-6">
            <h3 className="text-base font-bold text-on-surface mb-4">OMFS Analysis</h3>
            {overview?.omfsComparison ? (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
                  <span className="text-sm text-on-surface-variant">Total Billed</span>
                  <span className="text-sm font-bold text-on-surface">
                    {formatCurrency(overview.omfsComparison.totalBilled)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
                  <span className="text-sm text-on-surface-variant">OMFS Allowed</span>
                  <span className="text-sm font-bold text-secondary">
                    {formatCurrency(overview.omfsComparison.totalAllowed)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
                  <span className="text-sm text-on-surface-variant">Discrepancy</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-error">
                      {formatCurrency(overview.omfsComparison.discrepancyAmount)}
                    </span>
                    <p className="text-[10px] text-error/70">
                      {overview.omfsComparison.discrepancyPercent.toFixed(1)}% over OMFS
                    </p>
                  </div>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-on-surface-variant">Overcharge Line Items</span>
                  <span className="text-sm font-bold text-error">
                    {overview.omfsComparison.overchargeCount}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant text-center py-8">
                No OMFS data available.
              </p>
            )}
          </div>

          {/* Admitted vs non-admitted card */}
          <div className="col-span-7 bg-surface-container-lowest rounded-2xl ambient-shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-bold text-on-surface">
                Medical by Coverage Status
              </h3>
            </div>
            {overview?.admittedBodyPartTotals ? (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
                  <div>
                    <span className="text-sm font-semibold text-on-surface">Admitted Body Parts</span>
                    <span className="ml-2 px-1.5 py-0.5 bg-secondary-fixed-dim text-on-secondary-fixed-variant text-[10px] font-bold rounded-full uppercase">
                      Compensable
                    </span>
                  </div>
                  <span className="text-sm font-bold text-on-surface">
                    {formatCurrency(overview.admittedBodyPartTotals.admitted)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
                  <div>
                    <span className="text-sm font-semibold text-on-surface">Denied Body Parts</span>
                    <span className="ml-2 px-1.5 py-0.5 bg-error-container text-on-error-container text-[10px] font-bold rounded-full uppercase">
                      Denied
                    </span>
                  </div>
                  <span className="text-sm font-bold text-error">
                    {formatCurrency(overview.admittedBodyPartTotals.denied)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
                  <div>
                    <span className="text-sm font-semibold text-on-surface">Pending Determination</span>
                    <span className="ml-2 px-1.5 py-0.5 bg-tertiary-container text-on-tertiary-container text-[10px] font-bold rounded-full uppercase">
                      Pending
                    </span>
                  </div>
                  <span className="text-sm font-bold text-on-surface">
                    {formatCurrency(overview.admittedBodyPartTotals.pending)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <div>
                    <span className="text-sm font-semibold text-on-surface">Unlinked Payments</span>
                    <span className="ml-2 px-1.5 py-0.5 bg-surface-container text-on-surface-variant text-[10px] font-bold rounded-full uppercase">
                      Unlinked
                    </span>
                  </div>
                  <span className="text-sm font-bold text-on-surface-variant">
                    {formatCurrency(overview.admittedBodyPartTotals.unlinked)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant text-center py-8">
                No coverage data available.
              </p>
            )}

            {/* YELLOW zone disclaimer */}
            <div className="mt-4 flex items-start gap-2 p-3 bg-tertiary-container/20 rounded-lg border border-tertiary-container/30">
              <Info className="w-3.5 h-3.5 text-on-tertiary-container flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Whether treatment for a non-admitted body part is compensable is a legal
                determination. Consult defense counsel regarding lien compensability.
              </p>
            </div>
          </div>
        </div>

        {/* Provider summary table */}
        <section className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-container">
            <h3 className="text-base font-bold text-on-surface">
              Provider Summary ({providers.length})
            </h3>
          </div>
          {providersQuery.isLoading ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading providers...</p>
          ) : providers.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">
              No provider data available.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Provider
                    </th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                      Total Billed
                    </th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                      Total Paid
                    </th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                      Outstanding
                    </th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                      Liens
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {providers.map((p, i) => (
                    <tr key={i} className="hover:bg-surface-container-low/40 transition-colors">
                      <td className="px-6 py-3 text-sm font-semibold text-on-surface">
                        {p.providerName}
                      </td>
                      <td className="px-6 py-3 text-sm text-on-surface-variant text-right">
                        {formatCurrency(p.totalBilled)}
                      </td>
                      <td className="px-6 py-3 text-sm font-bold text-secondary text-right">
                        {formatCurrency(p.totalPaid)}
                      </td>
                      <td className="px-6 py-3 text-sm font-bold text-error text-right">
                        {formatCurrency(p.outstanding)}
                      </td>
                      <td className="px-6 py-3 text-sm text-on-surface text-right">
                        {p.lienCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Medical billing timeline */}
        {payments.length > 0 && (
          <section className="bg-surface-container-lowest rounded-2xl ambient-shadow p-6">
            <h3 className="text-base font-bold text-on-surface mb-4">
              Medical Payment History ({payments.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Date
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Type
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Body Part
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Description
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-surface-container-low/40 transition-colors">
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {formatDate(payment.paymentDate)}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-on-surface">
                        {payment.provider}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-[10px] font-bold uppercase tracking-wider">
                          {payment.paymentType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {payment.bodyPartName ?? '--'}
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {payment.description ?? '--'}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-secondary text-right">
                        {formatCurrency(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* YELLOW zone disclaimer */}
        <div className="flex items-start gap-3 p-4 bg-surface-container rounded-xl border border-outline-variant/20">
          <Info className="w-4 h-4 text-on-surface-variant flex-shrink-0 mt-0.5" />
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Whether treatment for a non-admitted body part is compensable is a legal determination.
            Consult defense counsel regarding lien compensability.
          </p>
        </div>
      </div>
    </>
  );
}
