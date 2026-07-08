import type { APIRoute } from 'astro';

import { jsonOk } from '../../../../lib/api-json';
import { buildUiControlManifest } from '../../../../lib/runtime-ui-bridge';

export const GET: APIRoute = async ({ url }) => {
  const origin = url.origin;
  return jsonOk(buildUiControlManifest(origin));
};
