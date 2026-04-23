import { useState } from 'react';
import { useParams } from 'react-router';
import {
  AlertCircle,
  RefreshCw,
  FileText,
  Plus,
  Mail,
  Send,
  ChevronRight,
  X,
  Download,
  Printer,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  useClaimLetters,
  useLetterTemplates,
  useGenerateLetter,
  letterPrintUrl,
  letterDownloadUrl,
  type Letter,
  type LetterTemplate,
} from '~/hooks/api/use-letters';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function letterStatusConfig(status: Letter['status']) {
  switch (status) {
    case 'SENT':
    case 'DELIVERED':
      return { label: status, className: 'bg-secondary-fixed-dim text-on-secondary-fixed-variant' };
    case 'GENERATED':
      return { label: 'GENERATED', className: 'bg-primary-fixed text-primary' };
    default:
      return { label: 'DRAFT', className: 'bg-surface-container-high text-on-surface-variant' };
  }
}

function categoryLabel(category: LetterTemplate['category']) {
  switch (category) {
    case 'BENEFIT_NOTICE':
      return 'Benefit Notice';
    case 'MEDICAL_REQUEST':
      return 'Medical Request';
    case 'CORRESPONDENCE':
      return 'Correspondence';
  }
}

/* ------------------------------------------------------------------ */
/*  Generate Letter Modal                                              */
/* ------------------------------------------------------------------ */

function GenerateLetterModal({
  onClose,
  onGenerate,
  isGenerating,
}: {
  onClose: () => void;
  onGenerate: (params: { templateId: string; recipientRole: string; notes?: string }) => void;
  isGenerating: boolean;
}) {
  const templatesQuery = useLetterTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [recipientRole, setRecipientRole] = useState('');
  const [notes, setNotes] = useState('');

  const templates = templatesQuery.data ?? [];

  const grouped = templates.reduce<Record<string, LetterTemplate[]>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category]!.push(t);
    return acc;
  }, {});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplateId || !recipientRole) return;
    onGenerate({ templateId: selectedTemplateId, recipientRole, notes: notes || undefined });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-5 m-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-on-surface">Generate Letter</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
          >
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        {templatesQuery.isLoading ? (
          <p className="text-sm text-slate-400 text-center py-6">Loading templates...</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Letter Template
              </label>
              {Object.entries(grouped).map(([category, catTemplates]) => (
                <div key={category} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-primary font-bold px-1">
                    {categoryLabel(category as LetterTemplate['category'])}
                  </span>
                  {catTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={cn(
                        'text-left px-4 py-3 rounded-lg border transition-all',
                        selectedTemplateId === t.id
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-outline-variant/20 bg-surface-container-low hover:border-primary/30',
                      )}
                    >
                      <p className="text-sm font-semibold">{t.name}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{t.description}</p>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Recipient
              </label>
              <select
                value={recipientRole}
                onChange={(e) => setRecipientRole(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary"
              >
                <option value="">Select recipient...</option>
                <option value="CLAIMANT">Claimant</option>
                <option value="EMPLOYER">Employer</option>
                <option value="TREATING_PHYSICIAN">Treating Physician</option>
                <option value="DEFENSE_COUNSEL">Defense Counsel</option>
                <option value="QME">QME</option>
                <option value="INSURANCE_CARRIER">Insurance Carrier</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Additional instructions for letter generation..."
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
                disabled={!selectedTemplateId || !recipientRole || isGenerating}
                className="flex-1 primary-gradient text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
              >
                {isGenerating ? 'Generating...' : 'Generate Letter'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Letters Tab                                                        */
/* ------------------------------------------------------------------ */

export default function ClaimLettersTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const lettersQuery = useClaimLetters(claimId ?? '');
  const generateMutation = useGenerateLetter(claimId ?? '');
  const [showModal, setShowModal] = useState(false);
  const [previewLetter, setPreviewLetter] = useState<Letter | null>(null);

  const letters = lettersQuery.data ?? [];

  if (lettersQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading letters...</p>
      </div>
    );
  }

  if (lettersQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load letters.</p>
        <button
          onClick={() => void lettersQuery.refetch()}
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
      {showModal && (
        <GenerateLetterModal
          onClose={() => setShowModal(false)}
          onGenerate={(params) => {
            generateMutation.mutate(params, {
              onSuccess: () => setShowModal(false),
            });
          }}
          isGenerating={generateMutation.isPending}
        />
      )}

      <div className={cn('flex gap-6', previewLetter ? 'flex-row' : 'flex-col')}>
        <div className={cn(previewLetter ? 'w-80 flex-shrink-0' : 'w-full')}>
          <section className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between">
              <h3 className="text-lg font-bold text-on-surface">
                Letters
                {letters.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-on-surface-variant">
                    ({letters.length})
                  </span>
                )}
              </h3>
              <button
                onClick={() => setShowModal(true)}
                className="primary-gradient text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Generate Letter
              </button>
            </div>

            {letters.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <Mail className="w-10 h-10 text-slate-300" />
                <p className="text-sm text-on-surface-variant">No letters generated yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-surface-container">
                {letters.map((letter) => {
                  const cfg = letterStatusConfig(letter.status);
                  return (
                    <li
                      key={letter.id}
                      onClick={() =>
                        setPreviewLetter(previewLetter?.id === letter.id ? null : letter)
                      }
                      className={cn(
                        'px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors',
                        previewLetter?.id === letter.id && 'bg-primary/5',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-on-surface-variant" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-on-surface truncate">
                            {letter.letterType.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            To: {letter.recipient || letter.recipientRole}
                            {' · '}
                            {new Date(letter.generatedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            cfg.className,
                          )}
                        >
                          {cfg.label}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {previewLetter && (
          <div className="flex-1 bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between">
              <h3 className="text-base font-bold text-on-surface">
                {previewLetter.letterType.replace(/_/g, ' ')}
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href={letterPrintUrl(previewLetter.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-surface-container text-on-surface rounded-lg text-xs font-bold hover:bg-surface-container-high transition-all flex items-center gap-1.5"
                  aria-label="Open printable letter in a new tab"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </a>
                <a
                  href={letterDownloadUrl(previewLetter.id)}
                  className="px-3 py-1.5 bg-surface-container text-on-surface rounded-lg text-xs font-bold hover:bg-surface-container-high transition-all flex items-center gap-1.5"
                  aria-label="Download the letter as an HTML file (use browser Print > Save as PDF for PDF)"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
                <button className="px-3 py-1.5 bg-secondary text-white rounded-lg text-xs font-bold hover:opacity-90 transition-all flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Send
                </button>
                <button
                  onClick={() => setPreviewLetter(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
                >
                  <X className="w-4 h-4 text-on-surface-variant" />
                </button>
              </div>
            </div>
            <div className="p-6">
              {previewLetter.content ? (
                <pre className="text-sm text-on-surface whitespace-pre-wrap font-sans leading-relaxed">
                  {previewLetter.content}
                </pre>
              ) : (
                <div className="py-12 flex flex-col items-center gap-3">
                  <FileText className="w-10 h-10 text-slate-300" />
                  <p className="text-sm text-on-surface-variant">Letter content not available.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
