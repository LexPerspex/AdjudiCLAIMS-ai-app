/**
 * EntityPanel — Graph RAG G5 Trust UX
 *
 * A collapsible panel showing full details for a graph entity (GraphNode):
 * canonical name, node type, confidence score, aliases, source documents,
 * and related entities (connected graph nodes with edge labels).
 *
 * Used in the claim overview Knowledge Graph section and wherever deep
 * entity detail is needed with full provenance transparency.
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  Activity,
  FileText,
  Scale,
  DollarSign,
  Stethoscope,
  Pill,
  Star,
  Briefcase,
  Link2,
  Shield,
  HelpCircle,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { ConfidenceBadge } from './confidence-badge';
import { ProvenanceCard, type ProvenanceSource } from './provenance-card';

/* ------------------------------------------------------------------ */
/*  Node type icon/label map                                            */
/* ------------------------------------------------------------------ */

type GraphNodeType =
  | 'PERSON'
  | 'ORGANIZATION'
  | 'BODY_PART'
  | 'CLAIM'
  | 'DOCUMENT'
  | 'PROCEEDING'
  | 'LEGAL_ISSUE'
  | 'LIEN'
  | 'SETTLEMENT'
  | 'TREATMENT'
  | 'MEDICATION'
  | 'RATING'
  | 'BENEFIT';

const nodeTypeConfig: Record<
  GraphNodeType,
  { label: string; Icon: React.ComponentType<{ className?: string }>; colorClass: string }
> = {
  PERSON:       { label: 'Person',       Icon: User,         colorClass: 'text-primary bg-primary/10' },
  ORGANIZATION: { label: 'Organization', Icon: Building2,    colorClass: 'text-secondary bg-secondary/10' },
  BODY_PART:    { label: 'Body Part',    Icon: Activity,     colorClass: 'text-error bg-error/10' },
  CLAIM:        { label: 'Claim',        Icon: Shield,       colorClass: 'text-tertiary-container bg-tertiary-container/10' },
  DOCUMENT:     { label: 'Document',     Icon: FileText,     colorClass: 'text-on-surface-variant bg-surface-container-high' },
  PROCEEDING:   { label: 'Proceeding',   Icon: Scale,        colorClass: 'text-primary bg-primary/10' },
  LEGAL_ISSUE:  { label: 'Legal Issue',  Icon: Scale,        colorClass: 'text-error bg-error/10' },
  LIEN:         { label: 'Lien',         Icon: DollarSign,   colorClass: 'text-amber-700 bg-amber-100' },
  SETTLEMENT:   { label: 'Settlement',   Icon: Briefcase,    colorClass: 'text-green-700 bg-green-100' },
  TREATMENT:    { label: 'Treatment',    Icon: Stethoscope,  colorClass: 'text-secondary bg-secondary/10' },
  MEDICATION:   { label: 'Medication',   Icon: Pill,         colorClass: 'text-purple-700 bg-purple-100' },
  RATING:       { label: 'Rating',       Icon: Star,         colorClass: 'text-amber-700 bg-amber-100' },
  BENEFIT:      { label: 'Benefit',      Icon: DollarSign,   colorClass: 'text-green-700 bg-green-100' },
};

const FALLBACK_NODE: (typeof nodeTypeConfig)[GraphNodeType] = {
  label: 'Entity',
  Icon: HelpCircle,
  colorClass: 'text-slate-500 bg-surface-container-high',
};

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface RelatedEntity {
  id: string;
  name: string;
  nodeType: string;
  edgeType: string;
  direction: 'outgoing' | 'incoming';
}

export interface EntityPanelProps {
  entity: {
    id: string;
    name: string;
    nodeType: string;
    confidence: number;
    aliases?: string[];
    properties?: Record<string, unknown>;
    sourceDocuments?: ProvenanceSource[];
    relatedEntities?: RelatedEntity[];
  };
  defaultExpanded?: boolean;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function EntityPanel({ entity, defaultExpanded = false, className }: EntityPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const config = nodeTypeConfig[entity.nodeType as GraphNodeType] ?? FALLBACK_NODE;
  const { label: typeLabel, Icon, colorClass } = config;

  const aliases = entity.aliases ?? [];
  const sources = entity.sourceDocuments ?? [];
  const related = entity.relatedEntities ?? [];

  return (
    <div
      className={cn(
        'rounded-xl border border-outline-variant/15 bg-surface-container-lowest shadow-sm overflow-hidden',
        className,
      )}
    >
      {/* Header — always visible */}
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-surface-container-low/50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Type icon */}
        <div
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            colorClass,
          )}
        >
          <Icon className="w-4 h-4" aria-hidden />
        </div>

        {/* Name + type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-on-surface truncate">{entity.name}</span>
            <ConfidenceBadge confidence={entity.confidence} size="sm" />
          </div>
          <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500">
            {typeLabel}
          </span>
        </div>

        {/* Expand chevron */}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-outline-variant/10 p-4 flex flex-col gap-4">
          {/* Aliases */}
          {aliases.length > 0 && (
            <div>
              <SectionLabel>Also known as</SectionLabel>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {aliases.map((alias) => (
                  <span
                    key={alias}
                    className="px-2 py-0.5 rounded-full bg-surface-container-high text-[9px] font-semibold text-on-surface-variant"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source documents */}
          {sources.length > 0 && (
            <div>
              <SectionLabel>Source Documents ({sources.length})</SectionLabel>
              <div className="mt-2 flex flex-col gap-2">
                {sources.map((src, i) => (
                  <ProvenanceCard key={`${src.documentName}-${i}`} source={src} />
                ))}
              </div>
            </div>
          )}

          {/* Related entities */}
          {related.length > 0 && (
            <div>
              <SectionLabel>Related Entities ({related.length})</SectionLabel>
              <div className="mt-2 flex flex-col gap-1.5">
                {related.map((rel) => {
                  const relConfig = nodeTypeConfig[rel.nodeType as GraphNodeType] ?? FALLBACK_NODE;
                  const RelIcon = relConfig.Icon;
                  return (
                    <div
                      key={rel.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/10"
                    >
                      <RelIcon className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-[10px] font-semibold text-on-surface truncate">{rel.name}</span>
                      <span className="ml-auto flex items-center gap-1 text-[9px] text-slate-400 shrink-0">
                        <Link2 className="w-2.5 h-2.5" />
                        {rel.edgeType.toLowerCase().replace(/_/g, ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {sources.length === 0 && related.length === 0 && aliases.length === 0 && (
            <p className="text-[10px] text-slate-400 italic">No additional details available.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Internal sub-component                                              */
/* ------------------------------------------------------------------ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500 block">
      {children}
    </span>
  );
}
