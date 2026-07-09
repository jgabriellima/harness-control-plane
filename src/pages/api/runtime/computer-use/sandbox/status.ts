import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import {
  readActiveSandboxManifest,
  readSandboxManifest,
} from '../../../../../lib/runtime-computer-use-sandbox-bridge';
import { isComputerUseContractEnabled } from '../../../../../lib/runtime-computer-use-preferences';
import { runSandboxPreflight } from '../../../../../lib/runtime-computer-use-sandbox-preflight';
import { resolveRequestWorkspace } from '../../../../../lib/workspace-request';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const projectId = url.searchParams.get('project_id')?.trim() || undefined;
    const conversationId = url.searchParams.get('conversation_id')?.trim() || '';
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const contractEnabled = await isComputerUseContractEnabled(workspaceRoot);
    const manifest = conversationId
      ? await readSandboxManifest(conversationId, workspaceRoot)
      : await readActiveSandboxManifest(workspaceRoot);
    const preflight = await runSandboxPreflight({ local: true });

    return jsonOk({
      contract_enabled: contractEnabled,
      ready: Boolean(manifest && manifest.phase === 'ready' && manifest.sandboxName),
      manifest,
      preflight,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sandbox status probe failed';
    return jsonError(message, 500);
  }
};
