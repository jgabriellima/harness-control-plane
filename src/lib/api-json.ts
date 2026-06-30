export interface ApiErrorBody {
  error: string;
  request_id?: string;
  phase?: string;
  detail?: string;
}

export function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonError(
  message: string,
  status: 400 | 404 | 500 | 502 | 503 | 504,
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
