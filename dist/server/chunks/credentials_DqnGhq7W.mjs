import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { l as loadCredentialManifest, g as groupSecretsBySlot } from './credential-manifest_D1slBkJK.mjs';
import { p as probeCredentialPresence, s as storeCredential } from './credential-store_CCdb2qUf.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const GET = async ({ params, request, url }) => {
  const slotId = params.slotId;
  if (!slotId) {
    return jsonError("slotId is required", 400);
  }
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const manifest = await loadCredentialManifest(workspaceRoot);
    if (!manifest) {
      return jsonOk([]);
    }
    const grouped = groupSecretsBySlot(manifest);
    const entries = grouped.get(slotId) ?? [];
    const provider = entries[0]?.provider ?? "";
    const presence = await probeCredentialPresence(
      entries.map((entry) => ({
        env_var: entry.env_var,
        storage: entry.storage,
        required: entry.required,
        description: entry.description
      })),
      provider
    );
    return jsonOk(presence);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to probe credentials";
    return jsonError(message, 500);
  }
};
const POST = async ({ params, request, url }) => {
  const slotId = params.slotId;
  if (!slotId) {
    return jsonError("slotId is required", 400);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  if (typeof body !== "object" || body === null || typeof body.env_var !== "string" || typeof body.value !== "string") {
    return jsonError("env_var and value are required", 400);
  }
  const { env_var: envVar, value } = body;
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const manifest = await loadCredentialManifest(workspaceRoot);
    const entry = manifest?.secrets.find(
      (secret) => secret.slot_id === slotId && secret.env_var === envVar
    );
    if (!entry) {
      return jsonError("Unknown credential for slot", 400);
    }
    if (entry.storage === "cli_session") {
      return jsonError("CLI session credentials cannot be stored via API", 400);
    }
    const stored = await storeCredential(envVar, value);
    return jsonOk({
      env_var: envVar,
      present: true,
      saved_at: stored.saved_at ?? null,
      updated_at: stored.updated_at ?? null,
      activated: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to store credential";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
