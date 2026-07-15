import * as Sentry from '@sentry/astro';
import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { r as runScheduleNow } from './schedule-service__ZKHNTr7.mjs';

const POST = async ({ params }) => {
  const entryId = params.entryId?.trim();
  if (!entryId) {
    return jsonError("entryId is required", 400);
  }
  return Sentry.startSpan({ name: "POST /api/schedules/run-now", op: "http.server" }, async () => {
    try {
      const result = await runScheduleNow(entryId);
      return jsonOk(result);
    } catch (error) {
      Sentry.captureException(error);
      const message = error instanceof Error ? error.message : "Failed to run schedule";
      return jsonError(message, 500);
    }
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
