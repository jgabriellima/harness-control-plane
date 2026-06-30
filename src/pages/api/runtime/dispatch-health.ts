import type { APIRoute } from 'astro';

import { jsonOk } from '../../../lib/api-json';
import { probeSdkDispatchHealth } from '../../../lib/runtime-sdk-probe';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ request, url }) => {
  const projectId = url.searchParams.get('project_id')?.trim() || undefined;
  const force = url.searchParams.get('force') === '1';

  const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
  const health = await probeSdkDispatchHealth({
    cacheKey: workspaceRoot,
    force,
  });

  return jsonOk(health);
};
