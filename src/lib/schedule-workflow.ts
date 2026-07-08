import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { stringify as stringifyYaml } from 'yaml';

import { resolveHarnessBinding } from './harness-binding';
import { resolveActiveWorkspaceRoot } from './workspace-manager';

export interface ScheduledWorkflowInput {
  workflowId: string;
  title: string;
  description: string;
  cron: string;
  icon?: string;
}

function slugifyWorkflowId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug ? `sched-${slug}` : `sched-task-${Date.now()}`;
}

export function deriveScheduledWorkflowId(title: string, explicitId?: string): string {
  const trimmed = explicitId?.trim();
  if (trimmed) {
    return trimmed.startsWith('sched-') ? trimmed : `sched-${trimmed}`;
  }
  return slugifyWorkflowId(title);
}

export function buildScheduledWorkflowDocument(input: ScheduledWorkflowInput): Record<string, unknown> {
  const command = `/business:workflow:${input.workflowId}`;
  return {
    apiVersion: 'business.jambu/v1',
    kind: 'Workflow',
    metadata: {
      id: input.workflowId,
      name: input.title,
      description: input.description,
      version: '1.0.0',
      command,
      labels: {
        scheduleIcon: input.icon ?? 'calendar',
        scheduleManaged: 'true',
      },
    },
    spec: {
      triggers: [
        {
          type: 'schedule',
          schedule: input.cron,
          action: 'run',
        },
        {
          type: 'command',
          command,
          action: 'run',
        },
      ],
      stateContract: 'schemas/workflow-state.schema.json',
      cognitiveOutputContract: 'schemas/cognitive-output.schema.json',
      runOutputContract: 'schemas/run-output.schema.json',
      capabilities: [],
      integrationSlots: [],
      nodes: [
        {
          id: 'execute-task',
          function: {
            invoke: {
              type: 'command',
              ref: '/business:workflow:scheduled-task:execute',
            },
            objective: input.description,
            outputSchema: 'schemas/cognitive-output.schema.json',
          },
          postCondition: {
            target: '$node.output',
            checks: [
              { type: 'schema', schema: 'schemas/cognitive-output.schema.json' },
              { ref: 'gates/structured-output.pass' },
            ],
          },
        },
      ],
    },
  };
}

export async function materializeScheduledWorkflow(
  input: Omit<ScheduledWorkflowInput, 'workflowId'> & { workflowId?: string },
): Promise<ScheduledWorkflowInput> {
  const workspaceRoot = await resolveActiveWorkspaceRoot();
  const binding = await resolveHarnessBinding({ workspaceRoot });
  const workflowId = deriveScheduledWorkflowId(input.title, input.workflowId);
  const resolved: ScheduledWorkflowInput = {
    workflowId,
    title: input.title.trim(),
    description: input.description.trim(),
    cron: input.cron.trim(),
    icon: input.icon,
  };

  const doc = buildScheduledWorkflowDocument(resolved);
  const workflowPath = join(binding.workflowsDir, `${workflowId}.yaml`);
  await writeFile(workflowPath, stringifyYaml(doc, { lineWidth: 0 }), 'utf8');
  return resolved;
}
