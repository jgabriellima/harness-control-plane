import { r as readAggregatedActiveRuns, j as getActiveRunIds, g as getRuntimeRunEntry } from './runtime-sessions_Qp0oFuny.mjs';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { b as buildSessionContinueWirePrompt, D as DEFAULT_SESSION_CONTINUE_INSTRUCTION } from './prompt-inject_P3AxgDl3.mjs';
import { randomUUID } from 'node:crypto';

const processSessionId = randomUUID();
const sessionExecutingRunIds = /* @__PURE__ */ new Set();
function markRunExecutingInProcessSession(runId) {
  const normalized = runId.trim();
  if (!normalized) {
    return;
  }
  sessionExecutingRunIds.add(normalized);
}
function isRunExecutingInProcessSession(runId) {
  return sessionExecutingRunIds.has(runId.trim());
}

const DEFAULT_CONTINUABLE_MESSAGE = "This run was interrupted when the previous session ended.";
const DEFAULT_RESUME_PROMPT = buildSessionContinueWirePrompt(DEFAULT_SESSION_CONTINUE_INSTRUCTION);
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function normalizeSessionContinueWirePrompt(raw) {
  if (/<continue[\s>]/i.test(raw)) {
    return raw;
  }
  return buildSessionContinueWirePrompt(raw);
}
function defaultRunSessionLifecyclePolicy() {
  return {
    indexedAtProcessStart: "continuable",
    continuable: {
      resumable: true,
      message: DEFAULT_CONTINUABLE_MESSAGE,
      resumePrompt: DEFAULT_RESUME_PROMPT
    }
  };
}
function parseIndexedAtProcessStart(value) {
  if (value === "executing" || value === "active") {
    return "executing";
  }
  return "continuable";
}
function parseRunSessionLifecyclePolicy(raw) {
  const defaults = defaultRunSessionLifecyclePolicy();
  if (!isRecord(raw)) {
    return defaults;
  }
  const runtime = raw.runtime;
  const runSession = isRecord(runtime) ? runtime.run_session : raw.run_session;
  if (!isRecord(runSession)) {
    return defaults;
  }
  const lifecycle = runSession.lifecycle;
  if (!isRecord(lifecycle)) {
    return defaults;
  }
  const continuableRaw = lifecycle.continuable;
  const continuable = isRecord(continuableRaw) ? {
    resumable: continuableRaw.resumable !== false,
    message: typeof continuableRaw.message === "string" && continuableRaw.message.trim().length > 0 ? continuableRaw.message.trim() : defaults.continuable.message,
    resumePrompt: typeof continuableRaw.resume_prompt === "string" && continuableRaw.resume_prompt.trim().length > 0 ? normalizeSessionContinueWirePrompt(continuableRaw.resume_prompt.trim()) : typeof continuableRaw.resumePrompt === "string" && continuableRaw.resumePrompt.trim().length > 0 ? normalizeSessionContinueWirePrompt(continuableRaw.resumePrompt.trim()) : defaults.continuable.resumePrompt
  } : defaults.continuable;
  return {
    indexedAtProcessStart: parseIndexedAtProcessStart(
      lifecycle.indexed_at_process_start ?? lifecycle.indexedAtProcessStart
    ),
    continuable
  };
}
async function loadRunSessionLifecyclePolicy(workspaceRoot) {
  try {
    const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
    const raw = await readFile(binding.dslPath, "utf8");
    return parseRunSessionLifecyclePolicy(parse(raw));
  } catch {
    return defaultRunSessionLifecyclePolicy();
  }
}
function partitionRunsBySessionPolicy(diskRuns, policy) {
  if (policy.indexedAtProcessStart === "executing") {
    return {
      executing: diskRuns,
      continuable: []
    };
  }
  const executing = [];
  const continuable = [];
  for (const entry of diskRuns) {
    if (isRunExecutingInProcessSession(entry.runId)) {
      executing.push(entry);
      continue;
    }
    continuable.push({
      ...entry,
      resumable: policy.continuable.resumable,
      message: policy.continuable.message,
      resumePrompt: policy.continuable.resumePrompt,
      reason: "session_boundary"
    });
  }
  return { executing, continuable };
}
function buildRunSessionSnapshot(diskRuns, policy) {
  const partitioned = partitionRunsBySessionPolicy(diskRuns, policy);
  return {
    processSessionId,
    policy,
    executing: partitioned.executing,
    continuable: partitioned.continuable,
    active: partitioned.executing
  };
}
function shouldAutoAttachIndexedRuns(policy) {
  return policy.indexedAtProcessStart === "executing";
}

function listInMemoryActiveRunEntries() {
  const entries = [];
  for (const runId of getActiveRunIds()) {
    const entry = getRuntimeRunEntry(runId);
    if (!entry?.conversationId || !entry.agentId) {
      continue;
    }
    entries.push({
      runId,
      conversationId: entry.conversationId,
      agentId: entry.agentId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return entries;
}
function mergeActiveRunEntries(disk, memory) {
  const byRunId = /* @__PURE__ */ new Map();
  for (const entry of disk) {
    byRunId.set(entry.runId, entry);
  }
  for (const entry of memory) {
    byRunId.set(entry.runId, entry);
  }
  return [...byRunId.values()].sort(
    (left, right) => right.startedAt.localeCompare(left.startedAt)
  );
}
async function readRunSessionSnapshot() {
  const disk = await readAggregatedActiveRuns();
  const memory = listInMemoryActiveRunEntries();
  const merged = mergeActiveRunEntries(disk.active, memory);
  for (const entry of memory) {
    markRunExecutingInProcessSession(entry.runId);
  }
  const policy = await loadRunSessionLifecyclePolicy();
  return buildRunSessionSnapshot(merged, policy);
}
async function readLiveActiveRuns() {
  const snapshot = await readRunSessionSnapshot();
  const updatedAt = snapshot.executing.length > 0 ? snapshot.executing[0]?.startedAt ?? (/* @__PURE__ */ new Date()).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
  return {
    version: 1,
    updatedAt,
    active: snapshot.executing
  };
}

export { readLiveActiveRuns as a, loadRunSessionLifecyclePolicy as l, markRunExecutingInProcessSession as m, readRunSessionSnapshot as r, shouldAutoAttachIndexedRuns as s };
