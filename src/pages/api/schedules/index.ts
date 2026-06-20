import type { APIRoute } from 'astro';

import * as Sentry from '@sentry/astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { loadRecentScheduleEvents, loadScheduleRegistry } from '../../../lib/harness-reader';

export const GET: APIRoute = async () => {
  return Sentry.startSpan({ name: 'GET /api/schedules', op: 'http.server' }, async () => {
    try {
      const [registry, events] = await Promise.all([
        loadScheduleRegistry(),
        loadRecentScheduleEvents(50),
      ]);
      return jsonOk({
        registry,
        events,
      });
    } catch (error) {
      Sentry.captureException(error);
      const message = error instanceof Error ? error.message : 'Failed to load schedules';
      return jsonError(message, 500);
    }
  });
};
