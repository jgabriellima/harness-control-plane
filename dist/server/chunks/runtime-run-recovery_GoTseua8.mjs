import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { e as ensureWorkspacesReady, l as listWorkspaceProjects, r as resolveProjectWorkspaceRoot } from './workspace-manager_C2YuGzrP.mjs';

async function readRegistryEventsForRun(runId, workspaceRoot) {
  try {
    const binding = await resolveHarnessBinding({ workspaceRoot });
    const runsPath = join(binding.harnessRoot, "runtime-sessions", "runs.jsonl");
    const raw = await readFile(runsPath, "utf8");
    return raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((event) => event.runId === runId);
  } catch {
    return [];
  }
}
function metadataFromEvents(runId, workspaceRoot, events) {
  if (events.length === 0) {
    return null;
  }
  const started = events.find((event) => event.event === "run.started");
  const conversationId = typeof started?.conversationId === "string" ? started.conversationId : typeof events[0]?.conversationId === "string" ? events[0].conversationId : "";
  const agentId = typeof started?.agentId === "string" ? started.agentId : typeof events[0]?.agentId === "string" ? events[0].agentId : "";
  if (!conversationId || !agentId) {
    return null;
  }
  const last = events[events.length - 1];
  const lastEvent = typeof last?.event === "string" ? last.event : void 0;
  return {
    runId,
    conversationId,
    agentId,
    workspaceRoot,
    lastEvent
  };
}
async function findRunRegistryMetadata(runId, preferredWorkspaceRoot) {
  if (preferredWorkspaceRoot?.trim()) {
    const events = await readRegistryEventsForRun(runId, preferredWorkspaceRoot.trim());
    const metadata = metadataFromEvents(runId, preferredWorkspaceRoot.trim(), events);
    if (metadata) {
      return metadata;
    }
  }
  await ensureWorkspacesReady();
  const projects = await listWorkspaceProjects();
  for (const project of projects) {
    const root = project.path ?? resolveProjectWorkspaceRoot(project.id);
    if (root === preferredWorkspaceRoot?.trim()) {
      continue;
    }
    const events = await readRegistryEventsForRun(runId, root);
    const metadata = metadataFromEvents(runId, root, events);
    if (metadata) {
      return metadata;
    }
  }
  return null;
}

export { findRunRegistryMetadata as f };
