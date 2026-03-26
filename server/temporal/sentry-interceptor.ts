/**
 * Sentry activity interceptor for Temporal workers.
 *
 * Captures errors BEFORE Temporal serializes them across the activity boundary,
 * preserving full stack traces and context for error tracking.
 */

import type { ActivityInboundCallsInterceptor, Next } from '@temporalio/worker';
import type { ActivityExecuteInput } from '@temporalio/worker';
import { Context } from '@temporalio/activity';
import * as Sentry from '@sentry/node';

/**
 * Sentry interceptor for Temporal activity execution.
 *
 * Captures errors BEFORE Temporal serializes them across the activity boundary.
 * This is critical because Temporal serializes errors into ApplicationFailure
 * objects for transport between worker and server, which strips the original
 * stack trace, error class name, and any attached context. By capturing the
 * error here in the interceptor, Sentry receives the full, unmangled error
 * with the original stack trace and execution context (workflow ID, activity
 * type, attempt number, task queue).
 *
 * The error is re-thrown after capture so Temporal's retry logic still operates
 * normally.
 */
export class SentryActivityInterceptor implements ActivityInboundCallsInterceptor {
  /**
   * Wrap activity execution with Sentry error capture.
   *
   * @param input - The activity execution input from Temporal.
   * @param next - The next interceptor in the chain (or the activity itself).
   * @returns The activity result.
   * @throws The original error after it has been captured by Sentry.
   */
  async execute(input: ActivityExecuteInput, next: Next<ActivityInboundCallsInterceptor, 'execute'>): Promise<unknown> {
    try {
      return await next(input);
    } catch (error) {
      const activityInfo = Context.current().info;

      Sentry.captureException(error, {
        tags: {
          component: 'temporal-activity',
          activityType: activityInfo.activityType,
          taskQueue: activityInfo.taskQueue,
        },
        extra: {
          workflowExecution: {
            workflowId: activityInfo.workflowExecution.workflowId,
            runId: activityInfo.workflowExecution.runId,
          },
          activityId: activityInfo.activityId,
          attempt: activityInfo.attempt,
        },
      });

      // Re-throw for Temporal's retry logic
      throw error;
    }
  }
}
