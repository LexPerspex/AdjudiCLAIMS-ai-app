/**
 * Temporal worker for the document processing task queue.
 *
 * Registers all document pipeline activities and workflows, connects
 * to the Temporal server, and starts polling for tasks.
 *
 * Run with: npx tsx server/temporal/document/worker.ts
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
    taskQueue: TEMPORAL_TASK_QUEUES.DOCUMENT_PROCESSING,
    workflowsPath: new URL('./workflows.js', import.meta.url).pathname,
    activities,
    interceptors: {
      activityInbound: [() => new SentryActivityInterceptor()],
    },
  });

  console.log('Document processing worker started');
  await worker.run();
}

run().catch((err: unknown) => {
  console.error('Document worker failed:', err);
  process.exit(1);
});
