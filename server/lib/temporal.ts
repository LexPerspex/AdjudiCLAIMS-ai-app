/**
 * Temporal client singleton.
 *
 * Lazy-initializes a connection to the Temporal server and provides
 * helper functions for starting workflows idempotently.
 *
 * Supports both local dev (plain gRPC) and Temporal Cloud (TLS + API key).
 */

import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { getEnv } from './env.js';

let _client: Client | null = null;
let _connection: Connection | null = null;

/**
 * Get or create the Temporal client singleton.
 *
 * Uses Connection.lazy() instead of Connection.connect() so that server startup
 * is not blocked by Temporal availability. The connection is established on the
 * first actual RPC call. This is important because the Fastify server should be
 * able to serve health checks and non-workflow routes even if Temporal is down.
 *
 * TLS is enabled automatically when TEMPORAL_API_KEY is set, which indicates
 * a Temporal Cloud deployment (Cloud requires mTLS or API key authentication).
 *
 * @returns The Temporal Client singleton instance.
 */
export function getTemporalClient(): Client {
  if (_client) return _client;

  const env = getEnv();

  _connection = Connection.lazy({
    address: env.TEMPORAL_ADDRESS,
    ...(env.TEMPORAL_API_KEY
      ? {
          tls: true,
          apiKey: env.TEMPORAL_API_KEY,
        }
      : {}),
  });

  _client = new Client({
    connection: _connection,
    namespace: env.TEMPORAL_NAMESPACE,
  });

  return _client;
}

/**
 * Start a workflow idempotently.
 *
 * If a workflow with the same ID is already running, swallows the
 * WorkflowExecutionAlreadyStartedError and returns the existing workflow ID.
 * This idempotent-start pattern is critical for document pipeline and OMFS
 * comparison workflows where duplicate triggers (e.g., re-upload, retry)
 * should not create duplicate processing.
 *
 * @param workflowName - The workflow function name registered with the worker.
 * @param options - Workflow ID, task queue, and arguments.
 * @returns The workflow ID (new or existing).
 * @throws Non-duplicate errors from the Temporal server.
 */
export async function startWorkflow(
  workflowName: string,
  options: {
    workflowId: string;
    taskQueue: string;
    args: unknown[];
  },
): Promise<string> {
  const client = getTemporalClient();

  try {
    const handle = await client.workflow.start(workflowName, {
      workflowId: options.workflowId,
      taskQueue: options.taskQueue,
      args: options.args,
    });
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      // Idempotent — workflow already running, return existing ID
      return options.workflowId;
    }
    throw err;
  }
}

/**
 * Get a workflow handle for querying status or waiting for result.
 *
 * @param workflowId - The workflow execution ID to get a handle for.
 * @returns A WorkflowHandle that can be used to query, signal, or await the workflow.
 */
export function getWorkflowHandle(workflowId: string) {
  const client = getTemporalClient();
  return client.workflow.getHandle(workflowId);
}

/**
 * Graceful shutdown — close the Temporal connection.
 */
export async function disconnectTemporal(): Promise<void> {
  if (_connection) {
    await _connection.close();
    _connection = null;
    _client = null;
  }
}
