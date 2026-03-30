import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Search,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Shield,
  CheckCircle,
  X,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { PageHeader } from '~/components/layout/page-header';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  category: string;
  dismissed: boolean;
}

interface EducationEntry {
  id: string;
  title: string;
  statutoryAuthority: string;
  explanation: string;
  category: string;
  tier: 1 | 2;
  consequences?: string;
}

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  category: string;
  durationMinutes: number;
  completed: boolean;
  completedAt?: string;
  required: boolean;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useGlossary() {
  return useQuery<GlossaryEntry[]>({
    queryKey: ['education', 'glossary'],
    queryFn: () => apiFetch<GlossaryEntry[]>('/education/glossary'),
  });
}

function useEducationEntries() {
  return useQuery<EducationEntry[]>({
    queryKey: ['education', 'entries'],
    queryFn: () => apiFetch<EducationEntry[]>('/education/entries'),
  });
}

function useTrainingModules() {
  return useQuery<TrainingModule[]>({
    queryKey: ['education', 'training'],
    queryFn: () => apiFetch<TrainingModule[]>('/education/training'),
  });
}

/* ------------------------------------------------------------------ */
/*  Glossary Tab                                                       */
/* ------------------------------------------------------------------ */

function GlossaryTab() {
  const glossaryQuery = useGlossary();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  if (glossaryQuery.isLoading) {
    return <p className="text-sm text-slate-400 py-12 text-center">Loading glossary...</p>;
  }

  if (glossaryQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <AlertCircle className="w-6 h-6 text-error" />
        <p className="text-sm text-error">Failed to load glossary.</p>
        <button
          onClick={() => void glossaryQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const entries = glossaryQuery.data ?? [];
  const filtered = entries.filter(
    (e) =>
      e.term.toLowerCase().includes(search.toLowerCase()) ||
      e.definition.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = filtered.reduce<Record<string, GlossaryEntry[]>>((acc, entry) => {
    const cat = entry.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(entry);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search terms..."
          className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-primary"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-on-surface"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-8 text-center">
          No terms match &ldquo;{search}&rdquo;
        </p>
      ) : (
        Object.entries(grouped).map(([category, catEntries]) => (
          <section key={category} className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-container bg-surface-container-low/50">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {category}
              </h4>
            </div>
            <ul className="divide-y divide-surface-container">
              {catEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-container-low transition-colors"
                  >
                    <span className="text-sm font-bold text-on-surface">{entry.term}</span>
                    {expanded === entry.id ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                  </button>
                  {expanded === entry.id && (
                    <div className="px-5 pb-4">
                      <p className="text-sm text-on-surface-variant leading-relaxed">
                        {entry.definition}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Regulatory Education Tab                                           */
/* ------------------------------------------------------------------ */

function RegulatoryTab() {
  const educationQuery = useEducationEntries();
  const [search, setSearch] = useState('');

  if (educationQuery.isLoading) {
    return <p className="text-sm text-slate-400 py-12 text-center">Loading regulatory education...</p>;
  }

  if (educationQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <AlertCircle className="w-6 h-6 text-error" />
        <p className="text-sm text-error">Failed to load education content.</p>
        <button
          onClick={() => void educationQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const entries = educationQuery.data ?? [];
  const filtered = entries.filter(
    (e) =>
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.explanation.toLowerCase().includes(search.toLowerCase()) ||
      e.statutoryAuthority.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = filtered.reduce<Record<string, EducationEntry[]>>((acc, entry) => {
    const cat = entry.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(entry);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search regulations, citations..."
          className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-primary"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-on-surface"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {Object.entries(grouped).map(([category, catEntries]) => (
        <div key={category} className="flex flex-col gap-3">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1">
            {category}
          </h4>
          {catEntries.map((entry) => (
            <div
              key={entry.id}
              className="bg-surface-container-lowest rounded-xl p-5 ambient-shadow"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <h5 className="text-sm font-bold text-on-surface">{entry.title}</h5>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {entry.tier === 1 ? (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-surface-container-high text-on-surface-variant">
                      TIER 1
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary">
                      TIER 2
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-primary font-mono mb-2 flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                {entry.statutoryAuthority}
              </p>
              <p className="text-sm text-on-surface-variant leading-relaxed">{entry.explanation}</p>
              {entry.consequences && (
                <div className="mt-3 bg-error/5 rounded-lg px-3 py-2 border-l-2 border-error">
                  <p className="text-xs text-on-surface">
                    <span className="font-bold text-error">Non-compliance: </span>
                    {entry.consequences}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Training Tab                                                       */
/* ------------------------------------------------------------------ */

function TrainingTab() {
  const trainingQuery = useTrainingModules();

  if (trainingQuery.isLoading) {
    return <p className="text-sm text-slate-400 py-12 text-center">Loading training modules...</p>;
  }

  if (trainingQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <AlertCircle className="w-6 h-6 text-error" />
        <p className="text-sm text-error">Failed to load training modules.</p>
        <button
          onClick={() => void trainingQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const modules = trainingQuery.data ?? [];
  const completedCount = modules.filter((m) => m.completed).length;
  const requiredCount = modules.filter((m) => m.required).length;
  const requiredCompleted = modules.filter((m) => m.required && m.completed).length;

  const grouped = modules.reduce<Record<string, TrainingModule[]>>((acc, m) => {
    const cat = m.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {/* Progress summary */}
      <div className="bg-surface-container-low rounded-xl p-4 flex items-center gap-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Required
          </p>
          <p className="text-xl font-extrabold text-on-surface">
            {requiredCompleted}/{requiredCount}
          </p>
        </div>
        <div className="flex-1">
          <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
            <div
              className="h-full bg-secondary rounded-full"
              style={{
                width: requiredCount > 0 ? `${(requiredCompleted / requiredCount) * 100}%` : '0%',
              }}
            />
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Total Completed
          </p>
          <p className="text-xl font-extrabold text-on-surface">
            {completedCount}/{modules.length}
          </p>
        </div>
      </div>

      {/* Module list */}
      {Object.entries(grouped).map(([category, catModules]) => (
        <section key={category} className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-container bg-surface-container-low/50">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {category}
            </h4>
          </div>
          <ul className="divide-y divide-surface-container">
            {catModules.map((module) => (
              <li key={module.id} className="px-5 py-4 flex items-center gap-4">
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                    module.completed ? 'bg-secondary/10' : 'bg-surface-container-high',
                  )}
                >
                  {module.completed ? (
                    <CheckCircle className="w-4 h-4 text-secondary" />
                  ) : (
                    <GraduationCap className="w-4 h-4 text-on-surface-variant" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        module.completed ? 'text-on-surface-variant line-through' : 'text-on-surface',
                      )}
                    >
                      {module.title}
                    </p>
                    {module.required && !module.completed && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-error-container text-on-error-container">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">{module.description}</p>
                  {module.completed && module.completedAt && (
                    <p className="text-[10px] text-secondary mt-0.5">
                      Completed{' '}
                      {new Date(module.completedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className="text-xs text-slate-400">{module.durationMinutes}m</span>
                  {!module.completed && (
                    <button className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 transition-all">
                      Start
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Education Page                                                     */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'glossary', label: 'Glossary', icon: BookOpen },
  { id: 'regulatory', label: 'Regulatory Education', icon: Shield },
  { id: 'training', label: 'Training Modules', icon: GraduationCap },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function EducationPage() {
  const [activeTab, setActiveTab] = useState<TabId>('glossary');

  return (
    <>
      <PageHeader
        title="Education Hub"
        subtitle="Regulatory knowledge, glossary, and compliance training"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Education' }]}
      />

      {/* Tab navigation */}
      <div className="flex gap-1 p-1 bg-surface-container-low rounded-xl mb-6 w-fit">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all',
                activeTab === tab.id
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              <TabIcon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'glossary' && <GlossaryTab />}
      {activeTab === 'regulatory' && <RegulatoryTab />}
      {activeTab === 'training' && <TrainingTab />}
    </>
  );
}
