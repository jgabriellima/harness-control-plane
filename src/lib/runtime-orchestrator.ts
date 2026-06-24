import type { ChatDispatchResponse, ChatRequest } from './harness-types';
import { getCursorLocalAdapter } from './runtime-adapters/cursor-local';
import type { NormalizedMessage, SessionRefs } from './runtime-adapters/types';
import { deriveAndUpdateSessionTitle } from './conversation-store';
import { dispatchChatToRuntime, RuntimeGatewayError } from './runtime-gateway';
import { startRunHubFanout } from './runtime-hub-stream';
import { appendRunStarted } from './runtime-run-registry';
import { bindSession, readLatestBindings } from './runtime-session-registry';
import { resolveHarnessRoot } from './app-root';
import { runWithWorkspaceCwdAsync, workspaceCwd } from './runtime-sessions';

export { RuntimeGatewayError };

export async function orchestrateChatDispatch(
  request: ChatRequest,
  workspaceRoot: string,
): Promise<ChatDispatchResponse> {
  const cwd = resolveHarnessRoot(workspaceRoot);
  const conversationKey = request.conversation_id?.trim() || 'ephemeral-new-chat';

  const result = await runWithWorkspaceCwdAsync(cwd, async () =>
    dispatchChatToRuntime(request, cwd),
  );

  startRunHubFanout(result.run_id, result.agent_id, conversationKey);

  try {
    await appendRunStarted({
      runId: result.run_id,
      conversationId: conversationKey,
      agentId: result.agent_id,
    });
  } catch {
    // Registry append is best-effort; in-memory fanout still streams to connected clients.
  }

  if (request.conversation_id) {
    await bindSession({
      harnessConversationId: request.conversation_id,
      vendorAgentId: result.agent_id,
      workspaceRoot: cwd,
    });

    await deriveAndUpdateSessionTitle(
      workspaceRoot,
      request.conversation_id,
      request.message,
      result.agent_id,
    );
  }

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

export { workspaceCwd };
