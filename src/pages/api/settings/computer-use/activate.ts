import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import { resolveWorkspaceHarnessBinding } from '../../../../lib/workspace-harness-binding';
import { activateComputerUse } from '../../../../lib/runtime-computer-use-setup';
import { saveComputerUsePreferences } from '../../../../lib/runtime-computer-use-preferences';
import { resolveRequestWorkspace } from '../../../../lib/workspace-request';

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
    const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
    const result = await activateComputerUse(binding.workspaceRoot);
    return jsonOk(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to activate computer use';
    return jsonError(message, 500);
  }
};

export const DELETE: APIRoute = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
    const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
    const preferences = await saveComputerUsePreferences(
      { hostControlEnabled: false, allowForegroundCursor: false },
      binding.workspaceRoot,
    );
    return jsonOk({ preferences, activated: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate computer use';
    return jsonError(message, 500);
  }
};
