import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
async function loadCredentialManifest(workspaceRoot) {
  const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
  const manifestPath = join(binding.harnessRoot, "credential-manifest.yaml");
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.secrets)) {
      return null;
    }
    const secrets = parsed.secrets.filter(isRecord).map((entry) => ({
      env_var: typeof entry.env_var === "string" ? entry.env_var : "",
      scope: typeof entry.scope === "string" ? entry.scope : "local",
      storage: entry.storage === "runtime_env" || entry.storage === "cli_session" ? entry.storage : entry.storage === "composio_connection" ? "composio_connection" : "keychain",
      slot_id: typeof entry.slot_id === "string" ? entry.slot_id : "",
      provider: typeof entry.provider === "string" ? entry.provider : "",
      integration: typeof entry.integration === "string" ? entry.integration : "",
      required: entry.required !== false,
      description: typeof entry.description === "string" ? entry.description : ""
    })).filter((entry) => entry.env_var.length > 0 && entry.slot_id.length > 0);
    return {
      generated_at: typeof parsed.generated_at === "string" ? parsed.generated_at : "",
      source: typeof parsed.source === "string" ? parsed.source : "unknown",
      secrets
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
function groupSecretsBySlot(manifest) {
  const grouped = /* @__PURE__ */ new Map();
  for (const entry of manifest.secrets) {
    const list = grouped.get(entry.slot_id) ?? [];
    list.push(entry);
    grouped.set(entry.slot_id, list);
  }
  return grouped;
}

export { groupSecretsBySlot as g, loadCredentialManifest as l };
