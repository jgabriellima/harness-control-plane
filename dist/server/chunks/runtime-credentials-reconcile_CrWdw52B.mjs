import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { b as resolveAppRoot } from './workspace-manager_C2YuGzrP.mjs';
import { a as activateRuntimeCredentialInProcess, i as isDesktopKeychainContext, d as desktopKeychainGet } from './runtime-credentials-activate_BGtjWMAg.mjs';
import { r as resolveRuntimeApiKey } from './runtime-sdk-probe_CMRaDJPh.mjs';
import { r as runtimeLogger } from './runtime-run-failure_BzuNxIfC.mjs';

const RUNTIME_KEY_ALIASES = ["RUNTIME_API_KEY", "CURSOR_API_KEY"];
async function readEnvFileValue(envVar) {
  const candidates = [
    join(resolveAppRoot(), ".env"),
    join(resolveAppRoot(), "..", ".env"),
    join(resolveAppRoot(), "..", "business-workflow", "app", ".env")
  ];
  for (const path of candidates) {
    try {
      const raw = await readFile(path, "utf8");
      const match = raw.match(new RegExp(`^${envVar}=(.+)$`, "m"));
      const value = match?.[1]?.trim();
      if (value) {
        return value;
      }
    } catch {
    }
  }
  return null;
}
async function resolveStoredRuntimeKey() {
  if (isDesktopKeychainContext()) {
    for (const envVar of RUNTIME_KEY_ALIASES) {
      const value = await desktopKeychainGet(envVar);
      if (value?.trim()) {
        return value.trim();
      }
    }
  }
  for (const envVar of RUNTIME_KEY_ALIASES) {
    const fromFile = await readEnvFileValue(envVar);
    if (fromFile) {
      return fromFile;
    }
  }
  return null;
}
async function reconcileRuntimeCredentials() {
  const current = resolveRuntimeApiKey();
  const stored = await resolveStoredRuntimeKey();
  if (stored) {
    const changed = current !== stored;
    activateRuntimeCredentialInProcess("RUNTIME_API_KEY", stored);
    runtimeLogger.debug("runtime.credentials.reconcile", {
      applied: true,
      changed,
      source: isDesktopKeychainContext() ? "keychain" : "env_file"
    });
    return {
      applied: true,
      source: isDesktopKeychainContext() ? "keychain" : "env_file"
    };
  }
  if (current) {
    return { applied: false, source: "process" };
  }
  runtimeLogger.warn("runtime.credentials.reconcile.missing", {});
  return { applied: false, source: "none" };
}

export { reconcileRuntimeCredentials as r };
