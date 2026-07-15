import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { t as toolkitSlugFromSlotId } from './composio-auth-config_B4-JkaML.mjs';
import { l as loadIntegrationComposioConfig, b as isComposioSlotConnected, r as resolveComposioUserId, d as disconnectComposioSlot, i as invalidateComposioCredentialProbeCache } from './composio-connection_CC45xKfl.mjs';
import { i as invalidateComposioSessionCache } from './composio-mcp-bridge_vI0qRf5J.mjs';
import { r as refreshReadinessSnapshot } from './refresh-readiness-snapshot_Cr_BVAsY.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const POST = async ({ params, url, request }) => {
  const slotId = params.slotId?.trim();
  if (!slotId) {
    return jsonError("slotId is required", 400);
  }
  const provider = url.searchParams.get("provider")?.trim() || toolkitSlugFromSlotId(slotId);
  const workspace = await resolveRequestWorkspace(request, url.searchParams.get("project_id")?.trim());
  const composioConfig = await loadIntegrationComposioConfig(
    slotId,
    provider,
    workspace.workspaceRoot
  );
  if (!composioConfig?.enabled) {
    return jsonError("Slot does not support Composio OAuth", 400);
  }
  if (!await isComposioSlotConnected(slotId, workspace.activeProjectId)) {
    return jsonOk({ slot_id: slotId, connected: false, disconnected: true });
  }
  const userId = resolveComposioUserId(workspace.activeProjectId);
  try {
    await disconnectComposioSlot(slotId, userId, composioConfig.toolkit, workspace.activeProjectId);
    invalidateComposioSessionCache();
    invalidateComposioCredentialProbeCache();
    await refreshReadinessSnapshot(workspace.workspaceRoot);
    return jsonOk({
      slot_id: slotId,
      toolkit: composioConfig.toolkit,
      connected: false,
      disconnected: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Disconnect failed";
    return jsonError(message, 502);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
