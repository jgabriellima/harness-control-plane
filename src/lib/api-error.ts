import { jsonError } from './api-json';
import { errorFields, runtimeLogger } from './runtime-logger';
import { toUserFacingErrorMessage } from './user-facing-error';

export function handleApiError(
  scope: string,
  error: unknown,
  fallback: string,
  status: 400 | 403 | 404 | 409 | 410 | 500 | 502 | 503 | 504 = 500,
  fields: Record<string, unknown> = {},
): Response {
  runtimeLogger.error(`${scope}.failed`, {
    ...fields,
    ...errorFields(error),
  });

  const message = toUserFacingErrorMessage(error, fallback);
  return jsonError(message, status);
}
