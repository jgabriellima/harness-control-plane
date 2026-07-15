import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { t as toolkitSlugFromSlotId, i as invalidateAuthConfigCache, c as createComposioConnectLink } from './composio-auth-config_B4-JkaML.mjs';
import { l as loadIntegrationComposioConfig, c as isComposioSlotConnectable, b as isComposioSlotConnected, v as verifyComposioSlotRemote, r as resolveComposioUserId, a as isComposioSlotCredentialVerified, d as disconnectComposioSlot, i as invalidateComposioCredentialProbeCache, e as loadComposioConnectionDataForSlot } from './composio-connection_CC45xKfl.mjs';
import { i as invalidateComposioSessionCache } from './composio-mcp-bridge_vI0qRf5J.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const GET = async ({ params, url, request }) => {
  const slotId = params.slotId?.trim();
  if (!slotId) {
    return jsonError("slotId is required", 400);
  }
  const provider = url.searchParams.get("provider")?.trim() || toolkitSlugFromSlotId(slotId);
  const toolkitSlug = url.searchParams.get("toolkit")?.trim().toLowerCase() ?? toolkitSlugFromSlotId(slotId, provider);
  const workspace = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
  const composioConfig = await loadIntegrationComposioConfig(
    slotId,
    provider,
    workspace.workspaceRoot
  );
  const connectable = await isComposioSlotConnectable(slotId, provider, workspace.workspaceRoot);
  const connected = await isComposioSlotConnected(slotId, workspace.activeProjectId);
  const remote = composioConfig?.enabled && connected ? await verifyComposioSlotRemote({
    slotId,
    provider,
    projectId: workspace.activeProjectId,
    workspaceRoot: workspace.workspaceRoot
  }) : null;
  return jsonOk({
    slot_id: slotId,
    toolkit: composioConfig?.toolkit ?? toolkitSlug,
    auth_type: composioConfig?.enabled ? "composio_oauth" : "manual",
    connect_available: connectable && (!connected || remote?.credentialValid === false),
    connected,
    verified: remote ? isComposioSlotCredentialVerified(remote) : false,
    needs_reconnect: connected && (!remote?.remoteActive || remote?.credentialValid === false),
    failure_reason: remote?.failureReason ?? null,
    expected_subdomain: remote?.expectedSubdomain ?? null,
    stored_subdomain: remote?.storedSubdomain ?? null,
    composio_user_id: remote?.userId ?? resolveComposioUserId(workspace.activeProjectId),
    connected_account_id_prefix: remote?.connectedAccountId?.slice(0, 8) ?? null
  });
};
const POST = async ({ params, url, request }) => {
  const slotId = params.slotId?.trim();
  if (!slotId) {
    return jsonError("slotId is required", 400);
  }
  const provider = url.searchParams.get("provider")?.trim() || toolkitSlugFromSlotId(slotId);
  const workspace = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
  const composioConfig = await loadIntegrationComposioConfig(
    slotId,
    provider,
    workspace.workspaceRoot
  );
  const toolkitSlug = composioConfig?.toolkit ?? toolkitSlugFromSlotId(slotId, provider);
  if (!await isComposioSlotConnectable(slotId, provider, workspace.workspaceRoot)) {
    return jsonError("COMPOSIO_API_KEY is not configured or slot does not support Composio OAuth", 503);
  }
  const userId = resolveComposioUserId(workspace.activeProjectId);
  await disconnectComposioSlot(slotId, userId, toolkitSlug, workspace.activeProjectId);
  invalidateAuthConfigCache(toolkitSlug);
  invalidateComposioSessionCache();
  invalidateComposioCredentialProbeCache();
  const connectionData = await loadComposioConnectionDataForSlot({
    slotId,
    provider,
    workspaceRoot: workspace.workspaceRoot
  });
  const callbackParams = new URLSearchParams({
    slot: slotId,
    provider,
    project_id: workspace.activeProjectId
  });
  const callbackUrl = url.searchParams.get("callback_url")?.trim() || `${url.origin}/integrations/composio/callback?${callbackParams.toString()}`;
  try {
    const redirectUrl = await createComposioConnectLink({
      toolkitSlug,
      userId,
      callbackUrl,
      connectionData,
      authContract: composioConfig?.authContract
    });
    return jsonOk({
      redirect_url: redirectUrl,
      slot_id: slotId,
      toolkit: toolkitSlug,
      connection_data: connectionData ?? null,
      subdomain_hint: connectionData?.subdomain ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Composio connect failed";
    return jsonError(message, 502);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
