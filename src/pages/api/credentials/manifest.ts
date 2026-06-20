import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { loadCredentialManifest } from '../../../lib/credential-manifest';

export const GET: APIRoute = async () => {
  try {
    const manifest = await loadCredentialManifest();
    if (!manifest) {
      return jsonOk({
        generated_at: null,
        source: 'missing',
        secrets: [],
      });
    }
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load credential manifest';
    return jsonError(message, 500);
  }
};
