/**
 * Barrel export for document processing workflows.
 *
 * This file is referenced by the Temporal worker's workflowsPath option.
 * It must re-export all workflows that the worker should register.
 */

export { documentPipelineWorkflow } from './workflows/document-pipeline.workflow.js';
