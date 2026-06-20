import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import {
  patchRightPanelManifest,
  readRightPanelManifest,
  type WidgetManifestEntry,
  type WidgetId,
} from '../../../lib/ui-panel-manifest';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isWidgetId(value: unknown): value is WidgetId {
  return value === 'attention' || value === 'jobs' || value === 'activity' || value === 'health';
}

function parseWidgets(raw: unknown): WidgetManifestEntry[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const widgets: WidgetManifestEntry[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry) || !isWidgetId(entry.id)) {
      continue;
    }
    widgets.push({
      id: entry.id,
      visible: typeof entry.visible === 'boolean' ? entry.visible : true,
      order: typeof entry.order === 'number' ? entry.order : index,
      height: typeof entry.height === 'number' ? entry.height : 180,
    });
  }

  return widgets.length > 0 ? widgets : undefined;
}

export const GET: APIRoute = async () => {
  try {
    const manifest = await readRightPanelManifest();
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load panel manifest';
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
    const manifest = await patchRightPanelManifest({
      collapsed: typeof body.collapsed === 'boolean' ? body.collapsed : undefined,
      widgets: parseWidgets(body.widgets),
    });
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update panel manifest';
    return jsonError(message, 500);
  }
};
