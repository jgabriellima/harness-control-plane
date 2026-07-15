import type { APIRoute } from 'astro';

import { readRunSessionSnapshot } from '../../../lib/runtime-active-runs';
import { jsonOk } from '../../../lib/api-json';

export const GET: APIRoute = async () => {
  const snapshot = await readRunSessionSnapshot();
  return jsonOk(snapshot);
};
