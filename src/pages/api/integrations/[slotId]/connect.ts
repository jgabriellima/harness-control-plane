import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import {
  createComposioConnectLink,
  invalidateAuthConfigCache,
  toolkitSlugFromSlotId,
} from '../../../../lib/composio-auth-config';
import {
  disconnectComposioSlot,
  isComposioSlotConnectable,
  isComposioSlotConnected,
  isComposioSlotCredentialVerified,
  loadIntegrationComposioConfig,
  resolveComposioUserId,
  verifyComposioSlotRemote,
} from '../../../../lib/composio-connection';
import { invalidateComposioCredentialProbeCache } from '../../../../lib/composio-credential-probe';
import { invalidateComposioSessionCache } from '../../../../lib/composio-mcp-bridge';
import { loadComposioConnectionDataForSlot } from '../../../../lib/composio-tenant-connection-data';
import { resolveRequestWorkspace } from '../../../../lib/workspace-request';

export const GET: APIRoute = async ({ params, url, request }) => {
  const slotId = params.slotId?.trim();
  if (!slotId) {
    return jsonError('slotId is required', 400);
  }

  const provider = url.searchParams.get('provider')?.trim() || toolkitSlugFromSlotId(slotId);
  const toolkitSlug =
    url.searchParams.get('toolkit')?.trim().toLowerCase() ?? toolkitSlugFromSlotId(slotId, provider);

  const workspace = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
  const composioConfig = await loadIntegrationComposioConfig(
    slotId,
    provider,
    workspace.workspaceRoot,
  );
  const connectable = await isComposioSlotConnectable(slotId, provider, workspace.workspaceRoot);
  const connected = await isComposioSlotConnected(slotId, workspace.activeProjectId);
  const remote =
    composioConfig?.enabled && connected
      ? await verifyComposioSlotRemote({
          slotId,
          provider,
          projectId: workspace.activeProjectId,
          workspaceRoot: workspace.workspaceRoot,
        })
      : null;

  return jsonOk({
    slot_id: slotId,
    toolkit: composioConfig?.toolkit ?? toolkitSlug,
    auth_type: composioConfig?.enabled ? 'composio_oauth' : 'manual',
    connect_available: connectable && (!connected || (remote?.credentialValid === false)),
    connected,
    verified: remote ? isComposioSlotCredentialVerified(remote) : false,
    needs_reconnect:
      connected &&
      (!remote?.remoteActive || remote?.credentialValid === false),
    failure_reason: remote?.failureReason ?? null,
    expected_subdomain: remote?.expectedSubdomain ?? null,
    stored_subdomain: remote?.storedSubdomain ?? null,
    composio_user_id: remote?.userId ?? resolveComposioUserId(workspace.activeProjectId),
    connected_account_id_prefix: remote?.connectedAccountId?.slice(0, 8) ?? null,
  });
};

export const POST: APIRoute = async ({ params, url, request }) => {
  const slotId = params.slotId?.trim();
  if (!slotId) {
    return jsonError('slotId is required', 400);
  }

  const provider = url.searchParams.get('provider')?.trim() || toolkitSlugFromSlotId(slotId);
  const workspace = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));

  const composioConfig = await loadIntegrationComposioConfig(
    slotId,
    provider,
    workspace.workspaceRoot,
  );
  const toolkitSlug = composioConfig?.toolkit ?? toolkitSlugFromSlotId(slotId, provider);

  if (!(await isComposioSlotConnectable(slotId, provider, workspace.workspaceRoot))) {
    return jsonError('COMPOSIO_API_KEY is not configured or slot does not support Composio OAuth', 503);
  }

  const userId = resolveComposioUserId(workspace.activeProjectId);

  await disconnectComposioSlot(slotId, userId, toolkitSlug, workspace.activeProjectId);
  invalidateAuthConfigCache(toolkitSlug);
  invalidateComposioSessionCache();
  invalidateComposioCredentialProbeCache();

  const connectionData = await loadComposioConnectionDataForSlot({
    slotId,
    provider,
    workspaceRoot: workspace.workspaceRoot,
  });

  const callbackParams = new URLSearchParams({
    slot: slotId,
    provider,
    project_id: workspace.activeProjectId,
  });
  const callbackUrl =
    url.searchParams.get('callback_url')?.trim() ||
    `${url.origin}/integrations/composio/callback?${callbackParams.toString()}`;

  try {
    const redirectUrl = await createComposioConnectLink({
      toolkitSlug,
      userId,
      callbackUrl,
      connectionData,
      authContract: composioConfig?.authContract,
    });

    return jsonOk({
      redirect_url: redirectUrl,
      slot_id: slotId,
      toolkit: toolkitSlug,
      connection_data: connectionData ?? null,
      subdomain_hint: connectionData?.subdomain ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Composio connect failed';
    return jsonError(message, 502);
  }
};
