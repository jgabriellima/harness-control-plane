import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const POST = async ({ request }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const scratchPath = body.scratchPath?.trim();
  if (!scratchPath) {
    return jsonError("scratchPath is required", 400);
  }
  const { workspaceRoot } = await resolveRequestWorkspace(request);
  const normalizedWorkspace = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const expectedScratch = resolve(`${normalizedWorkspace}/scratch`);
  const resolvedScratch = resolve(scratchPath);
  if (resolvedScratch !== expectedScratch) {
    return jsonError("scratchPath must match the active workspace scratch directory", 403);
  }
  await mkdir(resolvedScratch, { recursive: true });
  return jsonOk({ path: resolvedScratch });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
