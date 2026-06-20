import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { loadSettingsSnapshot } from '../../../lib/settings-snapshot';

export const GET: APIRoute = async () => {
  try {
    const settings = await loadSettingsSnapshot();
    return jsonOk(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load settings';
    return jsonError(message, 500);
  }
};
