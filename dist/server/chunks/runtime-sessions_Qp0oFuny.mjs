import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { e as ensureWorkspacesReady, l as listWorkspaceProjects, r as resolveProjectWorkspaceRoot, d as resolveActiveWorkspaceRoot, b as resolveAppRoot } from './workspace-manager_C2YuGzrP.mjs';
import 'yaml';
import { AsyncLocalStorage } from 'node:async_hooks';

const execFileAsync = promisify(execFile);
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
async function resolveRunsWorkspaceRoot(workspaceRoot) {
  if (workspaceRoot?.trim()) {
    return workspaceRoot.trim();
  }
  return resolveActiveWorkspaceRoot();
}
async function runRegistryPaths(workspaceRoot) {
  const resolvedRoot = await resolveRunsWorkspaceRoot(workspaceRoot);
  const binding = await resolveHarnessBinding({ workspaceRoot: resolvedRoot });
  const sessionsDir = join(binding.harnessRoot, "runtime-sessions");
  return {
    workspaceRoot: binding.workspaceRoot,
    runsIndexPath: join(sessionsDir, "runs-index.json"),
    runRegistryScript: join(binding.harnessRoot, "bin", `${binding.cliPrefix}_run_registry.py`)
  };
}
async function readRunsIndex(workspaceRoot) {
  const paths = await runRegistryPaths(workspaceRoot);
  try {
    const raw = await readFile(paths.runsIndexPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.active)) {
      return { version: 1, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), active: [] };
    }
    const active = parsed.active.filter(isRecord).map((entry) => ({
      runId: typeof entry.runId === "string" ? entry.runId : "",
      conversationId: typeof entry.conversationId === "string" ? entry.conversationId : "",
      agentId: typeof entry.agentId === "string" ? entry.agentId : "",
      startedAt: typeof entry.startedAt === "string" ? entry.startedAt : ""
    })).filter((entry) => entry.runId.length > 0 && entry.conversationId.length > 0);
    return {
      version: typeof parsed.version === "number" ? parsed.version : 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : (/* @__PURE__ */ new Date()).toISOString(),
      active
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { version: 1, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), active: [] };
    }
    throw error;
  }
}
async function appendRunStarted(input) {
  const paths = await runRegistryPaths(input.workspaceRoot);
  await execFileAsync(
    "python3",
    [
      paths.runRegistryScript,
      "append-started",
      "--run-id",
      input.runId,
      "--conversation-id",
      input.conversationId,
      "--agent-id",
      input.agentId,
      "--vendor",
      input.vendor ?? "cursor-local"
    ],
    { cwd: paths.workspaceRoot, maxBuffer: 1024 * 1024 }
  );
}
async function appendRunTerminal(input) {
  const paths = await runRegistryPaths(input.workspaceRoot);
  const args = [
    paths.runRegistryScript,
    "append-terminal",
    "--run-id",
    input.runId,
    "--event",
    input.event
  ];
  if (input.status) {
    args.push("--status", input.status);
  }
  if (input.message) {
    args.push("--message", input.message);
  }
  if (input.reason) {
    args.push("--reason", input.reason);
  }
  if (input.resumable !== void 0) {
    args.push("--resumable", input.resumable ? "true" : "false");
  }
  await execFileAsync("python3", args, {
    cwd: paths.workspaceRoot,
    maxBuffer: 1024 * 1024
  });
}
async function interruptAllActiveRuns(reason) {
  const index = await readAggregatedActiveRuns();
  let count = 0;
  for (const entry of index.active) {
    const located = await findActiveRunEntry(entry.runId);
    await appendRunTerminal({
      runId: entry.runId,
      event: "run.interrupted",
      status: "interrupted",
      reason,
      message: `Run interrupted (${reason})`,
      resumable: true,
      workspaceRoot: located?.workspaceRoot
    });
    count += 1;
  }
  return count;
}
async function readAggregatedActiveRuns() {
  await ensureWorkspacesReady();
  const projects = await listWorkspaceProjects();
  const active = [];
  let updatedAt = (/* @__PURE__ */ new Date(0)).toISOString();
  for (const project of projects) {
    const root = project.path ?? resolveProjectWorkspaceRoot(project.id);
    const index = await readRunsIndex(root);
    active.push(...index.active);
    if (index.updatedAt > updatedAt) {
      updatedAt = index.updatedAt;
    }
  }
  return {
    version: 1,
    updatedAt: updatedAt === (/* @__PURE__ */ new Date(0)).toISOString() ? (/* @__PURE__ */ new Date()).toISOString() : updatedAt,
    active
  };
}
async function findActiveRunEntry(runId) {
  await ensureWorkspacesReady();
  const projects = await listWorkspaceProjects();
  for (const project of projects) {
    const root = project.path ?? resolveProjectWorkspaceRoot(project.id);
    const index = await readRunsIndex(root);
    const entry = index.active.find((activeRun) => activeRun.runId === runId);
    if (entry) {
      return { entry, workspaceRoot: root };
    }
  }
  return null;
}

const sessions = /* @__PURE__ */ new Map();
const activeRuns = /* @__PURE__ */ new Map();
const agentWaitQueue = [];
const workspaceCwdStorage = new AsyncLocalStorage();
async function runWithWorkspaceCwdAsync(cwd, fn) {
  return workspaceCwdStorage.run(cwd, fn);
}
function workspaceCwd() {
  return workspaceCwdStorage.getStore() ?? resolveAppRoot();
}
function releaseAgentSlot() {
  const next = agentWaitQueue.shift();
  if (next) {
    next.resolve();
  }
}
function registerRuntimeSession(agentId, dispose) {
  sessions.set(agentId, { agentId, dispose });
}
function registerRuntimeRun(runId, run, conversationId, agentId) {
  const existing = activeRuns.get(runId);
  if (existing) {
    existing.refCount += 1;
    if (conversationId) {
      existing.conversationId = conversationId;
    }
    if (agentId) {
      existing.agentId = agentId;
    }
    return;
  }
  activeRuns.set(runId, {
    run,
    conversationId: conversationId ?? null,
    agentId: agentId ?? null,
    refCount: 1
  });
}
function retainRuntimeRun(runId) {
  const entry = activeRuns.get(runId);
  if (!entry) {
    return void 0;
  }
  entry.refCount += 1;
  return entry.run;
}
function releaseRuntimeRun(runId) {
  const entry = activeRuns.get(runId);
  if (!entry) {
    return;
  }
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    activeRuns.delete(runId);
  }
}
function getRuntimeRunEntry(runId) {
  const entry = activeRuns.get(runId);
  if (!entry) {
    return void 0;
  }
  return {
    run: entry.run,
    conversationId: entry.conversationId,
    agentId: entry.agentId
  };
}
function getActiveRunIds() {
  return [...activeRuns.keys()];
}

export { appendRunTerminal as a, registerRuntimeSession as b, registerRuntimeRun as c, runWithWorkspaceCwdAsync as d, appendRunStarted as e, findActiveRunEntry as f, getRuntimeRunEntry as g, releaseRuntimeRun as h, releaseAgentSlot as i, getActiveRunIds as j, retainRuntimeRun as k, readRunsIndex as l, interruptAllActiveRuns as m, readAggregatedActiveRuns as r, workspaceCwd as w };
