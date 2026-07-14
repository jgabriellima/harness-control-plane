import type { APIRoute } from 'astro';

import { jsonOk } from '../../../lib/api-json';
import { fetchDesignDaemonHealth } from '../../../lib/design-daemon-client';

export const GET: APIRoute = async () => {
  const health = await fetchDesignDaemonHealth();
  return jsonOk(health, health.ok ? 200 : 503);
};
