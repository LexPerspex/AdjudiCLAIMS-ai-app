import { useParams } from 'react-router';
import { AlertCircle, RefreshCw, ClipboardList, CheckSquare, Square } from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  useClaimInvestigation,
  useUpdateInvestigationItem,
  type InvestigationItem,
} from '~/hooks/api/use-investigation';

/* ------------------------------------------------------------------ */
/*  Investigation Tab                                                  */
/* ------------------------------------------------------------------ */

export default function ClaimInvestigationTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const investigationQuery = useClaimInvestigation(claimId ?? '');
  const updateMutation = useUpdateInvestigationItem(claimId ?? '');

  if (investigationQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading investigation checklist...</p>
      </div>
    );
  }

  if (investigationQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load investigation checklist.</p>
        <button
          onClick={() => void investigationQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const data = investigationQuery.data;

  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <ClipboardList className="w-10 h-10 text-slate-300" />
        <p className="text-sm text-on-surface-variant">No investigation items found.</p>
      </div>
    );
  }

  const { items, totalItems, completedItems, percentComplete } = data;

  const grouped = items.reduce<Record<string, InvestigationItem[]>>((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(item);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      {/* Progress Card */}
      <div className="bg-surface-container-low rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-on-surface">Investigation Progress</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {completedItems} of {totalItems} items complete
            </p>
          </div>
          <span
            className={cn(
              'text-2xl font-extrabold',
              percentComplete === 100
                ? 'text-secondary'
                : percentComplete >= 70
                  ? 'text-tertiary-container'
                  : 'text-primary',
            )}
          >
            {percentComplete}%
          </span>
        </div>
        <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              percentComplete === 100
                ? 'bg-secondary'
                : percentComplete >= 70
                  ? 'bg-tertiary-container'
                  : 'bg-primary',
            )}
            style={{ width: `${percentComplete}%` }}
          />
        </div>
      </div>

      {/* Checklist by Category */}
      {Object.entries(grouped).map(([category, categoryItems]) => {
        const catCompleted = categoryItems.filter((i) => i.completed).length;
        return (
          <section
            key={category}
            className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between">
              <h3 className="text-base font-bold text-on-surface">{category}</h3>
              <span className="text-xs text-on-surface-variant">
                {catCompleted}/{categoryItems.length}
              </span>
            </div>
            <ul className="divide-y divide-surface-container">
              {categoryItems
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((item) => {
                  const isUpdating =
                    updateMutation.isPending &&
                    (updateMutation.variables as { itemId: string } | undefined)?.itemId === item.id;

                  return (
                    <li key={item.id} className="px-6 py-4 flex items-start gap-4 group">
                      <button
                        disabled={isUpdating}
                        onClick={() =>
                          updateMutation.mutate({ itemId: item.id, completed: !item.completed })
                        }
                        className={cn(
                          'flex-shrink-0 mt-0.5 transition-all hover:scale-110 active:scale-95 disabled:opacity-50',
                          item.completed
                            ? 'text-secondary'
                            : 'text-slate-300 hover:text-secondary/60',
                        )}
                        aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {item.completed ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              'text-sm font-medium',
                              item.completed
                                ? 'line-through text-on-surface-variant'
                                : 'text-on-surface',
                            )}
                          >
                            {item.description}
                          </span>
                          {item.required && !item.completed && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-error-container text-on-error-container">
                              Required
                            </span>
                          )}
                        </div>
                        {item.completed && item.completedAt && (
                          <p className="text-[10px] text-on-surface-variant">
                            Completed{' '}
                            {new Date(item.completedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            {item.completedBy && ` by ${item.completedBy}`}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
