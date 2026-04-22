import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/services/api';

/* ------------------------------------------------------------------ */
/*  Types — mirror server/services/compliance-dashboard.service.ts    */
/* ------------------------------------------------------------------ */

export interface DeadlineAdherence {
  met: number;
  missed: number;
  pending: number;
  total: number;
  adherenceRate: number; // 0–1
}

export interface UplSummary {
  green: number;
  yellow: number;
  red: number;
  blocked: number;
  total: number;
}

/** GET /api/compliance/examiner */
export interface ExaminerComplianceMetrics {
  deadlineAdherence: DeadlineAdherence;
  uplSummary: UplSummary;
  activeClaimsCount: number;
}

/** GET /api/compliance/team */
export interface TeamDeadlineAdherence {
  met: number;
  missed: number;
  pending: number;
  adherenceRate: number; // 0–1
}

export interface TeamUplCompliance {
  greenRate: number; // 0–1
  yellowRate: number; // 0–1
  redRate: number; // 0–1
  blockRate: number; // 0–1
}

export interface TrainingCompletion {
  complete: number;
  incomplete: number;
  total: number;
  completionRate: number; // 0–1
}

export interface ExaminerBreakdown {
  userId: string;
  name: string;
  deadlineAdherence: DeadlineAdherence;
  uplBlockRate: number; // 0–1
}

export interface SupervisorTeamMetrics {
  teamDeadlineAdherence: TeamDeadlineAdherence;
  teamUplCompliance: TeamUplCompliance;
  trainingCompletion: TrainingCompletion;
  examinerBreakdown: ExaminerBreakdown[];
}

/** GET /api/compliance/admin */
export interface ComplianceScoreBreakdown {
  deadlineScore: number; // 0–40
  investigationScore: number; // 0–30
  documentationScore: number; // 0–20
  uplScore: number; // 0–10
}

export interface AdminComplianceReport extends SupervisorTeamMetrics {
  doiAuditReadinessScore: number; // 0–100
  complianceScoreBreakdown: ComplianceScoreBreakdown;
}

/** GET /api/compliance/upl */
export interface ZoneDistribution {
  green: number;
  yellow: number;
  red: number;
}

export interface BlocksPerPeriod {
  period: string; // 'YYYY-MM-DD'
  count: number;
}

export interface UplMonitoringMetrics {
  zoneDistribution: ZoneDistribution;
  blocksPerPeriod: BlocksPerPeriod[];
  adversarialDetectionRate: number; // 0–1
}

/** GET /api/compliance/upl/blocks */
export interface RecentRedBlock {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  queryLengthBucket: 'short' | 'medium' | 'long';
  isAdversarial: boolean;
}

export interface RecentRedBlocksResponse {
  blocks: RecentRedBlock[];
}

/** GET /PUT /api/compliance/upl/alert-config */
export interface UplAlertConfig {
  redRateThreshold: number; // 0–1
  blockCountThreshold: number;
  alertsEnabled: boolean;}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useComplianceMetrics() {
  return useQuery<ExaminerComplianceMetrics>({
    queryKey: ['compliance', 'examiner'],
    queryFn: () => apiFetch<ExaminerComplianceMetrics>('/compliance/examiner'),
    refetchInterval: 60_000,
  });
}

export function useTeamCompliance() {
  return useQuery<SupervisorTeamMetrics>({
    queryKey: ['compliance', 'team'],
    queryFn: () => apiFetch<SupervisorTeamMetrics>('/compliance/team'),
    refetchInterval: 60_000,
  });
}

export function useAdminCompliance() {
  return useQuery<AdminComplianceReport>({
    queryKey: ['compliance', 'admin'],
    queryFn: () => apiFetch<AdminComplianceReport>('/compliance/admin'),
    refetchInterval: 60_000,
  });
}

export function useUplMonitoring(params?: { startDate?: string; endDate?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.startDate) searchParams.set('startDate', params.startDate);
  if (params?.endDate) searchParams.set('endDate', params.endDate);
  const qs = searchParams.toString();

  return useQuery<UplMonitoringMetrics>({
    queryKey: ['compliance', 'upl', params],
    queryFn: () => apiFetch<UplMonitoringMetrics>(`/compliance/upl${qs ? `?${qs}` : ''}`),
    refetchInterval: 60_000,
  });
}

export function useRecentUplBlocks(limit = 25) {
  return useQuery<RecentRedBlocksResponse>({
    queryKey: ['compliance', 'upl', 'blocks', limit],
    queryFn: () =>
      apiFetch<RecentRedBlocksResponse>(`/compliance/upl/blocks?limit=${String(limit)}`),
    refetchInterval: 60_000,
  });
}

export function useUplAlertConfig() {
  return useQuery<UplAlertConfig>({
    queryKey: ['compliance', 'upl', 'alert-config'],
    queryFn: () => apiFetch<UplAlertConfig>('/compliance/upl/alert-config'),
  });
}

export function useSetUplAlertConfig() {
  const queryClient = useQueryClient();
  return useMutation<UplAlertConfig, Error, Partial<UplAlertConfig>>({
    mutationFn: (updates) =>
      apiFetch<UplAlertConfig>('/compliance/upl/alert-config', {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['compliance', 'upl', 'alert-config'] });
    },
  });
}
