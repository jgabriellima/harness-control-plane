import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { l as loadIntegrationComposioConfig, b as isComposioSlotConnected, g as composioConnectionEnvVar, v as verifyComposioSlotRemote, a as isComposioSlotCredentialVerified } from './composio-connection_CC45xKfl.mjs';
import { l as loadCredentialManifest } from './credential-manifest_D1slBkJK.mjs';
import { p as probeCredentialPresence } from './credential-store_CCdb2qUf.mjs';
import { b as loadReadinessSnapshot } from './harness-reader_xurzrbMU.mjs';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';
import { m as ensureWorkspacesContainer } from './workspace-manager_C2YuGzrP.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function computeOverall(slots) {
  if (slots.length === 0) {
    return "unknown";
  }
  if (slots.every((slot) => slot.ready)) {
    return "pass";
  }
  if (slots.some((slot) => slot.ready)) {
    return "warn";
  }
  return "fail";
}
function mergeSlot(live, fromFile) {
  if (!fromFile) {
    return live;
  }
  return {
    slotId: live.slotId,
    provider: live.provider || fromFile.provider,
    status: live.status || fromFile.status,
    secretsMissing: live.secretsMissing,
    ready: live.ready,
    oauthConnected: live.oauthConnected,
    oauthVerified: live.oauthVerified
  };
}
async function buildLiveIntegrationReadinessSlots(workspaceRoot, projectId = "default") {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const raw = parse(await readFile(binding.dslPath, "utf8"));
  const integrations = isRecord(raw) && isRecord(raw.integrations) ? raw.integrations : {};
  const manifest = await loadCredentialManifest(binding.workspaceRoot);
  const slots = [];
  for (const [slotId, slotRaw] of Object.entries(integrations)) {
    if (!isRecord(slotRaw)) {
      continue;
    }
    const provider = asString(slotRaw.provider, "unknown");
    const yamlStatus = asString(slotRaw.status, "unknown");
    const composioConfig = await loadIntegrationComposioConfig(
      slotId,
      provider,
      binding.workspaceRoot
    );
    const secretsMissing = [];
    if (composioConfig?.enabled) {
      const connected = await isComposioSlotConnected(slotId, projectId);
      if (!connected) {
        secretsMissing.push(composioConnectionEnvVar(slotId, projectId));
        slots.push({
          slotId,
          provider,
          status: yamlStatus,
          secretsMissing,
          ready: false
        });
        continue;
      }
      const remote = await verifyComposioSlotRemote({
        slotId,
        provider,
        projectId,
        workspaceRoot: binding.workspaceRoot
      });
      const verified = isComposioSlotCredentialVerified(remote);
      if (!verified) {
        secretsMissing.push("composio_reconnect_required");
      }
      slots.push({
        slotId,
        provider,
        status: verified ? "active" : connected ? "reconnect" : "pending",
        secretsMissing,
        ready: verified,
        oauthConnected: connected,
        oauthVerified: verified
      });
      continue;
    }
    const slotSecrets = manifest?.secrets.filter((entry) => entry.slot_id === slotId && entry.required) ?? [];
    for (const secret of slotSecrets) {
      const [presence] = await probeCredentialPresence(
        [
          {
            env_var: secret.env_var,
            storage: secret.storage,
            required: secret.required,
            description: secret.description
          }
        ],
        provider
      );
      if (!presence.present) {
        secretsMissing.push(secret.env_var);
      }
    }
    const activationMode = asString(slotRaw.activation_mode);
    if (activationMode === "browser" && slotSecrets.length === 0) {
      secretsMissing.push("browser_session_required");
    }
    slots.push({
      slotId,
      provider,
      status: yamlStatus,
      secretsMissing,
      ready: secretsMissing.length === 0 && yamlStatus === "active"
    });
  }
  return slots.sort((left, right) => left.slotId.localeCompare(right.slotId));
}
async function resolveReadinessSnapshot(workspaceRoot, projectId = "default") {
  const [fileSnapshot, liveSlots] = await Promise.all([
    loadReadinessSnapshot(),
    buildLiveIntegrationReadinessSlots(workspaceRoot, projectId)
  ]);
  const fileBySlot = new Map(
    (fileSnapshot?.slots ?? []).map((slot) => [slot.slotId, slot])
  );
  const slots = liveSlots.map((live) => mergeSlot(live, fileBySlot.get(live.slotId)));
  return {
    apiVersion: fileSnapshot?.apiVersion ?? "business.jambu/v1",
    kind: fileSnapshot?.kind ?? "ReadinessSnapshot",
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overall: computeOverall(slots),
    doctorMode: fileSnapshot?.doctorMode,
    slots
  };
}

const GET = async ({ request, url }) => {
  try {
    await ensureWorkspacesContainer();
    const workspace = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const snapshot = await resolveReadinessSnapshot(
      workspace.workspaceRoot,
      workspace.activeProjectId
    );
    return jsonOk(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load readiness snapshot";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
