import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { r as resolveComposioUserId, p as pollAndStoreComposioConnection, i as invalidateComposioCredentialProbeCache, v as verifyComposioSlotRemote, a as isComposioSlotCredentialVerified, C as ComposioSubdomainMalformedError, b as isComposioSlotConnected, l as loadIntegrationComposioConfig } from './composio-connection_CC45xKfl.mjs';
import { t as toolkitSlugFromSlotId } from './composio-auth-config_B4-JkaML.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';
import { i as invalidateComposioSessionCache } from './composio-mcp-bridge_vI0qRf5J.mjs';
import { r as refreshReadinessSnapshot } from './refresh-readiness-snapshot_Cr_BVAsY.mjs';

async function buildCallbackResponse(options) {
  const remote = await verifyComposioSlotRemote({
    slotId: options.slotId,
    provider: options.provider,
    projectId: options.projectId,
    workspaceRoot: options.workspaceRoot,
    skipCredentialProbe: options.skipCredentialProbe
  });
  const verified = isComposioSlotCredentialVerified(remote);
  return jsonOk({
    slot_id: options.slotId,
    connected: true,
    verified,
    needs_reconnect: !verified,
    failure_reason: remote.failureReason,
    expected_subdomain: remote.expectedSubdomain,
    toolkit: options.toolkit,
    connected_account_id: options.connectedAccountId ?? remote.connectedAccountId
  });
}
async function resolveCallbackFailure(options) {
  if (options.error instanceof ComposioSubdomainMalformedError) {
    return jsonError(options.error.message, 422, {
      code: options.error.code,
      expected_subdomain: options.error.expectedSubdomain,
      received_subdomain: options.error.receivedSubdomain
    });
  }
  const connected = await isComposioSlotConnected(options.slotId, options.projectId);
  if (connected) {
    const config = await loadIntegrationComposioConfig(
      options.slotId,
      options.provider,
      options.workspaceRoot
    );
    return buildCallbackResponse({
      slotId: options.slotId,
      provider: options.provider,
      projectId: options.projectId,
      workspaceRoot: options.workspaceRoot,
      toolkit: config?.toolkit ?? options.provider,
      skipCredentialProbe: true
    });
  }
  const message = options.error instanceof Error ? options.error.message : "Composio callback failed";
  if (/did not become ACTIVE in time/i.test(message)) {
    return jsonOk({
      slot_id: options.slotId,
      connected: false,
      verified: false,
      pending: true,
      error: message
    });
  }
  return jsonError(message, 502);
}
const GET = async ({ url, request }) => {
  const slotId = url.searchParams.get("slot")?.trim();
  if (!slotId) {
    return jsonError("slot query param is required", 400);
  }
  const provider = url.searchParams.get("provider")?.trim() || toolkitSlugFromSlotId(slotId);
  const workspace = await resolveRequestWorkspace(request, url.searchParams.get("project_id")?.trim());
  const userId = resolveComposioUserId(workspace.activeProjectId);
  try {
    const result = await pollAndStoreComposioConnection({
      slotId,
      provider,
      userId,
      projectId: workspace.activeProjectId,
      workspaceRoot: workspace.workspaceRoot,
      maxAttempts: 1,
      intervalMs: 0
    });
    return buildCallbackResponse({
      slotId,
      provider,
      projectId: workspace.activeProjectId,
      workspaceRoot: workspace.workspaceRoot,
      connectedAccountId: result.connectedAccountId,
      toolkit: result.toolkit
    });
  } catch (error) {
    return resolveCallbackFailure({
      slotId,
      provider,
      projectId: workspace.activeProjectId,
      workspaceRoot: workspace.workspaceRoot,
      error
    });
  }
};
const POST = async ({ request, url }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const record = typeof body === "object" && body !== null ? body : {};
  const slotId = (typeof record.slot_id === "string" ? record.slot_id : null) ?? url.searchParams.get("slot")?.trim();
  if (!slotId) {
    return jsonError("slot_id is required", 400);
  }
  const provider = (typeof record.provider === "string" ? record.provider : null) ?? url.searchParams.get("provider")?.trim() ?? toolkitSlugFromSlotId(slotId);
  const workspace = await resolveRequestWorkspace(
    request,
    (typeof record.project_id === "string" ? record.project_id : null) ?? url.searchParams.get("project_id")?.trim()
  );
  const userId = resolveComposioUserId(workspace.activeProjectId);
  try {
    const result = await pollAndStoreComposioConnection({
      slotId,
      provider,
      userId,
      projectId: workspace.activeProjectId,
      workspaceRoot: workspace.workspaceRoot,
      maxAttempts: 30,
      intervalMs: 1500
    });
    void refreshReadinessSnapshot(workspace.workspaceRoot);
    invalidateComposioSessionCache();
    invalidateComposioCredentialProbeCache();
    return buildCallbackResponse({
      slotId,
      provider,
      projectId: workspace.activeProjectId,
      workspaceRoot: workspace.workspaceRoot,
      connectedAccountId: result.connectedAccountId,
      toolkit: result.toolkit
    });
  } catch (error) {
    return resolveCallbackFailure({
      slotId,
      provider,
      projectId: workspace.activeProjectId,
      workspaceRoot: workspace.workspaceRoot,
      error
    });
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
