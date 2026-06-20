import type { APIRoute } from 'astro';

import { readRunsIndex } from '../../../lib/runtime-run-registry';
import { jsonOk } from '../../../lib/api-json';

export const GET: APIRoute = async () => {
  const index = await readRunsIndex();
  return jsonOk(index);
};
