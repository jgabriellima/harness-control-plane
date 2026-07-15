import type { APIRoute } from 'astro';

import { jsonOk } from '../../../lib/api-json';
import { reconcileRuntimeCredentials } from '../../../lib/runtime-credentials-reconcile';
import { clearRuntimeAuthGate } from '../../../lib/runtime-sdk-auth-gate';
import { invalidateSdkProbeCache, probeSdkDispatchHealth } from '../../../lib/runtime-sdk-probe';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

/** Server-side credential reload + forced probe — no operator logout required. */
export const POST: APIRoute = async ({ request, url }) => {
  const projectId = url.searchParams.get('project_id')?.trim() || undefined;
  const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);

  await reconcileRuntimeCredentials();
  clearRuntimeAuthGate();
  invalidateSdkProbeCache(workspaceRoot);

  const health = await probeSdkDispatchHealth({
    cacheKey: workspaceRoot,
    force: true,
    workspaceCwd: workspaceRoot,
    probeLocalExecution: true,
  });

  return jsonOk({
    reconciled: true,
    health,
  });
};
