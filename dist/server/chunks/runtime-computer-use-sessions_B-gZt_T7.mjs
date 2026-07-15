import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { p as parseComputerUseTargetMode } from './runtime-computer-use-types_BWl7pttb.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
async function sessionsPath(workspaceRoot) {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const stateDir = join(binding.harnessRoot, "state");
  await mkdir(stateDir, { recursive: true });
  return join(stateDir, "computer-use-sessions.json");
}
async function readSessionsFile(workspaceRoot) {
  const path = await sessionsPath(workspaceRoot);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {};
    }
    const sessions = {};
    for (const [conversationId, value] of Object.entries(parsed)) {
      if (!isRecord(value) || typeof value.enabled !== "boolean") {
        continue;
      }
      const mode = parseComputerUseTargetMode(value.mode);
      sessions[conversationId] = {
        enabled: value.enabled,
        mode: value.enabled ? mode ?? "host" : null,
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    return sessions;
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
async function writeSessionsFile(sessions, workspaceRoot) {
  const path = await sessionsPath(workspaceRoot);
  await writeFile(path, `${JSON.stringify(sessions, null, 2)}
`, "utf8");
}
async function loadComputerUseSession(conversationId, workspaceRoot) {
  const sessions = await readSessionsFile(workspaceRoot);
  return sessions[conversationId] ?? {
    enabled: false,
    mode: null,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function saveComputerUseSession(conversationId, enabled, workspaceRoot, mode = enabled ? "host" : null) {
  const sessions = await readSessionsFile(workspaceRoot);
  const record = {
    enabled,
    mode: enabled ? mode ?? "host" : null,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  sessions[conversationId] = record;
  await writeSessionsFile(sessions, workspaceRoot);
  return record;
}

export { loadComputerUseSession as l, saveComputerUseSession as s };
