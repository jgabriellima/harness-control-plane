import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import { resolveHarnessBinding } from '../../../../lib/harness-binding';
import { activateComputerUse } from '../../../../lib/runtime-computer-use-setup';
import { saveComputerUsePreferences } from '../../../../lib/runtime-computer-use-preferences';

export const POST: APIRoute = async () => {
  try {
    const binding = await resolveHarnessBinding();
    const result = await activateComputerUse(binding.workspaceRoot);
    return jsonOk(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to activate computer use';
    return jsonError(message, 500);
  }
};

export const DELETE: APIRoute = async () => {
  try {
    const binding = await resolveHarnessBinding();
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
