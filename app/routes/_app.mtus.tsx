import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Search,
  Stethoscope,
  BookOpen,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { PageHeader } from '~/components/layout/page-header';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MTUSResult {
  id: string;
  guidelineTitle: string;
  bodyPart: string;
  condition: string;
  icdCodes: string[];
  recommendation: 'RECOMMENDED' | 'NOT_RECOMMENDED' | 'EVIDENCE_INSUFFICIENT' | 'CONDITIONALLY_RECOMMENDED';
  evidenceLevel: 'A' | 'B' | 'C' | 'I';
  summary: string;
  details: string;
  maxFrequency?: string;
  maxDuration?: string;
  preconditions?: string;
  citations: string[];
  lastUpdated: string;
}

interface MTUSSearchParams {
  query: string;
  bodyPart?: string;
  condition?: string;
  icdCode?: string;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

function useMTUSSearch() {
  return useMutation({
    mutationFn: (params: MTUSSearchParams) =>
      apiFetch<MTUSResult[]>('/mtus/search', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function recommendationConfig(rec: MTUSResult['recommendation']) {
  switch (rec) {
    case 'RECOMMENDED':
      return {
        label: 'RECOMMENDED',
        icon: CheckCircle,
        className: 'text-secondary',
        badge: 'bg-secondary-fixed-dim text-on-secondary-fixed-variant',
      };
    case 'NOT_RECOMMENDED':
      return {
        label: 'NOT RECOMMENDED',
        icon: XCircle,
        className: 'text-error',
        badge: 'bg-error-container text-on-error-container',
      };
    case 'CONDITIONALLY_RECOMMENDED':
      return {
        label: 'CONDITIONAL',
        icon: HelpCircle,
        className: 'text-tertiary-container',
        badge: 'bg-tertiary-fixed text-tertiary',
      };
    default:
      return {
        label: 'INSUFFICIENT EVIDENCE',
        icon: HelpCircle,
        className: 'text-slate-400',
        badge: 'bg-surface-container-high text-on-surface-variant',
      };
  }
}

function evidenceBadge(level: MTUSResult['evidenceLevel']) {
  const colors: Record<string, string> = {
    A: 'bg-secondary/10 text-secondary',
    B: 'bg-primary/10 text-primary',
    C: 'bg-tertiary-container/10 text-tertiary-container',
    I: 'bg-surface-container-high text-on-surface-variant',
  };
  return colors[level] ?? colors['I']!;
}

/* ------------------------------------------------------------------ */
/*  Result Card                                                        */
/* ------------------------------------------------------------------ */

function MTUSResultCard({ result }: { result: MTUSResult }) {
  const [expanded, setExpanded] = useState(false);
  const recCfg = recommendationConfig(result.recommendation);
  const RecIcon = recCfg.icon;

  return (
    <div className="bg-surface-container-lowest rounded-xl ambient-shadow overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 flex items-start justify-between hover:bg-surface-container-low transition-colors text-left"
      >
        <div className="flex flex-col gap-2 flex-1 pr-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                recCfg.badge,
              )}
            >
              <RecIcon className="w-3 h-3" />
              {recCfg.label}
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                evidenceBadge(result.evidenceLevel),
              )}
            >
              Level {result.evidenceLevel}
            </span>
            {result.icdCodes.slice(0, 3).map((code) => (
              <span
                key={code}
                className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px] font-mono font-bold"
              >
                {code}
              </span>
            ))}
          </div>
          <h4 className="text-sm font-bold text-on-surface">{result.guidelineTitle}</h4>
          <p className="text-xs text-on-surface-variant">
            {result.bodyPart} · {result.condition}
          </p>
        </div>
        <div className="flex-shrink-0 mt-1">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Summary (always visible) */}
      <div className="px-5 pb-4 -mt-1">
        <p className="text-sm text-on-surface-variant leading-relaxed">{result.summary}</p>
      </div>

