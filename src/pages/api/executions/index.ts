import type { APIRoute } from 'astro';

import * as Sentry from '@sentry/astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { dispatchExecutionJob } from '../../../lib/execution-dispatch';
import { GatewayError, routeExecutionRequest } from '../../../lib/gateway';
import { listExecutions } from '../../../lib/harness-reader';

export const GET: APIRoute = async () => {
  try {
    const executions = await listExecutions();
    return jsonOk({ executions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load executions';
    return jsonError(message, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  return Sentry.startSpan({ name: 'POST /api/executions', op: 'http.server' }, async () => {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonError('Request body must be valid JSON', 400);
    }

    try {
      const { job } = await routeExecutionRequest(request, body);
      const result = await dispatchExecutionJob(job);
      return jsonOk(result);
    } catch (error) {
      Sentry.captureException(error);

      if (error instanceof GatewayError) {
        return jsonError(error.message, error.statusCode);
      }

      if (error instanceof Error) {
        if (error.message.startsWith('Workflow not found')) {
          return jsonError(error.message, 404);
        }
        if (error.message.includes('No runnable workflow')) {
          return jsonError(error.message, 404);
        }
      }

      return jsonError('Failed to dispatch execution', 500);
    }
  });
};
