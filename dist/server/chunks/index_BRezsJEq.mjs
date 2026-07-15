import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import * as Sentry from '@sentry/astro';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';
import { a as loadBusinessConfig } from './harness-reader_xurzrbMU.mjs';
import { loadComputerUseStatus } from './runtime-computer-use-preferences_NdHwuD2F.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { r as readReaderPreferences } from './ui-reader-preferences_BNZR_SIy.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const BUNDLE_IDENTITY_FILENAME = "bundle.identity.yaml";
function isRecord$1(value) {
  return typeof value === "object" && value !== null;
}
function parseStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "string" && item.trim().length > 0);
}
function parseBundleIdentityManifest(raw) {
  if (!isRecord$1(raw)) {
    return null;
  }
  const bundleId = raw.bundle_id;
  if (typeof bundleId !== "string" || !bundleId.trim()) {
    return null;
  }
  const migrationRaw = raw.migration;
  let migration;
  if (isRecord$1(migrationRaw)) {
    migration = {
      import_keychain_from: parseStringArray(migrationRaw.import_keychain_from),
      import_app_data_from: parseStringArray(migrationRaw.import_app_data_from),
      tcc_reauth_required: migrationRaw.tcc_reauth_required === true
    };
  }
  return {
    apiVersion: typeof raw.apiVersion === "string" ? raw.apiVersion : void 0,
    kind: typeof raw.kind === "string" ? raw.kind : void 0,
    bundle_id: bundleId.trim(),
    supersedes: parseStringArray(raw.supersedes),
    migration
  };
}
async function loadBundleIdentityManifest(workspaceRoot) {
  const path = join(workspaceRoot, BUNDLE_IDENTITY_FILENAME);
  if (!existsSync(path)) {
    return null;
  }
  return Sentry.startSpan({ name: "loadBundleIdentityManifest", op: "fs.read" }, async () => {
    const raw = await readFile(path, "utf8");
    return parseBundleIdentityManifest(parse(raw));
  });
}
function migrationRecordPath(appDataDir, bundleId) {
  return join(appDataDir, "migrations", `identity-${bundleId}.json`);
}
async function loadIdentityMigrationRecord(bundleId) {
  const appDataDir = process.env.TAURI_APP_DATA_DIR?.trim();
  if (!appDataDir) {
    return null;
  }
  const path = migrationRecordPath(appDataDir, bundleId);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (!isRecord$1(parsed) || parsed.completed !== true) {
      return null;
    }
    return {
      bundle_id: typeof parsed.bundle_id === "string" ? parsed.bundle_id : bundleId,
      completed: true,
      keychain_keys_migrated: typeof parsed.keychain_keys_migrated === "number" ? parsed.keychain_keys_migrated : 0,
      app_data_files_copied: typeof parsed.app_data_files_copied === "number" ? parsed.app_data_files_copied : 0,
      source_services: parseStringArray(parsed.source_services),
      completed_at: typeof parsed.completed_at === "string" ? parsed.completed_at : null
    };
  } catch {
    return null;
  }
}
async function loadIdentityMigrationSummary(workspaceRoot) {
  const manifest = await loadBundleIdentityManifest(workspaceRoot);
  if (!manifest) {
    return null;
  }
  const supersedes = manifest.supersedes ?? [];
  const hasMigrationSources = supersedes.length > 0 || (manifest.migration?.import_keychain_from?.length ?? 0) > 0 || (manifest.migration?.import_app_data_from?.length ?? 0) > 0;
  if (!hasMigrationSources) {
    return null;
  }
  const record = await loadIdentityMigrationRecord(manifest.bundle_id);
  return {
    configured: true,
    completed: record?.completed ?? false,
    bundleId: manifest.bundle_id,
    supersedes,
    tccReauthRequired: manifest.migration?.tcc_reauth_required === true,
    keychainKeysMigrated: record?.keychain_keys_migrated ?? null,
    appDataFilesCopied: record?.app_data_files_copied ?? null,
    sourceServices: record?.source_services ?? [],
    completedAt: record?.completed_at ?? null
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function parseIntegrations(root) {
  const integrations = root.integrations;
  if (!isRecord(integrations)) {
    return [];
  }
  return Object.entries(integrations).map(([slotId, raw]) => {
    if (!isRecord(raw)) {
      return null;
    }
    return {
      slotId,
      provider: asString(raw.provider, "unknown"),
      status: asString(raw.status, "unknown"),
      tenantScope: typeof raw.tenant_scope === "string" ? raw.tenant_scope : raw.tenant_scope === null ? null : null
    };
  }).filter((entry) => entry !== null).sort((left, right) => left.slotId.localeCompare(right.slotId));
}
function parseRuntimeProfile(root) {
  const runtime = root.runtime;
  if (!isRecord(runtime)) {
    return null;
  }
  const commandsRaw = runtime.commands;
  const commands = Array.isArray(commandsRaw) ? commandsRaw.filter((entry) => typeof entry === "string") : [];
  return {
    engine: asString(runtime.engine, "unknown"),
    specializationLayer: asString(runtime.specialization_layer, ""),
    commandCount: commands.length,
    commands
  };
}
function parseComputerUseContract(root) {
  const runtime = root.runtime;
  if (!isRecord(runtime)) {
    return null;
  }
  const computerUse = runtime.computer_use;
  if (!isRecord(computerUse)) {
    return null;
  }
  return {
    enabled: computerUse.enabled === true,
    requireConsent: computerUse.require_consent !== false
  };
}
function buildComputerUseSummary(contract, status) {
  if (!contract?.enabled) {
    return null;
  }
  const preferences = status?.preferences ?? {
    hostControlEnabled: false,
    allowForegroundCursor: false,
    consentedAt: null,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  return {
    enabled: contract.enabled,
    requireConsent: contract.requireConsent,
    hostControlEnabled: preferences.hostControlEnabled,
    allowForegroundCursor: preferences.allowForegroundCursor,
    driverOnPath: status?.driverOnPath ?? false,
    consentedAt: preferences.consentedAt,
    active: status?.active ?? false,
    setupPhase: status?.setup.phase ?? "idle",
    setupReady: status?.setup.ready ?? false,
    healthOk: status?.health?.ok ?? null,
    healthLatencyMs: status?.health?.latencyMs ?? null,
    healthError: status?.health?.error ?? null
  };
}
async function loadSettingsSnapshot(workspaceRoot) {
  return Sentry.startSpan({ name: "loadSettingsSnapshot", op: "fs.read" }, async () => {
    const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
    const [config, rawYaml] = await Promise.all([
      loadBusinessConfig(binding.workspaceRoot),
      readFile(binding.dslPath, "utf8")
    ]);
    const parsed = parse(rawYaml);
    const root = isRecord(parsed) ? parsed : {};
    const execution = config.execution;
    const defaultWorkflow = execution?.defaultWorkflow ?? execution?.default_workflow ?? null;
    const computerUseContract = parseComputerUseContract(root);
    let computerUseStatus = null;
    let identityMigration = null;
    if (computerUseContract?.enabled) {
      try {
        computerUseStatus = await loadComputerUseStatus(binding.workspaceRoot);
      } catch {
        computerUseStatus = null;
      }
    }
    try {
      identityMigration = await loadIdentityMigrationSummary(binding.workspaceRoot);
    } catch {
      identityMigration = null;
    }
    return {
      project: {
        name: config.project.name,
        description: config.project.description,
        status: config.status,
        initialized: config.initialized
      },
      execution: {
        defaultWorkflow
      },
      runtime: parseRuntimeProfile(root),
      integrations: parseIntegrations(root),
      computerUse: buildComputerUseSummary(computerUseContract, computerUseStatus),
      identityMigration,
      readerPreferences: await readReaderPreferences(),
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  });
}

const GET = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const settings = await loadSettingsSnapshot(workspaceRoot);
    return jsonOk(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
