import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import {
  readActiveSandboxManifest,
  readSandboxManifest,
  runSandboxActionScript,
} from '../../../../../lib/runtime-computer-use-sandbox-bridge';
import { isComputerUseContractEnabled } from '../../../../../lib/runtime-computer-use-preferences';
import { resolveRequestWorkspace } from '../../../../../lib/workspace-request';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON', 400);
  }

  if (!isRecord(body)) {
    return jsonError('Request body must be a JSON object', 400);
  }

  const actionRaw = typeof body.action === 'string' ? body.action.trim() : '';
  const action =
    actionRaw === 'open_url' || actionRaw === 'open-url'
      ? 'open-url'
      : actionRaw === 'screenshot'
        ? 'screenshot'
        : actionRaw === 'shell'
          ? 'shell'
          : null;

  if (!action) {
    return jsonError('action must be open_url, screenshot, or shell', 400);
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const command = typeof body.command === 'string' ? body.command : '';
  const timeout = typeof body.timeout === 'number' ? body.timeout : undefined;
  const conversationId =
    typeof body.conversation_id === 'string' ? body.conversation_id.trim() : '';

  if (action === 'open-url' && !url) {
    return jsonError('url is required for open_url', 400);
  }
  if (action === 'shell' && !command.trim()) {
    return jsonError('command is required for shell', 400);
  }

  try {
    const projectId =
      typeof body.project_id === 'string' ? body.project_id.trim() : undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const contractEnabled = await isComputerUseContractEnabled(workspaceRoot);
    if (!contractEnabled) {
      return jsonError('Computer use contract is not enabled for this workspace', 403);
    }

    const manifest = conversationId
      ? await readSandboxManifest(conversationId, workspaceRoot)
      : await readActiveSandboxManifest(workspaceRoot);

    if (!manifest || manifest.phase !== 'ready' || !manifest.sandboxName) {
      return jsonError(
        'Sandbox is not ready — wait for computer-use-sandbox.json phase=ready',
        409,
      );
    }

    const result = await runSandboxActionScript({
      action,
      sandboxName: manifest.sandboxName,
      url: action === 'open-url' ? url : undefined,
      command: action === 'shell' ? command : undefined,
      timeout,
      workspaceRoot,
      local: true,
    });

    const ok = result.status === 'ok';
    if (ok) {
      return jsonOk({ ok: true, action, sandbox: manifest.sandboxName, result });
    }
    return jsonError(
      typeof result.error === 'string' ? result.error : 'Sandbox action failed',
      500,
      { detail: JSON.stringify({ action, sandbox: manifest.sandboxName, result }) },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sandbox action failed';
    return jsonError(message, 500);
  }
};
