import type { ChatDispatchResponse, ChatRequest } from './harness-types';
import { getCursorLocalAdapter } from './runtime-adapters/cursor-local';
import type { NormalizedMessage, SessionRefs } from './runtime-adapters/types';
import { deriveAndUpdateSessionTitle } from './conversation-store';
import {
  dispatchChatToRuntime,
  gatewayErrorDetail,
  mapDispatchError,
  RuntimeGatewayError,
} from './runtime-gateway';
import { appendDispatchLog } from './runtime-dispatch-log';
import { startRunHubFanout } from './runtime-hub-stream';
import { appendRunStarted } from './runtime-run-registry';
import { bindSession, readLatestBindings } from './runtime-session-registry';
import { resolveHarnessRoot } from './app-root';
import { createRequestId, errorFields, runtimeLogger } from './runtime-logger';
import { runWithWorkspaceCwdAsync, workspaceCwd } from './runtime-sessions';

export { RuntimeGatewayError };

export async function orchestrateChatDispatch(
  request: ChatRequest,
  workspaceRoot: string,
  requestId: string = createRequestId('chat'),
): Promise<ChatDispatchResponse> {
  const cwd = resolveHarnessRoot(workspaceRoot);
  const conversationKey = request.conversation_id?.trim() || 'ephemeral-new-chat';
  const startedAt = Date.now();

  runtimeLogger.debug('chat.orchestrate.start', {
    request_id: requestId,
    phase: 'chat.orchestrate',
    conversation_id: conversationKey,
    project_id: request.project_id,
    cwd,
  });

  let result: ChatDispatchResponse;

  try {
    result = await runWithWorkspaceCwdAsync(cwd, async () =>
      dispatchChatToRuntime(request, cwd, requestId),
    );
  } catch (error) {
    const mapped = mapDispatchError(error, requestId);
    runtimeLogger.error('chat.sdk.dispatch.error', {
      request_id: requestId,
      phase: mapped.phase,
      conversation_id: conversationKey,
      project_id: request.project_id,
      cwd,
      duration_ms: Date.now() - startedAt,
      ...errorFields(error),
    });
    void appendDispatchLog(
      {
        event: 'chat.sdk.dispatch.error',
        request_id: requestId,
        phase: mapped.phase,
        conversation_id: conversationKey,
        project_id: request.project_id,
        cwd,
        duration_ms: Date.now() - startedAt,
        status_code: mapped.statusCode,
        error_name: mapped.name,
        error_message: mapped.message,
      },
      cwd,
    );
    throw mapped;
  }

  startRunHubFanout(result.run_id, result.agent_id, conversationKey, cwd, requestId);

  void appendRunStarted({
    runId: result.run_id,
    conversationId: conversationKey,
    agentId: result.agent_id,
    workspaceRoot: cwd,
  }).catch((error) => {
    runtimeLogger.warn('chat.registry.started.error', {
      request_id: requestId,
      run_id: result.run_id,
      ...errorFields(error),
    });
  });

  if (request.conversation_id) {
    void (async () => {
      try {
        await bindSession({
          harnessConversationId: request.conversation_id!,
          vendorAgentId: result.agent_id,
          workspaceRoot: cwd,
        });

        await deriveAndUpdateSessionTitle(
          workspaceRoot,
          request.conversation_id!,
          request.message,
          result.agent_id,
        );

        runtimeLogger.debug('chat.session.bind.ok', {
          request_id: requestId,
          conversation_id: conversationKey,
          agent_id: result.agent_id,
        });
      } catch (error) {
        runtimeLogger.warn('chat.session.bind.error', {
          request_id: requestId,
          conversation_id: conversationKey,
          ...errorFields(error),
        });
      }
    })();
  }

  runtimeLogger.info('chat.orchestrate.ok', {
    request_id: requestId,
    run_id: result.run_id,
    agent_id: result.agent_id,
    conversation_id: conversationKey,
    duration_ms: Date.now() - startedAt,
  });

  return result;
}

export async function resolveConversationRefs(
  workspaceRoot: string,
  harnessConversationId: string,
  vendorAgentId: string,
): Promise<SessionRefs> {
  const adapter = getCursorLocalAdapter();
  const cwd = resolveHarnessRoot(workspaceRoot);
  return adapter.resolveSessionRefs(vendorAgentId, cwd);
}

export async function loadConversationMessages(
  workspaceRoot: string,
  harnessConversationId: string,
  vendorAgentId: string,
): Promise<NormalizedMessage[]> {
  const adapter = getCursorLocalAdapter();
  const refs = await resolveConversationRefs(workspaceRoot, harnessConversationId, vendorAgentId);
  const transcript = await adapter.getTranscript(vendorAgentId, refs);
  return transcript.messages;
}

export async function lookupBoundAgentId(
  workspaceRoot: string,
  harnessConversationId: string,
): Promise<string | null> {
  const cwd = resolveHarnessRoot(workspaceRoot);
  const bindings = await readLatestBindings(cwd);
  const event = bindings.get(harnessConversationId);
  return event?.vendorAgentId ?? null;
}

export { workspaceCwd, gatewayErrorDetail };
