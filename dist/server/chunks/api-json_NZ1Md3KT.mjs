function jsonOk(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function jsonError(message, status, extras) {
  const body = {
    error: message,
    ...extras
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export { jsonOk as a, jsonError as j };
