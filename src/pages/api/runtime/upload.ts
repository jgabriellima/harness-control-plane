import type { APIRoute } from 'astro';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveHarnessBinding } from '../../../lib/harness-binding';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';
import { assertDistributedRuntimeWorkspace } from '../../../lib/workspace-runtime-guard';
import { jsonError, jsonOk } from '../../../lib/api-json';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const projectId = formData.get('project_id');

    if (!(file instanceof File)) {
      return jsonError('file is required', 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      return jsonError('file must be 10MB or smaller', 400);
    }

    const { workspaceRoot } = await resolveRequestWorkspace(
      request,
      typeof projectId === 'string' ? projectId : null,
    );
    assertDistributedRuntimeWorkspace(workspaceRoot, 'runtime.upload');
    const binding = await resolveHarnessBinding({ workspaceRoot });
    const uploadDir = join(binding.workspaceRoot, '.uploads');
    await mkdir(uploadDir, { recursive: true });

    const stamp = Date.now();
    const safeName = sanitizeFilename(file.name || 'upload.bin');
    const storedName = `${stamp}-${safeName}`;
    const storedPath = join(uploadDir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());

    await writeFile(storedPath, buffer);

    return jsonOk({
      name: file.name,
      path: storedPath,
      content_type: file.type || 'application/octet-stream',
      size: file.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload file';
    return jsonError(message, 500);
  }
};
