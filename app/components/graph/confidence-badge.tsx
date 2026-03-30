/**
 * ConfidenceBadge — Graph RAG G5 Trust UX
 *
 * Displays a confidence level with color-coded badge and percentage tooltip.
 * Used wherever graph node/edge confidence scores are surfaced to the examiner.
 *
 * Color scale:
 *   HIGH   (> 0.8):  Green  — strong extraction confidence
 *   MEDIUM (0.5–0.8): Amber — moderate confidence, may need verification
 *   LOW    (< 0.5):  Red   — low confidence, human review recommended
 */

import { Check, AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '~/lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ConfidenceBadgeProps {
  confidence: number;
  size?: 'sm' | 'md';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function getLevel(confidence: number): ConfidenceLevel {
  if (confidence > 0.8) return 'HIGH';
  if (confidence >= 0.5) return 'MEDIUM';
  return 'LOW';
}

const levelConfig: Record<
  ConfidenceLevel,
  {
    label: string;
    badgeClass: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  HIGH: {
    label: 'High confidence',
    badgeClass: 'bg-green-100 text-green-800 border-green-200',
    Icon: Check,
  },
  MEDIUM: {
    label: 'Medium confidence',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    Icon: AlertTriangle,
  },
  LOW: {
    label: 'Low confidence',
    badgeClass: 'bg-red-100 text-red-800 border-red-200',
    Icon: HelpCircle,
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function ConfidenceBadge({ confidence, size = 'sm' }: ConfidenceBadgeProps) {
  const level = getLevel(confidence);
  const { label, badgeClass, Icon } = levelConfig[level];
  const pct = Math.round(confidence * 100);

  const sizeClass = size === 'md'
    ? 'px-2 py-1 text-[10px] gap-1.5'
    : 'px-1.5 py-0.5 text-[9px] gap-1';
  const iconSize = size === 'md' ? 'w-3 h-3' : 'w-2.5 h-2.5';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold cursor-default',
        sizeClass,
        badgeClass,
      )}
      title={`${label} — ${pct}% extraction confidence`}
      aria-label={`${label} (${pct}%)`}
    >
      <Icon className={iconSize} aria-hidden />
      {pct}%
    </span>
  );
}
