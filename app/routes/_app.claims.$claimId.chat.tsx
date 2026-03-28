import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { ChatPanel } from '~/components/chat/chat-panel';
import { useChatSessions } from '~/hooks/api/use-chat';

/**
 * Full-page chat tab for a specific claim.
 * Loads available chat sessions and renders the ChatPanel component.
 */
export default function ClaimChatTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const sessionsQuery = useChatSessions(claimId ?? '');
  const sessions = sessionsQuery.data ?? [];
  const [activeSessionId, setActiveSessionId] = useState('');

  // Default to the first session when data loads
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0]!.id);
    }
  }, [sessions, activeSessionId]);

  if (sessionsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading chat sessions...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-on-surface-variant">No chat sessions yet for this claim.</p>
        <button className="primary-gradient text-white px-5 py-2 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
          Start New Session
        </button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-20rem)] bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
      <ChatPanel
        claimId={claimId ?? ''}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSessionChange={setActiveSessionId}
      />
    </div>
  );
}
