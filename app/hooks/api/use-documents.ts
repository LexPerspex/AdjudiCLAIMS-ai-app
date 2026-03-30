import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ClaimDocument {
  id: string;
  claimId: string;
  name: string;
  documentType: string;
  uploadedAt: string;
  ocrStatus: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  classificationStatus: 'UNCLASSIFIED' | 'CLASSIFIED' | 'REVIEW_NEEDED';
  fileSize?: number;
  mimeType?: string;
  uploadedBy?: string;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useClaimDocuments(claimId: string) {
  return useQuery<ClaimDocument[]>({
    queryKey: ['documents', 'claim', claimId],
    queryFn: () => apiFetch<ClaimDocument[]>(`/claims/${claimId}/documents`),
    enabled: Boolean(claimId),
  });
}

export function useUploadDocument(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiFetch<ClaimDocument>('/documents/upload', {
        method: 'POST',
        headers: {},
        body: formData,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', 'claim', claimId] });
    },
  });
}
