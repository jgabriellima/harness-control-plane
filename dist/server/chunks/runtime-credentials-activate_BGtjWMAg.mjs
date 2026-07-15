import { execFile } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { r as resolveProjectRoot } from './project-root_D7dTqIZJ.mjs';
import { b as invalidateSdkProbeCache, f as clearRuntimeAuthGate } from './runtime-sdk-probe_CMRaDJPh.mjs';

const LEGACY_KEYCHAIN_SERVICE = "ai.jambu.business-runtime";
let cachedBundleId;
function bundleIdFromEnv() {
  return process.env.JAMBU_HOST_BUNDLE_ID?.trim() || process.env.TAURI_BUNDLE_IDENTIFIER?.trim() || void 0;
}
async function bundleIdFromUiConfig() {
  try {
    const projectRoot = resolveProjectRoot();
    const raw = await readFile(join(projectRoot, "ui.config.yaml"), "utf8");
    const doc = parse(raw);
    const identifier = doc.distribution?.desktop?.identifier?.trim();
    return identifier || void 0;
  } catch {
    return void 0;
  }
}
async function resolveKeychainService() {
  const fromEnv = bundleIdFromEnv();
  if (fromEnv) {
    return fromEnv;
  }
  if (cachedBundleId !== void 0) {
    return cachedBundleId ?? LEGACY_KEYCHAIN_SERVICE;
  }
  const fromConfig = await bundleIdFromUiConfig();
  cachedBundleId = fromConfig ?? null;
  return fromConfig ?? LEGACY_KEYCHAIN_SERVICE;
}
function keychainServiceCandidates(primary) {
  const ordered = [primary];
  if (primary !== LEGACY_KEYCHAIN_SERVICE) {
    ordered.push(LEGACY_KEYCHAIN_SERVICE);
  }
  return ordered;
}

const execFileAsync = promisify(execFile);
async function primaryKeychainService() {
  return resolveKeychainService();
}
async function metadataDir() {
  const appData = process.env.TAURI_APP_DATA_DIR?.trim();
  if (appData) {
    return appData;
  }
  const bundleId = await primaryKeychainService();
  const home = process.env.HOME?.trim();
  if (!home) {
    throw new Error("Cannot resolve credential metadata directory");
  }
  return join(home, "Library", "Application Support", bundleId);
}
async function metadataPath() {
  return join(await metadataDir(), "credential-metadata.json");
}
function isDesktopKeychainContext() {
  return process.env.CONTROL_PLANE_DESKTOP === "1" || Boolean(process.env.TAURI_BUNDLE_IDENTIFIER?.trim()) || Boolean(process.env.JAMBU_HOST_BUNDLE_ID?.trim());
}
async function readMetadataStore() {
  try {
    const raw = await readFile(await metadataPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.credentials && typeof parsed.credentials === "object") {
      return { credentials: parsed.credentials };
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  return { credentials: {} };
}
async function readCredentialMetadata(envVar) {
  const store = await readMetadataStore();
  const entry = store.credentials[envVar];
  if (!entry) {
    return null;
  }
  return {
    env_var: envVar,
    saved_at: entry.saved_at,
    updated_at: entry.updated_at
  };
}
async function writeCredentialMetadata(envVar) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const dir = await metadataDir();
  await mkdir(dir, { recursive: true });
  const store = await readMetadataStore();
  const existing = store.credentials[envVar];
  const next = {
    env_var: envVar,
    saved_at: existing?.saved_at ?? now,
    updated_at: now
  };
  store.credentials[envVar] = { saved_at: next.saved_at, updated_at: next.updated_at };
  await writeFile(await metadataPath(), `${JSON.stringify(store, null, 2)}
`, "utf8");
  return next;
}
async function readFromService(envVar, service) {
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-a",
      envVar,
      "-s",
      service,
      "-w"
    ]);
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
async function deleteFromService(envVar, service) {
  try {
    await execFileAsync("security", [
      "delete-generic-password",
      "-a",
      envVar,
      "-s",
      service
    ]);
  } catch {
  }
}
async function writeToService(envVar, value, service) {
  await execFileAsync("security", [
    "add-generic-password",
    "-a",
    envVar,
    "-s",
    service,
    "-w",
    value,
    "-U"
  ]);
}
async function readWithLegacyMigration(envVar) {
  const primary = await primaryKeychainService();
  const value = await readFromService(envVar, primary);
  if (value) {
    return value;
  }
  if (primary === LEGACY_KEYCHAIN_SERVICE) {
    return null;
  }
  const legacyValue = await readFromService(envVar, LEGACY_KEYCHAIN_SERVICE);
  if (!legacyValue) {
    return null;
  }
  await writeToService(envVar, legacyValue, primary);
  await deleteFromService(envVar, LEGACY_KEYCHAIN_SERVICE);
  return legacyValue;
}
async function desktopKeychainGet(envVar) {
  return readWithLegacyMigration(envVar);
}
async function desktopKeychainDelete(envVar) {
  const primary = await primaryKeychainService();
  for (const service of keychainServiceCandidates(primary)) {
    await deleteFromService(envVar, service);
  }
}
async function desktopKeychainHas(envVar) {
  const value = await readWithLegacyMigration(envVar);
  return value !== null;
}
async function desktopKeychainSet(envVar, value) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("value must not be empty");
  }
  const primary = await primaryKeychainService();
  await writeToService(envVar, trimmed, primary);
  if (primary !== LEGACY_KEYCHAIN_SERVICE) {
    await deleteFromService(envVar, LEGACY_KEYCHAIN_SERVICE);
  }
}

const desktopKeychain = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  desktopKeychainDelete,
  desktopKeychainGet,
  desktopKeychainHas,
  desktopKeychainSet,
  isDesktopKeychainContext,
  readCredentialMetadata,
  writeCredentialMetadata
}, Symbol.toStringTag, { value: 'Module' }));

const RUNTIME_KEY_ALIASES = ["RUNTIME_API_KEY", "CURSOR_API_KEY"];
function activateRuntimeCredentialInProcess(envVar, value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  if (envVar === "RUNTIME_API_KEY" || envVar === "CURSOR_API_KEY") {
    for (const key of RUNTIME_KEY_ALIASES) {
      process.env[key] = trimmed;
    }
    invalidateSdkProbeCache();
    clearRuntimeAuthGate();
  } else {
    process.env[envVar] = trimmed;
  }
}

export { activateRuntimeCredentialInProcess as a, desktopKeychainHas as b, desktopKeychainSet as c, desktopKeychainGet as d, readCredentialMetadata as e, desktopKeychain as f, isDesktopKeychainContext as i, resolveKeychainService as r, writeCredentialMetadata as w };
