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

/**
 * A single entity referenced during graph traversal for this response.
 * Surfaced in the entity panel (G5 Trust UX).
 */
export interface GraphTrustEntity {
  id: string;
  name: string;
  nodeType: string;
  confidence: number;
  confidenceBadge: 'verified' | 'confident' | 'suggested' | 'ai_generated';
  aliases: string[];
  sourceCount: number;
}

/**
 * A source document that contributed to this response.
 * Surfaced in the provenance panel (G5 Trust UX).
 */
export interface GraphTrustSource {
  documentName: string;
  documentType?: string;
  confidence: number;
  extractedAt: string;
}

/**
 * Graph RAG trust transparency data (G5 Trust UX — AJC-14).
 *
 * Surfaces which graph entities and source documents contributed to the
 * AI response so the examiner can see exactly why the answer was given.
 * Factual display only — no legal analysis.
 */
export interface GraphTrustData {
  overallConfidence: number;
  entities: GraphTrustEntity[];
  provenance: GraphTrustSource[];
  graphContextUsed: boolean;
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
  /** G5 Trust UX: confidence badge, entity panel, source provenance. */
  graphTrust?: GraphTrustData;
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
