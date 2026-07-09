import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import { runSandboxPreflight } from '../../../../../lib/runtime-computer-use-sandbox-preflight';
import { isComputerUseContractEnabled } from '../../../../../lib/runtime-computer-use-preferences';
import { resolveRequestWorkspace } from '../../../../../lib/workspace-request';

export const GET: APIRoute = async ({ request, url }) => {
  const localParam = url.searchParams.get('local');
  const local = localParam === null ? true : localParam !== '0' && localParam !== 'false';

  try {
    const projectId = url.searchParams.get('project_id')?.trim() || undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const contractEnabled = await isComputerUseContractEnabled(workspaceRoot);
    const preflight = await runSandboxPreflight({ local });

    return jsonOk({
      contract_enabled: contractEnabled,
      local,
      ready: contractEnabled && preflight.ok,
      preflight,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sandbox pre-flight probe failed';
    return jsonError(message, 500);
  }
};
