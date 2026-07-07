import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import { resolveHarnessBinding } from '../../../../lib/harness-binding';
import { saveComputerUsePreferences } from '../../../../lib/runtime-computer-use-preferences';
import {
  ensureDaemonRunning,
  openMacPermissionSettings,
  probeComputerUseSetup,
  startPermissionsGrantDetached,
  type ActivateComputerUseResult,
} from '../../../../lib/runtime-computer-use-setup';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function finalizeIfReady(workspaceRoot: string): Promise<ActivateComputerUseResult> {
  const setup = await probeComputerUseSetup(workspaceRoot);

  if (setup.ready) {
    await saveComputerUsePreferences({ hostControlEnabled: true }, workspaceRoot);
    return { setup: { ...setup, phase: 'ready' }, activated: true };
  }

  return { setup, activated: false };
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const openSettings = isRecord(body) && body.open_settings === true;
  const grantOnly = isRecord(body) && body.grant_only === true;

  try {
    const binding = await resolveHarnessBinding();
    const root = binding.workspaceRoot;

    await ensureDaemonRunning();

    if (openSettings) {
      await openMacPermissionSettings();
      const result = await finalizeIfReady(root);
      return jsonOk({
        ...result,
        opened_settings: true,
        message: 'System Settings opened — enable CuaDriver under Accessibility and Screen Recording.',
      });
    }

    if (grantOnly) {
      startPermissionsGrantDetached();
      const result = await finalizeIfReady(root);
      return jsonOk({
        ...result,
        grant_started: true,
        message:
          result.activated
            ? 'Permissions granted — computer use is active.'
            : 'macOS permission dialogs opened — approve Accessibility and Screen Recording for CuaDriver.',
      });
    }

    startPermissionsGrantDetached();
    const result = await finalizeIfReady(root);
    return jsonOk({
      ...result,
      grant_started: true,
      message:
        result.activated
          ? 'Computer use is active.'
          : 'Permission flow started — approve the macOS dialogs for CuaDriver.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to grant permissions';
    return jsonError(message, 500);
  }
};
