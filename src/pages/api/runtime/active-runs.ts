import type { APIRoute } from 'astro';

import { readLiveActiveRuns } from '../../../lib/runtime-active-runs';
import { jsonOk } from '../../../lib/api-json';

export const GET: APIRoute = async () => {
  const index = await readLiveActiveRuns();
  return jsonOk(index);
};
