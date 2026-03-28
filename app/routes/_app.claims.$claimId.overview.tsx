import { useParams } from 'react-router';
import { MoreHorizontal, PenSquare, Accessibility } from 'lucide-react';
import { cn } from '~/lib/utils';
import { useClaim, type ClaimEntity } from '~/hooks/api/use-claims';

/* ------------------------------------------------------------------ */
/*  Entity card icon/color mapping                                     */
/* ------------------------------------------------------------------ */

const entityColors: Record<string, { bg: string; text: string }> = {
  claimant: { bg: 'bg-primary/10', text: 'text-primary' },
  doctor: { bg: 'bg-secondary/10', text: 'text-secondary' },
  employer: { bg: 'bg-tertiary-container/10', text: 'text-tertiary-container' },
  attorney: { bg: 'bg-on-surface-variant/10', text: 'text-on-surface-variant' },
};

/* ------------------------------------------------------------------ */
/*  Overview Tab                                                       */
/* ------------------------------------------------------------------ */

export default function ClaimOverviewTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const claimQuery = useClaim(claimId ?? '');
  const claim = claimQuery.data;

  if (claimQuery.isLoading) {
    return <p className="text-sm text-slate-400 py-12 text-center">Loading overview...</p>;
  }

  if (!claim) {
    return <p className="text-sm text-error py-12 text-center">Claim not found.</p>;
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Claim Intelligence Card */}
      <div className="col-span-8 bg-surface-container-low p-6 rounded-xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Claim Intelligence</h2>
          <MoreHorizontal className="w-5 h-5 text-slate-400" />
        </div>
        <div className="grid grid-cols-3 gap-8">
          <MetadataField label="Employer" value={claim.employer ?? '--'} />
          <MetadataField label="Date of Injury" value={claim.dateOfInjury} />
          <MetadataField label="Examiner" value={claim.examiner ?? '--'} />
          <MetadataField label="Carrier" value={claim.carrier ?? '--'} />
          <MetadataField label="Policy #" value={claim.policyNumber ?? '--'} />
          <MetadataField label="Jurisdiction" value={claim.jurisdiction ?? 'California'} />
        </div>
        {claim.bodyParts && claim.bodyParts.length > 0 && (
          <div className="mt-4 pt-6 border-t border-outline-variant/10">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-3">
              Injured Body Parts
            </span>
            <div className="flex gap-2 flex-wrap">
              {claim.bodyParts.map((part) => (
                <span
                  key={part}
                  className="px-3 py-1.5 bg-surface-container-high rounded text-xs font-semibold flex items-center gap-2"
                >
                  <Accessibility className="w-4 h-4" />
                  {part}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Financial Reserves Card */}
      <div className="col-span-4 bg-surface-container-highest p-6 rounded-xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Financial Reserves</h2>
          <PenSquare className="w-5 h-5 text-primary cursor-pointer" />
        </div>
        <div className="flex flex-col gap-4">
          <ReserveField label="Temporary Disability" value={claim.reserves?.temporaryDisability ?? 0} />
          <ReserveField label="Medical Services" value={claim.reserves?.medicalServices ?? 0} />
          <ReserveField label="Legal & Expenses" value={claim.reserves?.legalExpenses ?? 0} />
        </div>
        <div className="mt-auto pt-4 flex justify-between items-end">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            Total Incurred
          </span>
          <span className="text-2xl font-black text-primary">
            ${(claim.reserves?.totalIncurred ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Knowledge Graph Entities */}
      {claim.entities && claim.entities.length > 0 && (
        <div className="col-span-12 bg-surface-container p-6 rounded-xl">
          <h2 className="text-lg font-bold tracking-tight mb-6">Knowledge Graph Entities</h2>
          <div className="grid grid-cols-4 gap-6">
            {claim.entities.map((entity) => (
              <EntityCard key={entity.id} entity={entity} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function MetadataField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
        {label}
      </span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function ReserveField({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
          $
        </span>
        <input
          className="w-full bg-transparent border-none border-b border-outline-variant/30 focus:border-primary focus:ring-0 pl-7 font-bold text-lg text-on-surface"
          type="text"
          defaultValue={value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          readOnly
        />
      </div>
    </div>
  );
}

function EntityCard({ entity }: { entity: ClaimEntity }) {
  const colors = entityColors[entity.role.toLowerCase()] ?? entityColors['claimant']!;
  return (
    <div className="bg-surface-container-lowest p-4 rounded-lg flex items-center gap-4 border border-outline-variant/10 shadow-sm">
      <div
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center',
          colors.bg,
          colors.text,
        )}
      >
        <span className="material-symbols-outlined text-2xl">{entity.icon}</span>
      </div>
      <div className="flex flex-col">
        <span className={cn('text-xs font-bold uppercase tracking-tighter', colors.text)}>
          {entity.role}
        </span>
        <span className="text-sm font-bold">{entity.name}</span>
        {entity.detail && (
          <span className="text-[10px] text-slate-500">{entity.detail}</span>
        )}
      </div>
    </div>
  );
}
