/**
 * Security alert definitions for Cloud Monitoring / Cloud Alerting.
 *
 * These definitions describe the conditions, metrics, severities, and
 * response actions for each security alert type. They are consumed by:
 * - Cloud Monitoring alert policy provisioning scripts
 * - The anomaly detector middleware
 * - Incident response runbooks
 *
 * Alert conditions are evaluated against Cloud Logging metrics derived from
 * the AuditEvent table and HTTP access logs written by Fastify.
 */

export const SECURITY_ALERTS = {
  FAILED_LOGIN_SPIKE: {
    condition: 'Failed logins > 50 in 5 minutes',
    severity: 'HIGH',
    metric: 'audit_events where eventType = USER_LOGIN_FAILED',
    action: 'Notify security team',
  },
  UPL_BLOCK_SPIKE: {
    condition: 'UPL blocks > 20 in 5 minutes',
    severity: 'MEDIUM',
    metric: 'audit_events where eventType = UPL_OUTPUT_BLOCKED',
    action: 'Review zone boundary calibration',
  },
  ERROR_RATE_SPIKE: {
    condition: 'HTTP 5xx > 10 in 5 minutes',
    severity: 'HIGH',
    metric: 'http_responses where status >= 500',
    action: 'Page on-call',
  },
  HEALTH_CHECK_FAILURE: {
    condition: 'Health check returns non-200 for > 2 minutes',
    severity: 'CRITICAL',
    metric: 'uptime_check on /api/health',
    action: 'Page on-call immediately',
  },
  ANOMALY_DETECTED: {
    condition: 'Anomaly detector fires',
    severity: 'MEDIUM',
    metric: 'audit_events where eventType = ANOMALY_DETECTED',
    action: 'Review access patterns',
  },
} as const;

export type SecurityAlertType = keyof typeof SECURITY_ALERTS;
export type SecurityAlertSeverity = (typeof SECURITY_ALERTS)[SecurityAlertType]['severity'];
