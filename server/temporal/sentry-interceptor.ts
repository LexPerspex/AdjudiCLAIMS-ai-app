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

export class SentryActivityInterceptor implements ActivityInboundCallsInterceptor {
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
