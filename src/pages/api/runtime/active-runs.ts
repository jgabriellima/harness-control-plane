import type { APIRoute } from 'astro';

import { readAggregatedActiveRuns } from '../../../lib/runtime-run-registry';
import { jsonOk } from '../../../lib/api-json';

export const GET: APIRoute = async () => {
  const index = await readAggregatedActiveRuns();
  return jsonOk(index);
};
