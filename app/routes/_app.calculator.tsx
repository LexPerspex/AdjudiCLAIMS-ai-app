import { useState } from 'react';
import { Calculator, AlertCircle, BookOpen, RefreshCw } from 'lucide-react';
import { cn } from '~/lib/utils';
import { PageHeader } from '~/components/layout/page-header';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TDCalculationInput {
  averageWeeklyEarnings: number;
  injuryDate: string;
  tdStartDate: string;
  tdEndDate?: string;
  partialReturnToWork?: boolean;
  modifiedDutyWage?: number;
}

interface TDCalculationResult {
  tdRate: number;
  maxTdRate: number;
  minTdRate: number;
  weeklyBenefit: number;
  dailyBenefit: number;
  tdDays?: number;
  tdWeeks?: number;
  estimatedTotalBenefit?: number;
  statutoryCitation: string;
  calculationMethod: string;
  notes: string[];
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

function useCalculateTD() {
  return useMutation({
    mutationFn: (input: TDCalculationInput) =>
      apiFetch<TDCalculationResult>('/calculator/td-rate', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

/* ------------------------------------------------------------------ */
/*  Result Card                                                        */
/* ------------------------------------------------------------------ */

function ResultCard({ result }: { result: TDCalculationResult }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-surface-container flex items-center gap-2">
        <Calculator className="w-5 h-5 text-primary" />
        <h3 className="text-base font-bold text-on-surface">Calculation Result</h3>
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* Primary result */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-primary/5 rounded-xl p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              TD Rate
            </p>
            <p className="text-3xl font-extrabold text-primary">
              {(result.tdRate * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-on-surface-variant mt-1">of AWE</p>
          </div>
          <div className="bg-secondary/5 rounded-xl p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              Weekly Benefit
            </p>
            <p className="text-3xl font-extrabold text-secondary">
              ${result.weeklyBenefit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">per week</p>
          </div>
          <div className="bg-tertiary-container/5 rounded-xl p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              Daily Benefit
            </p>
            <p className="text-3xl font-extrabold text-tertiary-container">
              ${result.dailyBenefit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">per day</p>
          </div>
        </div>

        {/* Rate limits */}
        <div className="flex gap-4 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Min Rate</span>
            <span className="font-semibold text-on-surface">
              ${result.minTdRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}/wk
            </span>
          </div>
          <div className="w-px bg-outline-variant/20" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Max Rate</span>
            <span className="font-semibold text-on-surface">
              ${result.maxTdRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}/wk
            </span>
          </div>
          {result.tdWeeks != null && (
            <>
              <div className="w-px bg-outline-variant/20" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Duration</span>
                <span className="font-semibold text-on-surface">
                  {result.tdWeeks.toFixed(1)} weeks ({result.tdDays} days)
                </span>
              </div>
            </>
          )}
          {result.estimatedTotalBenefit != null && (
            <>
              <div className="w-px bg-outline-variant/20" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Est. Total</span>
                <span className="font-bold text-primary text-base">
                  ${result.estimatedTotalBenefit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Statutory citation */}
        <div className="bg-primary/5 rounded-lg px-4 py-3 flex items-start gap-2">
          <BookOpen className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-primary">{result.statutoryCitation}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{result.calculationMethod}</p>
          </div>
        </div>

        {/* Notes */}
        {result.notes.length > 0 && (
          <ul className="flex flex-col gap-1">
            {result.notes.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-on-surface-variant">
                <span className="text-primary mt-0.5">•</span>
                {note}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Calculator Page                                                    */
/* ------------------------------------------------------------------ */

export default function CalculatorPage() {
  const calcMutation = useCalculateTD();

  const [awe, setAwe] = useState('');
  const [injuryDate, setInjuryDate] = useState('');
  const [tdStart, setTdStart] = useState('');
  const [tdEnd, setTdEnd] = useState('');
  const [partialReturn, setPartialReturn] = useState(false);
  const [modifiedWage, setModifiedWage] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: TDCalculationInput = {
      averageWeeklyEarnings: parseFloat(awe),
      injuryDate,
      tdStartDate: tdStart,
      tdEndDate: tdEnd || undefined,
      partialReturnToWork: partialReturn || undefined,
      modifiedDutyWage: modifiedWage ? parseFloat(modifiedWage) : undefined,
    };
    calcMutation.mutate(input);
  }

  return (
    <>
      <PageHeader
        title="TD Rate Calculator"
        subtitle="Statutory temporary disability benefit calculation per LC § 4653"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Calculator' }]}
      />

      <div className="grid grid-cols-12 gap-6">
        {/* Form */}
        <div className="col-span-12 lg:col-span-5">
          <section className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-container">
              <h3 className="text-base font-bold text-on-surface">Input Values</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
              {/* AWE */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Average Weekly Earnings (AWE) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={awe}
                    onChange={(e) => setAwe(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg pl-8 pr-3 py-2.5 text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-primary"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Average weekly gross earnings in the year before injury
                </p>
              </div>

              {/* Injury date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Date of Injury *
                </label>
                <input
                  type="date"
                  required
                  value={injuryDate}
                  onChange={(e) => setInjuryDate(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              {/* TD period */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    TD Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={tdStart}
                    onChange={(e) => setTdStart(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    TD End Date
                  </label>
                  <input
                    type="date"
                    value={tdEnd}
                    onChange={(e) => setTdEnd(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Partial return */}
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={partialReturn}
                    onChange={(e) => setPartialReturn(e.target.checked)}
                    className="w-4 h-4 rounded border-outline-variant/30 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-on-surface font-medium">
                    Partial return to work (modified duty)
                  </span>
                </label>
                {partialReturn && (
                  <div className="flex flex-col gap-1.5 ml-7">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Modified Duty Wage (weekly)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={modifiedWage}
                        onChange={(e) => setModifiedWage(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg pl-8 pr-3 py-2.5 text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={calcMutation.isPending || !awe || !injuryDate || !tdStart}
                className="w-full primary-gradient text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
              >
                <Calculator className="w-4 h-4" />
                {calcMutation.isPending ? 'Calculating...' : 'Calculate TD Rate'}
              </button>

              {calcMutation.isError && (
                <div className="flex items-center gap-2 text-xs text-error">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Calculation failed. Please check your inputs and try again.
                </div>
              )}
            </form>
          </section>

          {/* Info box */}
          <div className="mt-4 bg-primary/5 rounded-xl p-4 border border-primary/10">
            <div className="flex items-start gap-2">
              <BookOpen className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-primary mb-1">Statutory Authority</p>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  TD rate is 2/3 of pre-injury AWE, subject to minimum and maximum weekly rates
                  set by the SAWW (Statewide Average Weekly Wage). Rates are adjusted annually.
                  Per Labor Code § 4653 and § 4659.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="col-span-12 lg:col-span-7">
          {calcMutation.data ? (
            <ResultCard result={calcMutation.data} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center py-24 gap-4 bg-surface-container-low rounded-2xl border-2 border-dashed border-outline-variant/20">
              <Calculator className="w-12 h-12 text-slate-300" />
              <div className="text-center">
                <p className="text-sm font-semibold text-on-surface-variant">
                  Enter values and calculate
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Results will appear here with statutory citations
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
