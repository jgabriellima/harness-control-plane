import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import {
  loadComputerUseStatus,
  saveComputerUsePreferences,
  type ComputerUsePreferencesPatch,
} from '../../../lib/runtime-computer-use-preferences';
import { resolveHarnessBinding } from '../../../lib/harness-binding';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePatch(body: unknown): ComputerUsePreferencesPatch {
  if (!isRecord(body)) {
    return {};
  }

  const patch: ComputerUsePreferencesPatch = {};

  if (typeof body.hostControlEnabled === 'boolean') {
    patch.hostControlEnabled = body.hostControlEnabled;
  }
  if (typeof body.allowForegroundCursor === 'boolean') {
    patch.allowForegroundCursor = body.allowForegroundCursor;
  }

  return patch;
}

export const GET: APIRoute = async () => {
  try {
    const binding = await resolveHarnessBinding();
    const status = await loadComputerUseStatus(binding.workspaceRoot);
    return jsonOk(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load computer-use settings';
    return jsonError(message, 500);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON', 400);
  }

  try {
    const binding = await resolveHarnessBinding();
    const patch = parsePatch(body);

    if (patch.hostControlEnabled === undefined && patch.allowForegroundCursor === undefined) {
      return jsonError('At least one of hostControlEnabled or allowForegroundCursor is required', 400);
    }

    if (patch.allowForegroundCursor === true && patch.hostControlEnabled === false) {
      return jsonError('allowForegroundCursor requires hostControlEnabled', 400);
    }

    const preferences = await saveComputerUsePreferences(patch, binding.workspaceRoot);
    const status = await loadComputerUseStatus(binding.workspaceRoot);

    return jsonOk({ ...status, preferences });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save computer-use settings';
    return jsonError(message, 500);
  }
};
