import type { APIRoute } from 'astro';

import * as Sentry from '@sentry/astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { loadRecentScheduleEvents, loadScheduleRegistry } from '../../../lib/harness-reader';
import { parseScheduleIntent } from '../../../lib/schedule-intent';
import { registerScheduleEntry } from '../../../lib/schedule-service';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

export const POST: APIRoute = async ({ request }) => {
  return Sentry.startSpan({ name: 'POST /api/schedules', op: 'http.server' }, async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Request body must be valid JSON', 400);
    }

    if (!isRecord(body)) {
      return jsonError('Request body must be an object', 400);
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description =
      typeof body.description === 'string'
        ? body.description.trim()
        : typeof body.text === 'string'
          ? body.text.trim()
          : '';
    const explicitCron = typeof body.cron === 'string' ? body.cron.trim() : '';
    const icon = typeof body.icon === 'string' ? body.icon.trim() : undefined;

    if (title && description && explicitCron) {
      try {
        const entry = await registerScheduleEntry({
          title,
          description,
          cron: explicitCron,
          icon,
        });
        return jsonOk({ entry });
      } catch (error) {
        Sentry.captureException(error);
        const message = error instanceof Error ? error.message : 'Failed to register schedule';
        return jsonError(message, 500);
      }
    }

    if (!description) {
      return jsonError('description is required', 400);
    }

    const parsed = parseScheduleIntent(description);
    const cron = explicitCron || parsed.cron;

    if (!cron) {
      return jsonOk({
        needsSchedule: true,
        draft: {
          title: parsed.title,
          description: parsed.description,
          icon: parsed.icon,
        },
      });
    }

    try {
      const entry = await registerScheduleEntry({
        title: title || parsed.title,
        description: parsed.description,
        cron,
        icon: icon || parsed.icon,
      });
      return jsonOk({ entry });
    } catch (error) {
      Sentry.captureException(error);
      const message = error instanceof Error ? error.message : 'Failed to register schedule';
      return jsonError(message, 500);
    }
  });
};
