import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'CLAIMS_EXAMINER' | 'CLAIMS_SUPERVISOR' | 'CLAIMS_ADMIN';
  organizationId: string;
}

interface SessionResponse {
  user: AuthUser | null;
}

/**
 * Auth hook — checks the current session via GET /api/auth/session.
 * Returns the authenticated user, loading state, and a boolean flag.
 */
export function useAuth() {
  const { data, isLoading, error } = useQuery<SessionResponse>({
    queryKey: ['auth', 'session'],
    queryFn: () => apiFetch<SessionResponse>('/auth/session'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    user: data?.user ?? null,
    isLoading,
    isAuthenticated: !!data?.user,
    error,
  };
}
