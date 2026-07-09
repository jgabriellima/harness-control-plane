export interface ApiErrorBody {
  error: string;
  request_id?: string;
  phase?: string;
  detail?: string;
}

export function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonError(
  message: string,
  status: 400 | 403 | 404 | 409 | 410 | 500 | 502 | 503 | 504,
  extras?: Omit<ApiErrorBody, 'error'>,
): Response {
  const body: ApiErrorBody = {
    error: message,
    ...extras,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
