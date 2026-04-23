import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Letter {
  id: string;
  claimId: string;
  letterType: string;
  templateId: string;
  recipient: string;
  recipientRole: string;
  status: 'DRAFT' | 'GENERATED' | 'SENT' | 'DELIVERED';
  generatedAt: string;
  sentAt?: string;
  content?: string;
  generatedBy?: string;
}

export interface LetterTemplate {
  id: string;
  name: string;
  category: 'BENEFIT_NOTICE' | 'MEDICAL_REQUEST' | 'CORRESPONDENCE';
  description: string;
  requiredFields: string[];
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useClaimLetters(claimId: string) {
  return useQuery<Letter[]>({
    queryKey: ['letters', 'claim', claimId],
    queryFn: () => apiFetch<Letter[]>(`/claims/${claimId}/letters`),
    enabled: Boolean(claimId),
  });
}

export function useLetterTemplates() {
  return useQuery<LetterTemplate[]>({
    queryKey: ['letters', 'templates'],
    queryFn: () => apiFetch<LetterTemplate[]>('/letters/templates'),
  });
}

export function useGenerateLetter(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { templateId: string; recipientRole: string; notes?: string }) =>
      apiFetch<Letter>('/letters/generate', {
        method: 'POST',
        body: JSON.stringify({ claimId, ...payload }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['letters', 'claim', claimId] });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  AJC-16 — PDF / HTML print export helpers                            */
/* ------------------------------------------------------------------ */

/**
 * Build the print-ready HTML URL for a letter. Open this URL in a new tab
 * and the user can use the browser's Print → Save as PDF function to
 * produce a PDF without a server-side PDF library dependency.
 */
export function letterPrintUrl(letterId: string): string {
  return `/api/letters/${letterId}/html`;
}

/**
 * Build the download URL for a letter (same HTML body but served with
 * Content-Disposition: attachment, so the browser triggers a download
 * dialog).
 */
export function letterDownloadUrl(letterId: string): string {
  return `/api/letters/${letterId}/pdf`;
}
