import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import { resolveWorkspaceHarnessBinding } from '../../../../lib/workspace-harness-binding';
import { resolveRequestWorkspace } from '../../../../lib/workspace-request';
import {
  COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE,
  COMPUTER_USE_PERMISSION_DIALOG_HINT,
  COMPUTER_USE_PERMISSION_HINT,
  COMPUTER_USE_PERMISSION_STEPS,
} from '../../../../lib/runtime-computer-use-copy';
import {
  openMacPermissionSettings,
  preparePermissionGrant,
  probeComputerUseSetup,
  startPermissionsGrantDetached,
  tryCompleteComputerUseSetup,
} from '../../../../lib/runtime-computer-use-setup';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const POST: APIRoute = async ({ request, url }) => {
  let body: unknown = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const openSettings = isRecord(body) && body.open_settings === true;
  const grantOnly = isRecord(body) && body.grant_only === true;

  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
    const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
    const root = binding.workspaceRoot;

    // Stop driver before toggling permissions — avoids macOS "Quit & Reopen" in most cases.
    await preparePermissionGrant();

    if (openSettings) {
      await openMacPermissionSettings();
      const completed = await tryCompleteComputerUseSetup(root);
      const setup = await probeComputerUseSetup(root);
      return jsonOk({
        setup,
        activated: completed.activated,
        opened_settings: true,
        restarted: completed.restarted,
        message: completed.activated
          ? COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE
          : `System Settings opened — ${COMPUTER_USE_PERMISSION_STEPS}`,
      });
    }

    if (grantOnly) {
      startPermissionsGrantDetached();
      const completed = await tryCompleteComputerUseSetup(root);
      const setup = await probeComputerUseSetup(root);
      return jsonOk({
        setup,
        activated: completed.activated,
        grant_started: true,
        restarted: completed.restarted,
        message: completed.activated
          ? COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE
          : COMPUTER_USE_PERMISSION_STEPS,
      });
    }

    startPermissionsGrantDetached();
    const completed = await tryCompleteComputerUseSetup(root);
    const setup = await probeComputerUseSetup(root);
    return jsonOk({
      setup,
      activated: completed.activated,
      grant_started: true,
      restarted: completed.restarted,
      message: completed.activated
        ? COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE
        : COMPUTER_USE_PERMISSION_DIALOG_HINT,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to grant permissions';
    return jsonError(message, 500);
  }
};
