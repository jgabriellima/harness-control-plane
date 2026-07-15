import { readFile, access, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { d as defaultComputerUsePreferences } from './runtime-computer-use-types_BWl7pttb.mjs';
import { p as probeComputerUseHealth } from './runtime-computer-use-bridge_jpMJ_r7H.mjs';
import { p as probeComputerUseSetup } from './runtime-computer-use-setup_B_3mC38S.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
async function isComputerUseContractEnabled(workspaceRoot) {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  try {
    const raw = await readFile(binding.dslPath, "utf8");
    const parsed = parse(raw);
    if (!isRecord(parsed)) {
      return false;
    }
    const runtime = parsed.runtime;
    if (!isRecord(runtime)) {
      return false;
    }
    const computerUse = runtime.computer_use;
    if (!isRecord(computerUse)) {
      return false;
    }
    return computerUse.enabled === true;
  } catch {
    return false;
  }
}
function parsePreferences(raw) {
  const defaults = defaultComputerUsePreferences();
  if (!isRecord(raw)) {
    return defaults;
  }
  return {
    hostControlEnabled: raw.hostControlEnabled === true,
    allowForegroundCursor: raw.allowForegroundCursor === true,
    consentedAt: typeof raw.consentedAt === "string" ? raw.consentedAt : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : defaults.updatedAt
  };
}
async function preferencesPath(workspaceRoot) {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const stateDir = join(binding.harnessRoot, "state");
  await mkdir(stateDir, { recursive: true });
  return join(stateDir, "computer-use-preferences.json");
}
async function loadComputerUsePreferences(workspaceRoot) {
  const path = await preferencesPath(workspaceRoot);
  try {
    const raw = await readFile(path, "utf8");
    return parsePreferences(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") {
      return defaultComputerUsePreferences();
    }
    throw error;
  }
}
async function saveComputerUsePreferences(patch, workspaceRoot) {
  const path = await preferencesPath(workspaceRoot);
  const current = await loadComputerUsePreferences(workspaceRoot);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const hostControlEnabled = patch.hostControlEnabled ?? current.hostControlEnabled;
  const allowForegroundCursor = patch.allowForegroundCursor ?? current.allowForegroundCursor;
  const next = {
    hostControlEnabled,
    allowForegroundCursor: hostControlEnabled ? allowForegroundCursor : false,
    consentedAt: hostControlEnabled ? current.consentedAt ?? now : null,
    updatedAt: now
  };
  if (patch.hostControlEnabled === true && !current.consentedAt) {
    next.consentedAt = now;
  }
  if (patch.hostControlEnabled === false) {
    next.consentedAt = null;
    next.allowForegroundCursor = false;
  }
  await writeFile(path, `${JSON.stringify(next, null, 2)}
`, "utf8");
  return next;
}
async function loadComputerUseStatus(workspaceRoot) {
  const preferences = await loadComputerUsePreferences(workspaceRoot);
  const path = await preferencesPath(workspaceRoot);
  const setup = await probeComputerUseSetup(workspaceRoot);
  const driverOnPath = setup.driverInstalled;
  try {
    await access(path);
  } catch {
  }
  const active = preferences.hostControlEnabled && setup.ready;
  const health = active ? await probeComputerUseHealth() : null;
  return {
    preferences,
    driverOnPath,
    preferencesPath: path,
    setup,
    active,
    health
  };
}

export { isComputerUseContractEnabled, loadComputerUsePreferences, loadComputerUseStatus, saveComputerUsePreferences };
