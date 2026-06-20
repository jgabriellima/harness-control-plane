import type { APIRoute } from 'astro';

import * as Sentry from '@sentry/astro';

import { jsonError, jsonOk } from '../../lib/api-json';
import { isKnownSlashCommand, listHarnessCommands } from '../../lib/harness-commands';
import type { ChatRequest } from '../../lib/harness-types';
import { RuntimeGatewayError, orchestrateChatDispatch } from '../../lib/runtime-orchestrator';
import { resolveRequestWorkspace } from '../../lib/workspace-request';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseChatRequest(body: unknown): ChatRequest {
  if (!isRecord(body)) {
    throw new RuntimeGatewayError('Request body must be a JSON object', 400);
  }

  const projectId = asString(body.project_id);
  const message = asString(body.message);

  if (!projectId) {
    throw new RuntimeGatewayError('project_id is required', 400);
  }
  if (!message) {
    throw new RuntimeGatewayError('message is required', 400);
  }

  const modeRaw = asString(body.mode);
  const mode = modeRaw === 'deep_research' ? 'deep_research' : 'default';

  const integrationSlots = Array.isArray(body.integration_slots)
    ? body.integration_slots.filter((item): item is string => typeof item === 'string')
    : undefined;

  const attachments = Array.isArray(body.attachments)
    ? body.attachments
        .filter(isRecord)
        .map((item) => ({
          name: asString(item.name) ?? 'attachment',
          path: asString(item.path),
          content_type: asString(item.content_type),
        }))
    : undefined;

  return {
    conversation_id: asString(body.conversation_id),
    project_id: projectId,
    message,
    attachments,
    mode,
    integration_slots: integrationSlots,
    agent_id: asString(body.agent_id),
    metadata: isRecord(body.metadata) ? body.metadata : undefined,
  };
}

export const POST: APIRoute = async ({ request }) => {
  return Sentry.startSpan({ name: 'POST /api/chat', op: 'http.server' }, async () => {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonError('Request body must be valid JSON', 400);
    }

    try {
      const chatRequest = parseChatRequest(body);
      const { workspaceRoot } = await resolveRequestWorkspace(request, chatRequest.project_id);
      const commands = await listHarnessCommands(workspaceRoot);
      const knownCommands = commands.map((item) => item.command);

      if (!isKnownSlashCommand(chatRequest.message, knownCommands)) {
        return jsonError('Unknown slash command. Commands are loaded from the harness on each request.', 400);
      }

      const result = await orchestrateChatDispatch(chatRequest, workspaceRoot);
      return jsonOk(result);
    } catch (error) {
      Sentry.captureException(error);

      if (error instanceof RuntimeGatewayError) {
        return jsonError(error.message, error.statusCode);
      }

      const message = error instanceof Error ? error.message : 'Failed to dispatch chat to runtime';
      return jsonError(message, 500);
    }
  });
};
