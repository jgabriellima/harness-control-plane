import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import { toolkitSlugFromSlotId } from '../../../../lib/composio-auth-config';
import {
  ComposioSubdomainMalformedError,
  disconnectComposioSlot,
  isComposioSlotConnected,
  loadIntegrationComposioConfig,
  resolveComposioUserId,
} from '../../../../lib/composio-connection';
import { invalidateComposioSessionCache } from '../../../../lib/composio-mcp-bridge';
import { invalidateComposioCredentialProbeCache } from '../../../../lib/composio-credential-probe';
import { refreshReadinessSnapshot } from '../../../../lib/refresh-readiness-snapshot';
import { resolveRequestWorkspace } from '../../../../lib/workspace-request';

export const POST: APIRoute = async ({ params, url, request }) => {
  const slotId = params.slotId?.trim();
  if (!slotId) {
    return jsonError('slotId is required', 400);
  }

  const provider = url.searchParams.get('provider')?.trim() || toolkitSlugFromSlotId(slotId);
  const workspace = await resolveRequestWorkspace(request, url.searchParams.get('project_id')?.trim());

  const composioConfig = await loadIntegrationComposioConfig(
    slotId,
    provider,
    workspace.workspaceRoot,
  );
  if (!composioConfig?.enabled) {
    return jsonError('Slot does not support Composio OAuth', 400);
  }

  if (!(await isComposioSlotConnected(slotId, workspace.activeProjectId))) {
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
      disconnected: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Disconnect failed';
    return jsonError(message, 502);
  }
};
