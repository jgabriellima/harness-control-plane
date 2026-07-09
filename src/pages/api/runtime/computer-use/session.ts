import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import { loadComputerUseStatus, isComputerUseContractEnabled } from '../../../../lib/runtime-computer-use-preferences';
import {
  loadComputerUseSession,
  saveComputerUseSession,
} from '../../../../lib/runtime-computer-use-sessions';
import { parseComputerUseTargetMode } from '../../../../lib/runtime-computer-use-types';
import { runSandboxPreflight } from '../../../../lib/runtime-computer-use-sandbox-preflight';
import { resolveRequestWorkspace } from '../../../../lib/workspace-request';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const GET: APIRoute = async ({ request, url }) => {
  const conversationId = url.searchParams.get('conversation_id')?.trim();
  if (!conversationId) {
    return jsonError('conversation_id is required', 400);
  }

  try {
    const projectId = url.searchParams.get('project_id')?.trim() || undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const [capability, contractEnabled, session] = await Promise.all([
      loadComputerUseStatus(workspaceRoot),
      isComputerUseContractEnabled(workspaceRoot),
      loadComputerUseSession(conversationId, workspaceRoot),
    ]);
    const sandboxPreflight = contractEnabled ? await runSandboxPreflight({ local: true }) : null;

    return jsonOk({
      conversation_id: conversationId,
      enabled: session.enabled,
      mode: session.mode,
      updated_at: session.updatedAt,
      capability_available: capability.active,
      capability_ready: capability.setup.ready,
      contract_enabled: contractEnabled,
      sandbox_available: contractEnabled,
      sandbox_preflight: sandboxPreflight,
      sandbox_ready: contractEnabled && sandboxPreflight?.ok === true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load computer-use session';
    return jsonError(message, 500);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON', 400);
  }

  if (!isRecord(body)) {
    return jsonError('Request body must be a JSON object', 400);
  }

  const conversationId =
    typeof body.conversation_id === 'string' ? body.conversation_id.trim() : '';
  if (!conversationId) {
    return jsonError('conversation_id is required', 400);
  }

  if (typeof body.enabled !== 'boolean') {
    return jsonError('enabled must be a boolean', 400);
  }

  const mode = parseComputerUseTargetMode(body.mode);

  try {
    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);

    if (body.enabled) {
      const targetMode = mode ?? 'host';
      if (targetMode === 'host') {
        const capability = await loadComputerUseStatus(workspaceRoot);
        if (!capability.active) {
          return jsonError(
            'My computer requires Computer Use setup in Settings first',
            409,
          );
        }
      } else {
        const contractEnabled = await isComputerUseContractEnabled(workspaceRoot);
        if (!contractEnabled) {
          return jsonError(
            'Sandbox mode requires runtime.computer_use in workspace business.yaml',
            409,
          );
        }
        const preflight = await runSandboxPreflight({ local: true });
        if (!preflight.ok) {
          return jsonError(preflight.summary ?? 'Sandbox pre-flight failed', 503, {
            phase: 'preflight',
            detail: JSON.stringify({ checks: preflight.checks, primaryFailureKind: preflight.primaryFailureKind }),
          });
        }
      }
    }

    const session = await saveComputerUseSession(
      conversationId,
      body.enabled,
      workspaceRoot,
      body.enabled ? (mode ?? 'host') : null,
    );
    return jsonOk({
      conversation_id: conversationId,
      enabled: session.enabled,
      mode: session.mode,
      updated_at: session.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save computer-use session';
    return jsonError(message, 500);
  }
};
