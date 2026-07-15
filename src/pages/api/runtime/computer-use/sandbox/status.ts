import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import {
  normalizeProjectId,
  resolveSandboxManifestForProject,
} from '../../../../../lib/runtime-computer-use-sandbox-bridge';
import { isComputerUseContractEnabled } from '../../../../../lib/runtime-computer-use-preferences';
import { runSandboxPreflight } from '../../../../../lib/runtime-computer-use-sandbox-preflight';
import { resolveRequestWorkspace } from '../../../../../lib/workspace-request';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const projectId = normalizeProjectId(url.searchParams.get('project_id') ?? undefined);
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const contractEnabled = await isComputerUseContractEnabled(workspaceRoot);
    const manifest = await resolveSandboxManifestForProject(projectId, workspaceRoot);
    const preflight = await runSandboxPreflight({ local: true });

    return jsonOk({
      contract_enabled: contractEnabled,
      ready: Boolean(manifest && manifest.phase === 'ready' && manifest.sandboxName),
      manifest,
      preflight,
      workspace_root: workspaceRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sandbox status probe failed';
    return jsonError(message, 500);
  }
};
