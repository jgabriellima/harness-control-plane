import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import { collectRunDiagnostics } from '../../../../../lib/runtime-diagnostics';
import { resolveRequestWorkspace } from '../../../../../lib/workspace-request';

export const GET: APIRoute = async ({ params, request, url }) => {
  const runId = params.runId?.trim();
  if (!runId) {
    return jsonError('runId is required', 400);
  }

  const projectId = url.searchParams.get('project_id')?.trim();

  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const diagnostics = await collectRunDiagnostics(runId, workspaceRoot);
    return jsonOk(diagnostics);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to collect run diagnostics';
    return jsonError(message, 500);
  }
};
