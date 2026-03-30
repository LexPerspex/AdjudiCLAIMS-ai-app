import { useState } from 'react';
import { useParams } from 'react-router';
import {
  AlertCircle,
  RefreshCw,
  Clock,
  FileText,
  CheckCircle,
  XCircle,
  ArrowRight,
  MessageSquare,
  DollarSign,
  UserPlus,
  Mail,
  Stethoscope,
  Shield,
  Filter,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { useClaimTimeline, type TimelineEvent } from '~/hooks/api/use-timeline';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type EventIconConfig = {
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  text: string;
};

function eventConfig(eventType: TimelineEvent['eventType']): EventIconConfig {
  switch (eventType) {
    case 'CLAIM_CREATED':
      return { icon: Shield, bg: 'bg-primary/10', text: 'text-primary' };
    case 'DOCUMENT_UPLOADED':
      return {
        icon: FileText,
        bg: 'bg-surface-container-high',
        text: 'text-on-surface-variant',
      };
    case 'DEADLINE_MET':
      return { icon: CheckCircle, bg: 'bg-secondary/10', text: 'text-secondary' };
    case 'DEADLINE_MISSED':
      return { icon: XCircle, bg: 'bg-error/10', text: 'text-error' };
    case 'STATUS_CHANGED':
      return {
        icon: ArrowRight,
        bg: 'bg-tertiary-container/10',
        text: 'text-tertiary-container',
      };
    case 'NOTE_ADDED':
      return {
        icon: MessageSquare,
        bg: 'bg-surface-container-high',
        text: 'text-on-surface-variant',
      };
    case 'PAYMENT_ISSUED':
      return { icon: DollarSign, bg: 'bg-secondary/10', text: 'text-secondary' };
    case 'REFERRAL_MADE':
      return { icon: UserPlus, bg: 'bg-error/10', text: 'text-error' };
    case 'LETTER_SENT':
      return { icon: Mail, bg: 'bg-primary/10', text: 'text-primary' };
    case 'EXAMINATION_SCHEDULED':
    case 'EXAMINATION_COMPLETED':
      return {
        icon: Stethoscope,
        bg: 'bg-tertiary-container/10',
        text: 'text-tertiary-container',
      };
    case 'INVESTIGATION_UPDATED':
      return { icon: CheckCircle, bg: 'bg-secondary/10', text: 'text-secondary' };
    default:
      return {
        icon: Clock,
        bg: 'bg-surface-container-high',
        text: 'text-on-surface-variant',
      };
  }
}

const EVENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Events' },
  { value: 'DOCUMENT_UPLOADED', label: 'Documents' },
  { value: 'DEADLINE_MET', label: 'Deadlines Met' },
  { value: 'DEADLINE_MISSED', label: 'Deadlines Missed' },
  { value: 'STATUS_CHANGED', label: 'Status Changes' },
  { value: 'PAYMENT_ISSUED', label: 'Payments' },
  { value: 'REFERRAL_MADE', label: 'Referrals' },
  { value: 'LETTER_SENT', label: 'Letters Sent' },
  { value: 'EXAMINATION_SCHEDULED', label: 'Examinations' },
];

/* ------------------------------------------------------------------ */
/*  Timeline Tab                                                       */
/* ------------------------------------------------------------------ */

export default function ClaimTimelineTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const timelineQuery = useClaimTimeline(
    claimId ?? '',
    eventTypeFilter ? { eventType: eventTypeFilter } : undefined,
  );

  const events = timelineQuery.data ?? [];

  if (timelineQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading timeline...</p>
      </div>
    );
  }

  if (timelineQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load timeline.</p>
        <button
          onClick={() => void timelineQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
            showFilters
              ? 'bg-primary/10 text-primary'
              : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          Filter
        </button>
        {showFilters && (
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
          >
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
        {eventTypeFilter && (
          <button
            onClick={() => setEventTypeFilter('')}
            className="text-xs text-primary hover:underline"
          >
            Clear filter
          </button>
        )}
        <span className="text-xs text-on-surface-variant ml-auto">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Clock className="w-10 h-10 text-slate-300" />
          <p className="text-sm text-on-surface-variant">No timeline events found.</p>
        </div>
      ) : (
        <div className="relative flex flex-col gap-0">
          <div className="absolute left-[23px] top-4 bottom-4 w-0.5 bg-outline-variant/20" />

          {events.map((event, idx) => {
            const cfg = eventConfig(event.eventType);
            const EventIcon = cfg.icon;

            const prevEvent = events[idx - 1];
            const currentDate = new Date(event.occurredAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            });
            const prevDate =
              prevEvent &&
              new Date(prevEvent.occurredAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              });
            const showDateSeparator = idx === 0 || currentDate !== prevDate;

            return (
              <div key={event.id}>
                {showDateSeparator && (
                  <div className="relative flex items-center gap-4 py-3 pl-14">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {currentDate}
                    </span>
                  </div>
                )}
                <div className="relative flex gap-5 pb-5">
                  <div
                    className={cn(
                      'relative z-10 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0',
                      cfg.bg,
                    )}
                  >
                    <EventIcon className={cn('w-5 h-5', cfg.text)} />
                  </div>

                  <div className="flex-1 bg-surface-container-low rounded-xl p-4 flex flex-col gap-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-on-surface">{event.description}</p>
                      <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">
                        {new Date(event.occurredAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {event.actor && (
                        <span className="text-[10px] text-on-surface-variant">
                          {event.actor}
                          {event.actorRole && ` · ${event.actorRole}`}
                        </span>
                      )}
                      {event.sourceDocumentName && (
                        <span className="text-[10px] text-primary flex items-center gap-0.5">
                          <FileText className="w-3 h-3" />
                          {event.sourceDocumentName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
