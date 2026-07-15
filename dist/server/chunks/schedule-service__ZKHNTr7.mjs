import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { d as loadScheduleRegistry } from './harness-reader_xurzrbMU.mjs';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { d as resolveActiveWorkspaceRoot } from './workspace-manager_C2YuGzrP.mjs';

function slugifyWorkflowId(title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug ? `sched-${slug}` : `sched-task-${Date.now()}`;
}
function deriveScheduledWorkflowId(title, explicitId) {
  const trimmed = explicitId?.trim();
  if (trimmed) {
    return trimmed.startsWith("sched-") ? trimmed : `sched-${trimmed}`;
  }
  return slugifyWorkflowId(title);
}
function buildScheduledWorkflowDocument(input) {
  const command = `/business:workflow:${input.workflowId}`;
  return {
    apiVersion: "business.jambu/v1",
    kind: "Workflow",
    metadata: {
      id: input.workflowId,
      name: input.title,
      description: input.description,
      version: "1.0.0",
      command,
      labels: {
        scheduleIcon: input.icon ?? "calendar",
        scheduleManaged: "true"
      }
    },
    spec: {
      triggers: [
        {
          type: "schedule",
          schedule: input.cron,
          action: "run"
        },
        {
          type: "command",
          command,
          action: "run"
        }
      ],
      stateContract: "schemas/workflow-state.schema.json",
      cognitiveOutputContract: "schemas/cognitive-output.schema.json",
      runOutputContract: "schemas/run-output.schema.json",
      capabilities: [],
      integrationSlots: [],
      nodes: [
        {
          id: "execute-task",
          function: {
            invoke: {
              type: "command",
              ref: "/business:workflow:scheduled-task:execute"
            },
            objective: input.description,
            outputSchema: "schemas/cognitive-output.schema.json"
          },
          postCondition: {
            target: "$node.output",
            checks: [
              { type: "schema", schema: "schemas/cognitive-output.schema.json" },
              { ref: "gates/structured-output.pass" }
            ]
          }
        }
      ]
    }
  };
}
async function materializeScheduledWorkflow(input) {
  const workspaceRoot = await resolveActiveWorkspaceRoot();
  const binding = await resolveHarnessBinding({ workspaceRoot });
  const workflowId = deriveScheduledWorkflowId(input.title, input.workflowId);
  const resolved = {
    workflowId,
    title: input.title.trim(),
    description: input.description.trim(),
    cron: input.cron.trim(),
    icon: input.icon
  };
  const doc = buildScheduledWorkflowDocument(resolved);
  const workflowPath = join(binding.workflowsDir, `${workflowId}.yaml`);
  await writeFile(workflowPath, stringify(doc, { lineWidth: 0 }), "utf8");
  return resolved;
}

const execFileAsync = promisify(execFile);
async function scheduleScriptPath() {
  const workspaceRoot = await resolveActiveWorkspaceRoot();
  const binding = await resolveHarnessBinding({ workspaceRoot });
  return {
    script: `${binding.harnessRoot}/bin/${binding.cliPrefix}_schedule_registry.py`,
    cwd: binding.workspaceRoot
  };
}
async function rebuildScheduleRegistry() {
  const { script, cwd } = await scheduleScriptPath();
  await execFileAsync("python3", [script, "rebuild"], { cwd, maxBuffer: 1024 * 1024 });
}
function findScheduleEntry(entries, workflowId, entryId) {
  if (entryId) {
    const exact = entries.find((entry) => entry.id === entryId);
    if (exact) {
      return exact;
    }
  }
  const scheduleEntry = entries.find(
    (entry) => entry.workflowId === workflowId && entry.trigger.type === "schedule"
  );
  if (scheduleEntry) {
    return scheduleEntry;
  }
  return entries.find((entry) => entry.workflowId === workflowId);
}
async function registerScheduleEntry(input) {
  const materialized = await materializeScheduledWorkflow({
    title: input.title,
    description: input.description,
    cron: input.cron,
    icon: input.icon,
    workflowId: input.workflowId
  });
  await rebuildScheduleRegistry();
  const registry = await loadScheduleRegistry();
  if (!registry) {
    throw new Error("Schedule registry missing after rebuild");
  }
  const expectedEntryId = input.entryId ?? `sched-${materialized.workflowId}-0`;
  const entry = findScheduleEntry(registry.spec.entries, materialized.workflowId, expectedEntryId);
  if (!entry) {
    throw new Error(`Schedule entry not found for workflow ${materialized.workflowId}`);
  }
  return entry;
}
async function setScheduleEnabled(entryId, enabled) {
  const { script, cwd } = await scheduleScriptPath();
  function parseJsonStdout(stdout2) {
    const trimmed = stdout2.trim();
    if (!trimmed) {
      throw new Error("Empty response from schedule registry");
    }
    return JSON.parse(trimmed);
  }
  const command = enabled ? "enable" : "disable";
  const { stdout } = await execFileAsync("python3", [script, command, "--entry-id", entryId], {
    cwd,
    maxBuffer: 1024 * 1024
  });
  return parseJsonStdout(stdout);
}
async function deleteScheduleEntry(entryId) {
  const { script, cwd } = await scheduleScriptPath();
  await execFileAsync("python3", [script, "delete", "--entry-id", entryId], {
    cwd,
    maxBuffer: 1024 * 1024
  });
}
async function runScheduleNow(entryId) {
  const { script, cwd } = await scheduleScriptPath();
  function parseJsonStdout(stdout2) {
    const trimmed = stdout2.trim();
    if (!trimmed) {
      throw new Error("Empty response from schedule registry");
    }
    return JSON.parse(trimmed);
  }
  const { stdout } = await execFileAsync("python3", [script, "run-now", "--entry-id", entryId], {
    cwd,
    maxBuffer: 1024 * 1024
  });
  return parseJsonStdout(stdout);
}

export { registerScheduleEntry as a, deleteScheduleEntry as d, runScheduleNow as r, setScheduleEnabled as s };
