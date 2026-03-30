/**
 * ProvenanceCard — Graph RAG G5 Trust UX
 *
 * Displays where a piece of extracted information came from:
 * the source document, page number, extraction confidence, and timestamp.
 * Used inside EntityPanel and as inline provenance in chat messages.
 */

import { FileText, ExternalLink, Calendar } from 'lucide-react';
import { cn } from '~/lib/utils';
import { ConfidenceBadge } from './confidence-badge';

/* ------------------------------------------------------------------ */
/*  Document type label map                                             */
/* ------------------------------------------------------------------ */

const DOC_TYPE_LABELS: Record<string, string> = {
  DWC1_CLAIM_FORM: 'DWC-1',
  MEDICAL_REPORT: 'Medical Report',
  BILLING_STATEMENT: 'Billing',
  LEGAL_CORRESPONDENCE: 'Legal Correspondence',
  EMPLOYER_REPORT: 'Employer Report',
  INVESTIGATION_REPORT: 'Investigation',
  UTILIZATION_REVIEW: 'UR Report',
  AME_QME_REPORT: 'AME/QME',
  DEPOSITION_TRANSCRIPT: 'Deposition',
  IMAGING_REPORT: 'Imaging',
  PHARMACY_RECORD: 'Pharmacy',
  WAGE_STATEMENT: 'Wage Statement',
  BENEFIT_NOTICE: 'Benefit Notice',
  SETTLEMENT_DOCUMENT: 'Settlement',
  CORRESPONDENCE: 'Correspondence',
  WCAB_FILING: 'WCAB Filing',
  LIEN_CLAIM: 'Lien Claim',
  OTHER: 'Document',
};

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface ProvenanceSource {
  documentName: string;
  documentType?: string;
  pageNumber?: number;
  confidence: number;
  extractedAt: string;
  /** Optional URL to navigate to the document viewer */
  documentUrl?: string;
}

export interface ProvenanceCardProps {
  source: ProvenanceSource;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function ProvenanceCard({ source, className }: ProvenanceCardProps) {
  const typeLabel = source.documentType
    ? (DOC_TYPE_LABELS[source.documentType] ?? source.documentType)
    : 'Document';

  const extractedDate = new Date(source.extractedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg bg-surface-container-low border border-outline-variant/10',
        className,
      )}
    >
      {/* Icon */}
      <div className="shrink-0 mt-0.5 w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
        <FileText className="w-4 h-4 text-primary" />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Document name + type badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-on-surface truncate">{source.documentName}</span>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-surface-container-highest text-on-surface-variant uppercase tracking-wide shrink-0">
            {typeLabel}
          </span>
        </div>

        {/* Page + date row */}
        <div className="mt-1 flex items-center gap-3 text-[9px] text-slate-500">
          {source.pageNumber !== undefined && (
            <span>Page {source.pageNumber}</span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-2.5 h-2.5" />
            {extractedDate}
          </span>
        </div>
      </div>

      {/* Right side: confidence + link */}
      <div className="flex items-start gap-2 shrink-0">
        <ConfidenceBadge confidence={source.confidence} size="sm" />
        {source.documentUrl && (
          <a
            href={source.documentUrl}
            className="text-[9px] font-bold text-primary flex items-center gap-0.5 hover:underline"
            aria-label={`View ${source.documentName}`}
          >
            <ExternalLink className="w-2.5 h-2.5" />
            View
          </a>
        )}
      </div>
    </div>
  );
}
