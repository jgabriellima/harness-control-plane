import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';

import * as Sentry from '@sentry/astro';

import { resolveHarnessBinding } from './harness-binding';
import type {
  BusinessConfig,
  ExecutionDispatchResponse,
  ExecutionJob,
  ExecutionRequest,
} from './harness-types';
import { loadBusinessConfig } from './harness-reader';

const DEFAULT_RUNTIME = 'agent';

function generateExecutionId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const suffix = Math.random().toString(36).slice(2, 10);
  return `run-exec-${stamp}-${suffix}`;
}

function resolveDefaultWorkflow(config: BusinessConfig): string | undefined {
  const execution = config.execution;
  if (!execution) {
    return undefined;
  }
  return execution.defaultWorkflow ?? execution.default_workflow;
}

async function listWorkflowIds(workflowsDir: string): Promise<string[]> {
  let entries: string[];

  try {
    entries = await readdir(workflowsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.endsWith('.yaml'))
    .map((entry) => entry.slice(0, -'.yaml'.length))
    .sort();
}

async function resolveWorkflowId(
  requestedWorkflowId: string | undefined,
  config: BusinessConfig,
  workflowsDir: string,
): Promise<string> {
  if (requestedWorkflowId) {
    return requestedWorkflowId;
  }

  const configured = resolveDefaultWorkflow(config);
  if (configured) {
    return configured;
  }

  const workflows = await listWorkflowIds(workflowsDir);
  if (workflows.length === 0) {
    throw new Error('No runnable workflow configured. Add a workflow DSL under the harness workflows directory.');
  }

  return workflows[0];
}

export async function buildExecutionJob(request: ExecutionRequest): Promise<ExecutionJob> {
  const binding = await resolveHarnessBinding();
  const config = await loadBusinessConfig(binding.workspaceRoot);
  const workflowId = await resolveWorkflowId(request.workflow_id, config, binding.workflowsDir);

  return {
    execution_id: request.execution_id ?? generateExecutionId(),
    tenant_id: request.tenant_id ?? null,
    project_id: request.project_id,
    user_id: request.user_id ?? null,
    runtime: request.runtime ?? DEFAULT_RUNTIME,
    objective: request.objective,
    workflow_id: workflowId,
    metadata: request.metadata ?? {},
  };
}

export async function dispatchExecutionJob(job: ExecutionJob): Promise<ExecutionDispatchResponse> {
  return Sentry.startSpan(
    {
      name: 'dispatchExecutionJob',
      op: 'harness.dispatch',
      attributes: {
        execution_id: job.execution_id,
        workflow_id: job.workflow_id,
        project_id: job.project_id,
      },
    },
    async () => {
      const binding = await resolveHarnessBinding();
      const workflows = await listWorkflowIds(binding.workflowsDir);
      if (!workflows.includes(job.workflow_id)) {
        throw new Error(`Workflow not found: ${job.workflow_id}`);
      }

      const child = spawn(
        'python3',
        [
          binding.runnerScript,
          'run',
          '--workflow',
          job.workflow_id,
          '--intent',
          job.objective,
          '--run-id',
          job.execution_id,
          '--mode',
          job.runtime === 'stub' ? 'stub' : 'agent',
        ],
        {
          cwd: binding.workspaceRoot,
          detached: true,
          stdio: 'ignore',
        },
      );

      child.unref();

      child.on('error', (error) => {
        Sentry.captureException(error);
      });

      return {
        execution_id: job.execution_id,
        status: 'QUEUED',
        run_id: job.execution_id,
        workflow_id: job.workflow_id,
      };
    },
  );
}
