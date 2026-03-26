/**
 * Temporal worker entry point for the LLM jobs task queue.
 *
 * Handles: chat responses, counsel referrals, OMFS comparisons.
 *
 * Run with: npx tsx server/temporal/llm/worker.ts
 *
 * Environment variables:
 *   TEMPORAL_ADDRESS   — Temporal server address (default: localhost:7233)
 *   TEMPORAL_NAMESPACE — Temporal namespace (default: adjudiclaims)
 */

import { Worker, NativeConnection } from '@temporalio/worker';
import { SentryActivityInterceptor } from '../sentry-interceptor.js';
import { initSentry } from '../../lib/instrumentation.js';
import { TEMPORAL_TASK_QUEUES } from '../../constants/temporal.js';
import * as activities from './activities.js';

async function run(): Promise<void> {
  initSentry();

  const connection = await NativeConnection.connect({
    address: process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233',
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env['TEMPORAL_NAMESPACE'] ?? 'adjudiclaims',
    taskQueue: TEMPORAL_TASK_QUEUES.LLM_JOBS,
    workflowsPath: new URL('./workflows.js', import.meta.url).pathname,
    activities,
    interceptors: {
      activityInbound: [() => new SentryActivityInterceptor()],
    },
  });

  console.log('LLM jobs worker started');
  await worker.run();
}

run().catch((err: unknown) => {
  console.error('LLM worker failed:', err);
  process.exit(1);
});
