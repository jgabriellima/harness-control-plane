import type { ChatDispatchResponse, ChatRequest } from './harness-types';
import { registerRuntimeRun, registerRuntimeSession } from './runtime-sessions';

export class RuntimeGatewayError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'RuntimeGatewayError';
    this.statusCode = statusCode;
  }
}

function requireApiKey(): string {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new RuntimeGatewayError('CURSOR_API_KEY is required for runtime chat', 503);
  }
  return apiKey;
}

function buildPrompt(request: ChatRequest): string {
  const sections: string[] = [request.message.trim()];

  if (request.mode === 'deep_research') {
    sections.unshift('[mode: deep_research]');
  }

  if (request.integration_slots && request.integration_slots.length > 0) {
    sections.push(`[active_integrations: ${request.integration_slots.join(', ')}]`);
  }

  if (request.attachments && request.attachments.length > 0) {
    const attachmentList = request.attachments
      .map((item) => item.path ?? item.name)
      .join(', ');
    sections.push(`[attachments: ${attachmentList}]`);
  }

  return sections.join('\n\n');
}

function resolveRuntimeModelId(): string {
  const configured = process.env.CURSOR_RUNTIME_MODEL?.trim();
  return configured && configured.length > 0 ? configured : 'composer-2.5';
}

function buildLocalAgentOptions(cwd: string) {
  return {
    apiKey: requireApiKey(),
    model: { id: resolveRuntimeModelId() },
    local: { cwd, settingSources: [] as const },
  };
}

/**
 * Dispatches a chat turn to the local Cursor SDK runtime.
 * UI -> Gateway -> Runtime (SDK) -> filesystem workspace.
 */
export async function dispatchChatToRuntime(
  request: ChatRequest,
  cwd: string,
): Promise<ChatDispatchResponse> {
  requireApiKey();

  const prompt = buildPrompt(request);
  if (prompt.trim().length === 0) {
    throw new RuntimeGatewayError('message is required', 400);
  }

  const { Agent } = await import('@cursor/sdk');

  const agentOptions = buildLocalAgentOptions(cwd);

  const agent = request.agent_id
    ? await Agent.resume(request.agent_id, agentOptions)
    : await Agent.create(agentOptions);

  registerRuntimeSession(agent.agentId, async () => {
    await agent[Symbol.asyncDispose]();
  });

  const run = await agent.send(prompt);
  const runId = run.id;
  const agentId = agent.agentId;

  registerRuntimeRun(runId, run);

  return {
    run_id: runId,
    agent_id: agentId,
    stream_url: `/api/runtime/stream?run_id=${encodeURIComponent(runId)}&agent_id=${encodeURIComponent(agentId)}`,
  };
}
