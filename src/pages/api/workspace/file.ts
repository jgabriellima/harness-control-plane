import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { toUserFacingArtifactErrorMessage } from '../../../lib/user-facing-error';
import { errorFields, runtimeLogger } from '../../../lib/runtime-logger';
import { readWorkspaceFile, resolveWorkspaceFileLocation } from '../../../lib/workspace-files';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ url, request }) => {
  const requestedPath = url.searchParams.get('path');

  if (!requestedPath) {
    return jsonError('Query parameter "path" is required', 400);
  }

  try {
    const projectId = url.searchParams.get('project_id')?.trim() || undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);

    if (url.searchParams.get('raw') === '1') {
      const resolved = await resolveWorkspaceFileLocation(requestedPath, workspaceRoot);

      if (!resolved) {
        runtimeLogger.warn('workspace_file.not_found', {
          requested_path: requestedPath,
          project_id: projectId,
          raw: true,
        });
        return jsonError(toUserFacingArtifactErrorMessage('File not found'), 404);
      }

      if (resolved.size > 10_000_000) {
        return jsonError('File exceeds maximum download size (10MB)', 413);
      }

      const bytes = await readFile(resolved.safePath);

      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': resolved.mime,
          'Content-Length': String(resolved.size),
          'Cache-Control': 'private, max-age=60',
          'Content-Disposition': `inline; filename="${encodeURIComponent(resolved.displayPath.split('/').pop() ?? 'file')}"`,
        },
      });
    }

    const file = await readWorkspaceFile(requestedPath, workspaceRoot);

    if (!file) {
      runtimeLogger.warn('workspace_file.not_found', {
        requested_path: requestedPath,
        project_id: projectId,
      });
      return jsonError(toUserFacingArtifactErrorMessage('File not found'), 404);
    }

    return jsonOk(file);
  } catch (error) {
    runtimeLogger.error('workspace_file.read_failed', {
      requested_path: requestedPath,
      project_id: url.searchParams.get('project_id')?.trim() || undefined,
      ...errorFields(error),
    });
    return jsonError(
      toUserFacingArtifactErrorMessage(error, "This file couldn't be opened right now."),
      500,
    );
  }
};
