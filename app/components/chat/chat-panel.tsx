import { useState, useRef, useEffect } from 'react';
import { Send, Lock, Info, ChevronDown, ChevronUp, Gavel, Bot } from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  useChatMessages,
  useSendChatMessage,
  type ChatMessage,
  type ChatSession,
  type Citation,
} from '~/hooks/api/use-chat';

/* ------------------------------------------------------------------ */
/*  UPL Zone badge colors                                              */
/* ------------------------------------------------------------------ */

const zoneConfig = {
  GREEN: { label: 'UPL: Green Zone', className: 'bg-upl-green text-white' },
  YELLOW: { label: 'UPL: Yellow Zone', className: 'bg-upl-yellow text-white' },
  RED: { label: 'UPL: Red Zone', className: 'bg-upl-red text-white' },
} as const;

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ChatPanelProps {
  claimId: string;
  sessions: ChatSession[];
  activeSessionId: string;
  onSessionChange: (sessionId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Chat Panel                                                         */
/* ------------------------------------------------------------------ */

export function ChatPanel({
  claimId,
  sessions,
  activeSessionId,
  onSessionChange,
}: ChatPanelProps) {
  const messagesQuery = useChatMessages(activeSessionId);
  const sendMessage = useSendChatMessage();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = messagesQuery.data ?? [];

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || !activeSessionId) return;
    sendMessage.mutate({
      sessionId: activeSessionId,
      claimId,
      content: trimmed,
    });
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with session selector */}
      <div className="p-4 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low/50">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <span className="font-bold tracking-tight">AI Assistant</span>
        </div>
        {sessions.length > 1 && (
          <select
            className="text-xs bg-transparent border border-outline-variant/20 rounded px-2 py-1"
            value={activeSessionId}
            onChange={(e) => onSessionChange(e.target.value)}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {messagesQuery.isLoading && (
          <p className="text-sm text-slate-400 text-center py-8">Loading messages...</p>
        )}
        {messages.map((msg) =>
          msg.role === 'assistant' ? (
            <AssistantMessage key={msg.id} message={msg} />
          ) : (
            <UserMessage key={msg.id} message={msg} />
          ),
        )}
        {sendMessage.isPending && <TypingIndicator />}
      </div>

      {/* Input */}
      <div className="p-4 bg-surface-container-low/30 backdrop-blur-md">
        <div className="relative">
          <textarea
            className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-3 pr-10 text-xs resize-none focus:ring-1 focus:ring-primary focus:border-primary min-h-[80px] shadow-sm"
            placeholder="Ask about claim status or regulations..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="absolute right-2 bottom-2 text-primary disabled:opacity-40"
            onClick={handleSend}
            disabled={!input.trim() || sendMessage.isPending}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between px-1">
          <span className="text-[9px] text-slate-500 flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" />
            Privileged &amp; Confidential
          </span>
          <span className="text-[9px] text-slate-400">v2.4.1</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Message components                                                 */
/* ------------------------------------------------------------------ */

function AssistantMessage({ message }: { message: ChatMessage }) {
  const zone = message.uplZone ? zoneConfig[message.uplZone] : undefined;
  const isRed = message.uplZone === 'RED';
  const isYellow = message.uplZone === 'YELLOW';

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'p-4 rounded-xl rounded-tl-none border',
          isRed ? 'bg-error/5 border-error/20' : 'bg-primary/5 border-primary/10',
        )}
      >
        {/* UPL zone badge */}
        {zone && (
          <div className="flex items-center gap-2 mb-2">
            <span
              className={cn(
                'px-2 py-0.5 rounded text-[8px] font-bold uppercase',
                zone.className,
              )}
            >
              {zone.label}
            </span>
          </div>
        )}

        {/* Message content */}
        {isRed ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs leading-relaxed text-error font-medium">
              This question requires legal analysis and cannot be answered by the AI
              assistant. Please consult with defense counsel for guidance on this matter.
            </p>
            <button className="self-start flex items-center gap-2 px-3 py-1.5 bg-error/10 text-error text-xs font-bold rounded-lg hover:bg-error/20 transition-colors">
              <Gavel className="w-3 h-3" />
              Refer to Counsel
            </button>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-on-surface-variant">{message.content}</p>
        )}

        {/* Yellow disclaimer */}
        {isYellow && message.disclaimer && (
          <div className="mt-4 pt-3 border-t border-primary/5 flex items-start gap-2 text-[9px] text-slate-500 italic">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{message.disclaimer}</span>
          </div>
        )}

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <CitationsList citations={message.citations} />
        )}
      </div>
      <div className="flex justify-end">
        <span className="text-[10px] text-slate-400">
          Assistant &#x2022; {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex flex-col gap-3 items-end">
      <div className="bg-primary text-white p-4 rounded-xl rounded-tr-none shadow-md max-w-[90%]">
        <p className="text-xs leading-relaxed">{message.content}</p>
      </div>
      <span className="text-[10px] text-slate-400">
        You &#x2022; {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

function CitationsList({ citations }: { citations: Citation[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-3 pt-3 border-t border-primary/5">
      <button
        className="text-[9px] font-bold text-primary flex items-center gap-1"
        onClick={() => setExpanded((v) => !v)}
      >
        {citations.length} citation{citations.length !== 1 ? 's' : ''}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {citations.map((c) => (
            <div
              key={c.id}
              className="bg-surface-container-low p-2 rounded text-[9px] text-on-surface-variant"
            >
              <p className="font-bold text-on-surface">{c.title}</p>
              <p className="text-slate-500">{c.source}</p>
              <p className="mt-1 italic">{c.excerpt}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2">
      <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0ms]" />
      <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:150ms]" />
      <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:300ms]" />
    </div>
  );
}
