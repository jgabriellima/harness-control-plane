import type { APIRoute } from 'astro';

import * as Sentry from '@sentry/astro';

import { jsonError, jsonOk } from '../../lib/api-json';
import { isKnownSlashCommand, listHarnessCommands } from '../../lib/harness-commands';
import type { ChatRequest } from '../../lib/harness-types';
import { appendDispatchLog } from '../../lib/runtime-dispatch-log';
import { createRequestId, errorFields, isDebugLogLevel, runtimeLogger } from '../../lib/runtime-logger';
import { gatewayErrorDetail, RuntimeGatewayError, orchestrateChatDispatch } from '../../lib/runtime-orchestrator';
import { resolveRequestWorkspace } from '../../lib/workspace-request';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseChatRequest(body: unknown): ChatRequest {
  if (!isRecord(body)) {
    throw new RuntimeGatewayError('Request body must be a JSON object', 400, 'chat.request.parse', createRequestId());
  }

  const projectId = asString(body.project_id);
  const message = asString(body.message);

  if (!projectId) {
    throw new RuntimeGatewayError('project_id is required', 400, 'chat.request.parse', createRequestId());
  }
  if (!message) {
    throw new RuntimeGatewayError('message is required', 400, 'chat.request.parse', createRequestId());
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
  const requestId = createRequestId('chat');
  const startedAt = Date.now();

  return Sentry.startSpan({ name: 'POST /api/chat', op: 'http.server' }, async () => {
    runtimeLogger.info('chat.request.received', {
      request_id: requestId,
      phase: 'chat.request',
    });

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonError('Request body must be valid JSON', 400, {
        request_id: requestId,
        phase: 'chat.request.parse',
      });
    }

    try {
      const chatRequest = parseChatRequest(body);

      runtimeLogger.debug('chat.request.parsed', {
        request_id: requestId,
        phase: 'chat.request.parse',
        project_id: chatRequest.project_id,
        conversation_id: chatRequest.conversation_id,
        agent_id: chatRequest.agent_id,
      });

      const { workspaceRoot } = await resolveRequestWorkspace(request, chatRequest.project_id);

      runtimeLogger.debug('chat.workspace.resolved', {
        request_id: requestId,
        phase: 'chat.workspace.resolve',
        project_id: chatRequest.project_id,
        cwd: workspaceRoot,
      });

      void appendDispatchLog(
        {
          event: 'chat.workspace.resolved',
          request_id: requestId,
          phase: 'chat.workspace.resolve',
          project_id: chatRequest.project_id,
          conversation_id: chatRequest.conversation_id,
          cwd: workspaceRoot,
        },
        workspaceRoot,
      );

      const commands = await listHarnessCommands(workspaceRoot);
      const knownCommands = commands.map((item) => item.command);

      runtimeLogger.debug('chat.commands.loaded', {
        request_id: requestId,
        phase: 'chat.commands.load',
        command_count: knownCommands.length,
      });

      if (!isKnownSlashCommand(chatRequest.message, knownCommands)) {
        return jsonError(
          'Unknown slash command. Commands are loaded from the harness on each request.',
          400,
          { request_id: requestId, phase: 'chat.commands.validate' },
        );
      }

      const result = await orchestrateChatDispatch(chatRequest, workspaceRoot, requestId);

      runtimeLogger.info('chat.response.ok', {
        request_id: requestId,
        run_id: result.run_id,
        agent_id: result.agent_id,
        duration_ms: Date.now() - startedAt,
      });

      void appendDispatchLog(
        {
          event: 'chat.response.ok',
          request_id: requestId,
          run_id: result.run_id,
          agent_id: result.agent_id,
          conversation_id: result.conversation_id,
          project_id: chatRequest.project_id,
          duration_ms: Date.now() - startedAt,
        },
        workspaceRoot,
      );

      return jsonOk({ ...result, request_id: requestId });
    } catch (error) {
      Sentry.captureException(error);

      const mapped =
        error instanceof RuntimeGatewayError
          ? error
          : new RuntimeGatewayError(
              error instanceof Error ? error.message : 'Failed to dispatch chat to runtime',
              500,
              'chat.dispatch',
              requestId,
            );

      runtimeLogger.error('chat.response.error', {
        request_id: requestId,
        phase: mapped.phase,
        duration_ms: Date.now() - startedAt,
        status_code: mapped.statusCode,
        ...errorFields(error),
      });

      void appendDispatchLog({
        event: 'chat.response.error',
        request_id: requestId,
        phase: mapped.phase,
        duration_ms: Date.now() - startedAt,
        status_code: mapped.statusCode,
        error_name: mapped.name,
        error_message: mapped.message,
      });

      return jsonError(mapped.message, mapped.statusCode as 400 | 500 | 503 | 504, {
        request_id: requestId,
        phase: mapped.phase,
        detail: gatewayErrorDetail(mapped) ?? (isDebugLogLevel() && error instanceof Error ? error.stack?.split('\n').slice(0, 4).join('\n') : undefined),
      });
    }
  });
};
