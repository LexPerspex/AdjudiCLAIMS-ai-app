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
 * Uses lazy connection — doesn't block server startup.
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
 * WorkflowExecutionAlreadyStartedError (deduplication).
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
