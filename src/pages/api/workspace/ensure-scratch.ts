import type { APIRoute } from 'astro';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const POST: APIRoute = async ({ request }) => {
  let body: { scratchPath?: string };
  try {
    body = (await request.json()) as { scratchPath?: string };
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const scratchPath = body.scratchPath?.trim();
  if (!scratchPath) {
    return jsonError('scratchPath is required', 400);
  }

  const { workspaceRoot } = await resolveRequestWorkspace(request);
  const normalizedWorkspace = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const expectedScratch = resolve(`${normalizedWorkspace}/scratch`);
  const resolvedScratch = resolve(scratchPath);

  if (resolvedScratch !== expectedScratch) {
    return jsonError('scratchPath must match the active workspace scratch directory', 403);
  }

  await mkdir(resolvedScratch, { recursive: true });
  return jsonOk({ path: resolvedScratch });
};
