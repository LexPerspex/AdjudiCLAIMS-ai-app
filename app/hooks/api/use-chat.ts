import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChatSession {
  id: string;
  claimId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  uplZone?: 'GREEN' | 'YELLOW' | 'RED';
  citations?: Citation[];
  disclaimer?: string;
  createdAt: string;
}

export interface Citation {
  id: string;
  title: string;
  source: string;
  excerpt: string;
}

interface SendMessagePayload {
  sessionId: string;
  claimId: string;
  content: string;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useChatSessions(claimId: string) {
  return useQuery<ChatSession[]>({
    queryKey: ['chat', 'sessions', claimId],
    queryFn: () => apiFetch<ChatSession[]>(`/claims/${claimId}/chat/sessions`),
    enabled: Boolean(claimId),
  });
}

export function useChatMessages(sessionId: string) {
  return useQuery<ChatMessage[]>({
    queryKey: ['chat', 'messages', sessionId],
    queryFn: () => apiFetch<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`),
    enabled: Boolean(sessionId),
  });
}

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendMessagePayload) =>
      apiFetch<ChatMessage>(`/chat/sessions/${payload.sessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: payload.content, claimId: payload.claimId }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['chat', 'messages', variables.sessionId],
      });
    },
  });
}