      {/* Details (expanded) */}
      {expanded && (
        <div className="border-t border-surface-container px-5 py-4 flex flex-col gap-4">
          <p className="text-sm text-on-surface leading-relaxed">{result.details}</p>

          {(result.maxFrequency || result.maxDuration || result.preconditions) && (
            <div className="grid grid-cols-3 gap-3">
              {result.maxFrequency && (
                <div className="bg-surface-container-low rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Max Frequency
                  </p>
                  <p className="text-xs font-semibold text-on-surface">{result.maxFrequency}</p>
                </div>
              )}
              {result.maxDuration && (
                <div className="bg-surface-container-low rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Max Duration
                  </p>
                  <p className="text-xs font-semibold text-on-surface">{result.maxDuration}</p>
                </div>
              )}
              {result.preconditions && (
                <div className="bg-surface-container-low rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Preconditions
                  </p>
                  <p className="text-xs font-semibold text-on-surface">{result.preconditions}</p>
                </div>
              )}
            </div>
          )}

          {result.citations.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Citations
              </p>
              {result.citations.map((cite, i) => (
                <p key={i} className="text-xs text-primary font-mono flex items-center gap-1">
                  <BookOpen className="w-3 h-3 flex-shrink-0" />
                  {cite}
                </p>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-400">
            Guideline last updated:{' '}
            {new Date(result.lastUpdated).toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MTUS Page                                                          */
/* ------------------------------------------------------------------ */

const BODY_PARTS = [
  '', 'Cervical Spine', 'Thoracic Spine', 'Lumbar Spine', 'Shoulder', 'Elbow',
  'Wrist/Hand', 'Hip', 'Knee', 'Ankle/Foot', 'Psychological', 'Chronic Pain',
  'Headache', 'Cardiovascular', 'Pulmonary',
];

export default function MTUSPage() {
  const searchMutation = useMTUSSearch();
  const [query, setQuery] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [icdCode, setIcdCode] = useState('');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() && !bodyPart && !icdCode) return;
    searchMutation.mutate({
      query: query.trim(),
      bodyPart: bodyPart || undefined,
      icdCode: icdCode.trim() || undefined,
    });
  }

  const results = searchMutation.data ?? [];

  return (
    <>
      <PageHeader
        title="MTUS Guidelines"
        subtitle="California Medical Treatment Utilization Schedule — evidence-based treatment guidelines"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'MTUS' }]}
      />

      {/* Search form */}
      <section className="bg-surface-container-lowest rounded-2xl ambient-shadow p-6 mb-6">
        <form onSubmit={handleSearch} className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search MTUS guidelines, treatments, conditions..."
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl pl-10 pr-4 py-3 text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-primary"
              />
            </div>
            <button
              type="submit"
              disabled={searchMutation.isPending || (!query.trim() && !bodyPart && !icdCode)}
              className="primary-gradient text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
            >
              <Stethoscope className="w-4 h-4" />
              {searchMutation.isPending ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Body Part
              </label>
              <select
                value={bodyPart}
                onChange={(e) => setBodyPart(e.target.value)}
                className="bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary min-w-40"
              >
                <option value="">All body parts</option>
                {BODY_PARTS.filter(Boolean).map((bp) => (
                  <option key={bp} value={bp}>
                    {bp}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                ICD Code
              </label>
              <input
                type="text"
                value={icdCode}
                onChange={(e) => setIcdCode(e.target.value)}
                placeholder="e.g. M54.5"
                className="bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-primary w-32 font-mono"
              />
            </div>
          </div>
        </form>
      </section>

      {/* Results */}
      {searchMutation.isPending && (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-slate-400">Searching MTUS guidelines...</p>
        </div>
      )}

      {searchMutation.isError && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertCircle className="w-8 h-8 text-error" />
          <p className="text-sm text-error">Search failed. Please try again.</p>
        </div>
      )}

      {searchMutation.isSuccess && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Stethoscope className="w-10 h-10 text-slate-300" />
          <p className="text-sm text-on-surface-variant">No guidelines found for your search.</p>
          <p className="text-xs text-slate-400">Try a broader search term or different body part.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-on-surface-variant">
            {results.length} guideline{results.length !== 1 ? 's' : ''} found
          </p>
          {results.map((result) => (
            <MTUSResultCard key={result.id} result={result} />
          ))}
        </div>
      )}

      {!searchMutation.isSuccess && !searchMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Stethoscope className="w-12 h-12 text-slate-200" />
          <div className="text-center">
            <p className="text-sm font-semibold text-on-surface-variant">
              Search MTUS Treatment Guidelines
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Enter a treatment, condition, or ICD code to look up evidence-based
              guidelines from the California MTUS
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {['Physical therapy', 'Opioid treatment', 'Surgery', 'Acupuncture', 'MRI'].map(
              (suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setQuery(suggestion);
                    searchMutation.mutate({ query: suggestion });
                  }}
                  className="px-3 py-1.5 bg-surface-container-low rounded-lg text-xs font-medium text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
                >
                  {suggestion}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </>
  );
}
