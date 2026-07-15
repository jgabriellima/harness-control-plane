import * as Sentry from '@sentry/astro';
import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { d as loadScheduleRegistry, e as loadRecentScheduleEvents } from './harness-reader_xurzrbMU.mjs';
import { p as parseScheduleIntent } from './schedule-intent_BeZ0tIY9.mjs';
import { d as deleteScheduleEntry, s as setScheduleEnabled, a as registerScheduleEntry } from './schedule-service__ZKHNTr7.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const GET = async () => {
  return Sentry.startSpan({ name: "GET /api/schedules", op: "http.server" }, async () => {
    try {
      const [registry, events] = await Promise.all([
        loadScheduleRegistry(),
        loadRecentScheduleEvents(50)
      ]);
      return jsonOk({
        registry,
        events
      });
    } catch (error) {
      Sentry.captureException(error);
      const message = error instanceof Error ? error.message : "Failed to load schedules";
      return jsonError(message, 500);
    }
  });
};
const POST = async ({ request }) => {
  return Sentry.startSpan({ name: "POST /api/schedules", op: "http.server" }, async () => {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON", 400);
    }
    if (!isRecord(body)) {
      return jsonError("Request body must be an object", 400);
    }
    const description = typeof body.description === "string" ? body.description.trim() : typeof body.text === "string" ? body.text.trim() : "";
    if (!description) {
      return jsonError("description is required", 400);
    }
    const explicitCron = typeof body.cron === "string" ? body.cron.trim() : "";
    const parsed = parseScheduleIntent(description);
    const cron = explicitCron || parsed.cron;
    if (!cron) {
      return jsonOk({
        needsSchedule: true,
        draft: {
          title: parsed.title,
          description: parsed.description,
          icon: parsed.icon
        }
      });
    }
    try {
      const entry = await registerScheduleEntry({
        title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : parsed.title,
        description: parsed.description,
        cron,
        icon: typeof body.icon === "string" ? body.icon : parsed.icon
      });
      return jsonOk({ entry });
    } catch (error) {
      Sentry.captureException(error);
      const message = error instanceof Error ? error.message : "Failed to register schedule";
      return jsonError(message, 500);
    }
  });
};
const PATCH = async ({ request, params }) => {
  const entryId = params.entryId?.trim();
  if (!entryId) {
    return jsonError("entryId is required", 400);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }
  if (!isRecord(body)) {
    return jsonError("Request body must be an object", 400);
  }
  try {
    if (typeof body.enabled === "boolean") {
      const entry = await setScheduleEnabled(entryId, body.enabled);
      return jsonOk({ entry });
    }
    return jsonError("No supported patch fields", 400);
  } catch (error) {
    Sentry.captureException(error);
    const message = error instanceof Error ? error.message : "Failed to update schedule";
    return jsonError(message, 500);
  }
};
const DELETE = async ({ params }) => {
  const entryId = params.entryId?.trim();
  if (!entryId) {
    return jsonError("entryId is required", 400);
  }
  try {
    await deleteScheduleEntry(entryId);
    return jsonOk({ deleted: true, entryId });
  } catch (error) {
    Sentry.captureException(error);
    const message = error instanceof Error ? error.message : "Failed to delete schedule";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  DELETE,
  GET,
  PATCH,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
