import { useState } from 'react';
import {
  Gavel,
  GraduationCap,
  Lock,
  ArrowRight,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { cn } from '~/lib/utils';

/**
 * Training gate page — users must complete mandatory UPL compliance
 * modules before accessing the main application.
 *
 * Converted from the Stitch training_gate HTML design.
 */

interface TrainingModule {
  id: number;
  title: string;
  completed: boolean;
}

const modules: TrainingModule[] = [
  { id: 1, title: 'The Glass Box Philosophy', completed: true },
  { id: 2, title: 'UPL Zone Identification', completed: false },
  { id: 3, title: 'Narrative Construction', completed: false },
  { id: 4, title: 'Compliance Certification', completed: false },
];

export default function TrainingGatePage() {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});

  const completedCount = modules.filter((m) => m.completed).length;
  const progressPct = Math.round((completedCount / modules.length) * 100);
  const allComplete = completedCount === modules.length;

  function selectAnswer(question: string, answer: string) {
    setSelectedAnswers((prev) => ({ ...prev, [question]: answer }));
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col font-sans antialiased">
      {/* Header */}
      <header className="w-full px-8 py-6 flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">AdjudiCLAIMS</h1>
          <p className="text-xs font-medium tracking-[0.1em] uppercase text-outline">
            From Black Box to Glass Box
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-surface-container-highest flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary" />
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">Training Mode</p>
            <p className="text-[0.6875rem] uppercase tracking-wider text-outline">
              Authentication Gate
            </p>
          </div>
        </div>
      </header>

      {/* Main content grid */}
      <main className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* Left: Context & Progress */}
        <section className="lg:col-span-4 p-8 lg:p-12 flex flex-col gap-12 bg-surface-container-low">
          <div className="space-y-4">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed text-[0.6875rem] font-bold uppercase tracking-widest">
              Module {completedCount + 1 > modules.length ? modules.length : completedCount + 1} of{' '}
              {modules.length}
            </div>
            <h2 className="text-4xl font-extrabold text-on-surface leading-tight tracking-tight">
              The Glass Box Philosophy
            </h2>
          </div>

          <div className="space-y-6">
            <p className="text-lg text-on-surface-variant leading-relaxed">
              Welcome to <span className="font-bold text-primary">AdjudiCLAIMS</span>. As a claims
              professional, you are an arbiter of transparency.
            </p>
            <p className="text-on-surface-variant leading-relaxed">
              This training ensures you understand our UPL compliance zones and decision-making
              transparency. We move beyond legacy "black box" algorithms to provide clear, auditable
              narratives for every claim decision.
            </p>
          </div>

          {/* Progress */}
          <div className="mt-auto space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-outline">
                <span>Course Completion</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                <div
                  className="h-full primary-gradient rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {modules.map((mod) => (
                <div
                  key={mod.id}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-xl',
                    mod.completed
                      ? 'bg-surface-container-lowest ambient-shadow ghost-border'
                      : 'opacity-50',
                  )}
                >
                  {mod.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-secondary shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-outline shrink-0" />
                  )}
                  <span
                    className={cn('text-sm', mod.completed ? 'font-semibold' : 'font-medium')}
                  >
                    {mod.id}. {mod.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right: Quiz area */}
        <section className="lg:col-span-8 p-8 lg:p-20 flex flex-col items-center justify-start overflow-y-auto">
          <div className="w-full max-w-2xl space-y-12">
            {/* Q1 */}
            <QuizQuestion
              number={1}
              question='What defines the "Glass Box" approach in claims adjudication?'
              options={[
                'Proprietary AI models that hide complexity to speed up processing.',
                'Total transparency in how data inputs lead to specific regulatory conclusions.',
                'Automatic denial of any claims falling outside standard deviations.',
              ]}
              selected={selectedAnswers['q1']}
              onSelect={(answer) => selectAnswer('q1', answer)}
            />

            {/* Q2: UPL Zone */}
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
                  2
                </span>
                <h3 className="text-xl font-bold pt-1">
                  Which UPL Zone requires immediate human legal intervention?
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-12">
                {(['Green', 'Yellow', 'Red'] as const).map((zone) => {
                  const colors = {
                    Green: { bg: 'bg-upl-green', text: 'text-upl-green' },
                    Yellow: { bg: 'bg-upl-yellow', text: 'text-upl-yellow' },
                    Red: { bg: 'bg-upl-red', text: 'text-upl-red' },
                  } as const;
                  const isSelected = selectedAnswers['q2'] === zone;
                  return (
                    <button
                      key={zone}
                      onClick={() => selectAnswer('q2', zone)}
                      className={cn(
                        'flex flex-col gap-4 p-6 rounded-xl bg-white border transition-all cursor-pointer items-center text-center',
                        isSelected
                          ? 'border-2 border-error bg-surface-container-high'
                          : 'border-outline-variant/30 hover:border-error',
                      )}
                    >
                      <div
                        className={cn(
                          'w-12 h-12 rounded-full flex items-center justify-center text-white font-bold',
                          colors[zone].bg,
                        )}
                      >
                        {zone[0]}
                      </div>
                      <span
                        className={cn(
                          'text-xs font-bold uppercase tracking-widest',
                          colors[zone].text,
                        )}
                      >
                        {zone} Zone
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Q3 */}
            <QuizQuestion
              number={3}
              question='What is the primary goal of the "Arbiter of Transparency" role?'
              options={[
                'To reduce the payout amount of high-value insurance claims.',
                'To automate the entire claims process without human oversight.',
                'To curate a professional narrative that is defensible and clear.',
              ]}
              selected={selectedAnswers['q3']}
              onSelect={(answer) => selectAnswer('q3', answer)}
            />

            {/* Footer action */}
            <div className="pt-12 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-outline-variant/20">
              <div className="flex items-center gap-2 text-error font-medium text-sm">
                <Lock className="w-4 h-4" />
                <span>Complete all modules to enable access</span>
              </div>
              <div className="flex items-center gap-4">
                <button className="px-8 py-3 rounded-lg font-bold text-primary hover:bg-surface-container-high transition-all">
                  Save Progress
                </button>
                <button
                  disabled={!allComplete}
                  className={cn(
                    'px-10 py-3 rounded-xl font-extrabold text-white shadow-xl flex items-center gap-2 transition-all',
                    allComplete
                      ? 'primary-gradient hover:scale-105 active:scale-95'
                      : 'bg-slate-400 opacity-40 cursor-not-allowed',
                  )}
                >
                  Continue to App
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* UPL Compliance Footer */}
      <footer className="bg-error z-40 py-2 px-8 flex justify-center items-center text-center fixed bottom-0 left-0 right-0">
        <span className="text-[0.6875rem] uppercase tracking-[0.05em] font-bold text-white">
          UPL Compliance Active — All AI outputs classified through Green/Yellow/Red zone framework
        </span>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------
 * Quiz question component (used within this route)
 * ----------------------------------------------------------------- */
interface QuizQuestionProps {
  number: number;
  question: string;
  options: string[];
  selected?: string;
  onSelect: (answer: string) => void;
}

function QuizQuestion({ number, question, options, selected, onSelect }: QuizQuestionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
          {number}
        </span>
        <h3 className="text-xl font-bold pt-1">{question}</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 pl-12">
        {options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              key={option}
              onClick={() => onSelect(option)}
              className={cn(
                'flex items-center p-4 rounded-xl border transition-all cursor-pointer text-left',
                isSelected
                  ? 'border-2 border-primary bg-surface-container-low'
                  : 'border-outline-variant/30 hover:border-primary hover:bg-surface-container-low',
              )}
            >
              <span className={cn('text-sm', isSelected ? 'font-bold' : 'font-medium')}>
                {option}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
