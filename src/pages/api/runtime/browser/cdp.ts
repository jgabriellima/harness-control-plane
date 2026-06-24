import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import { readBrowserCdpManifest } from '../../../../lib/runtime-browser-bridge';

export const GET: APIRoute = async () => {
  const manifest = await readBrowserCdpManifest();
  if (!manifest) {
    return jsonOk({ active: null, mcpHint: null });
  }
  return jsonOk(manifest);
};
