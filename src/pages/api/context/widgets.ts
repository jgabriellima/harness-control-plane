import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { collectContextWidgets } from '../../../lib/context-widgets';

export const GET: APIRoute = async () => {
  try {
    const widgets = await collectContextWidgets();
    return jsonOk(widgets);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load context widgets';
    return jsonError(message, 500);
  }
};
