import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { patchShellLayoutManifest, readShellLayoutManifest } from '../../../lib/ui-shell-layout';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const GET: APIRoute = async () => {
  try {
    const manifest = await readShellLayoutManifest();
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load shell layout';
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

  if (!isRecord(body)) {
    return jsonError('Request body must be a JSON object', 400);
  }

  try {
    const manifest = await patchShellLayoutManifest({
      sidebarSize: typeof body.sidebarSize === 'number' ? body.sidebarSize : undefined,
      contextSize: typeof body.contextSize === 'number' ? body.contextSize : undefined,
      sidebarExpanded:
        typeof body.sidebarExpanded === 'boolean' ? body.sidebarExpanded : undefined,
    });
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update shell layout';
    return jsonError(message, 500);
  }
};
