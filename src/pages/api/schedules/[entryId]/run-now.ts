import type { APIRoute } from 'astro';

import * as Sentry from '@sentry/astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import { runScheduleNow } from '../../../../lib/schedule-service';

export const POST: APIRoute = async ({ params }) => {
  const entryId = params.entryId?.trim();
  if (!entryId) {
    return jsonError('entryId is required', 400);
  }

  return Sentry.startSpan({ name: 'POST /api/schedules/run-now', op: 'http.server' }, async () => {
    try {
      const result = await runScheduleNow(entryId);
      return jsonOk(result);
    } catch (error) {
      Sentry.captureException(error);
      const message = error instanceof Error ? error.message : 'Failed to run schedule';
      return jsonError(message, 500);
    }
  });
};
