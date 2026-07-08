import type { ChatDispatchResponse, ChatRequest } from './harness-types';
import { SCHEDULE_INTERVIEW_AGENT_BRIEF } from './schedule-tips';
import { sendAgentPromptWithRelease } from './runtime-agent-run-release';
import { appendDispatchLog } from './runtime-dispatch-log';
import { isConnectUnauthenticated } from './runtime-connect-errors';
import { createRequestId, errorFields, isDebugLogLevel, runtimeLogger } from './runtime-logger';
import { registerRuntimeRun, registerRuntimeSession } from './runtime-sessions';
import {
  buildComputerUseCustomTools,
  probeComputerUseHealth,
} from './runtime-computer-use-bridge';
import { loadComputerUsePreferences, isComputerUseContractEnabled } from './runtime-computer-use-preferences';
import { probeComputerUseSetup, ensureDaemonRunning } from './runtime-computer-use-setup';
import { saveComputerUseSession } from './runtime-computer-use-sessions';

export class RuntimeGatewayError extends Error {
  readonly statusCode: number;
  readonly phase: string;
  readonly requestId: string;

  constructor(message: string, statusCode: number, phase: string, requestId: string) {
    super(message);
    this.name = 'RuntimeGatewayError';
    this.statusCode = statusCode;
    this.phase = phase;
    this.requestId = requestId;
  }
}

function resolveDispatchTimeoutMs(): number {
  const raw = process.env.CONTROL_PLANE_DISPATCH_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 120_000;
}

function requireApiKey(requestId: string): string {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new RuntimeGatewayError(
      'CURSOR_API_KEY is required for runtime chat',
      503,
      'chat.auth',
      requestId,
    );
  }
  return apiKey;
}

function buildPrompt(request: ChatRequest, computerUseLine: string | null): string {
  const sections: string[] = [];

  if (request.metadata?.schedule_interview === true) {
    sections.push(SCHEDULE_INTERVIEW_AGENT_BRIEF);
  }

  sections.push(request.message.trim());

  if (request.mode === 'deep_research') {
    sections.unshift('[mode: deep_research]');
  }

  if (computerUseLine) {
    sections.unshift(computerUseLine);
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

async function buildLocalAgentOptions(
  cwd: string,
  requestId: string,
  computerUseActive: boolean,
  computerUseHealthError: string | null,
) {
  const local: {
    cwd: string;
    settingSources: readonly [];
    sandboxOptions?: { enabled: boolean };
    customTools?: Awaited<ReturnType<typeof buildComputerUseCustomTools>>;
  } = {
    cwd,
    settingSources: [] as const,
  };

  if (computerUseActive && !computerUseHealthError) {
    local.sandboxOptions = { enabled: false };
    local.customTools = await buildComputerUseCustomTools();
  }

  return {
    apiKey: requireApiKey(requestId),
    model: { id: resolveRuntimeModelId() },
    local,
  };
}

function isStaleAgentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found/i.test(message) || /unknown agent/i.test(message);
}

async function withDispatchTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  requestId: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new RuntimeGatewayError(
              `Runtime dispatch timed out after ${timeoutMs}ms — check Cursor local agent availability`,
              504,
              'chat.sdk.dispatch',
              requestId,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    // Prevent late Connect RPC rejections from surfacing as unhandled after race settles.
    void promise.catch(() => undefined);
  }
}

async function resolveAgent(
  request: ChatRequest,
  agentOptions: Awaited<ReturnType<typeof buildLocalAgentOptions>>,
  requestId: string,
  cwd: string,
  conversationKey: string,
): Promise<{ agent: Awaited<ReturnType<typeof import('@cursor/sdk')['Agent']['create']>>; resumed: boolean }> {
  const { Agent } = await import('@cursor/sdk');

  if (!request.agent_id) {
    return { agent: await Agent.create(agentOptions), resumed: false };
  }

  try {
    const agent = await Agent.resume(request.agent_id, agentOptions);
    return { agent, resumed: true };
  } catch (error) {
    if (!isStaleAgentError(error)) {
      throw error;
    }

    runtimeLogger.warn('chat.agent.resume_stale', {
      request_id: requestId,
      phase: 'chat.sdk.dispatch',
      agent_id: request.agent_id,
      conversation_id: conversationKey,
      cwd,
      ...errorFields(error),
    });

    void appendDispatchLog(
      {
        event: 'chat.agent.resume_stale',
        request_id: requestId,
        phase: 'chat.sdk.dispatch',
        agent_id: request.agent_id,
        conversation_id: conversationKey,
        cwd,
        detail: error instanceof Error ? error.message : String(error),
      },
      cwd,
    );

    return { agent: await Agent.create(agentOptions), resumed: false };
  }
}

/**
 * Dispatches a chat turn to the local Cursor SDK runtime.
 * UI -> Gateway -> Runtime (SDK) -> filesystem workspace.
 */
export async function dispatchChatToRuntime(
  request: ChatRequest,
  cwd: string,
  requestId: string = createRequestId('chat'),
): Promise<ChatDispatchResponse> {
  const conversationKey = request.conversation_id?.trim() || 'ephemeral-new-chat';
  const startedAt = Date.now();

  const contractEnabled = await isComputerUseContractEnabled(cwd);
  const computerUsePreferences = contractEnabled ? await loadComputerUsePreferences(cwd) : null;
  const setup = contractEnabled ? await probeComputerUseSetup(cwd) : null;
  const capabilityAvailable = Boolean(
    contractEnabled && computerUsePreferences?.hostControlEnabled && setup?.ready,
  );
  const sessionEnabled = request.computer_use_enabled === true;
  const computerUseActive = capabilityAvailable && sessionEnabled;

  if (conversationKey !== 'ephemeral-new-chat') {
    await saveComputerUseSession(conversationKey, sessionEnabled, cwd);
  }

  runtimeLogger.info('chat.sdk.dispatch.start', {
    request_id: requestId,
    phase: 'chat.sdk.dispatch',
    conversation_id: conversationKey,
    project_id: request.project_id,
    agent_id: request.agent_id,
    computer_use_enabled: sessionEnabled,
    computer_use_active: computerUseActive,
    cwd,
  });

  void appendDispatchLog(
    {
      event: 'chat.sdk.dispatch.start',
      request_id: requestId,
      phase: 'chat.sdk.dispatch',
      conversation_id: conversationKey,
      project_id: request.project_id,
      agent_id: request.agent_id,
      cwd,
    },
    cwd,
  );

  let computerUseHealthError: string | null = null;
  if (computerUseActive) {
    await ensureDaemonRunning();
    const health = await probeComputerUseHealth();
    if (!health.ok) {
      computerUseHealthError = health.error ?? 'daemon health probe failed';
      runtimeLogger.warn('chat.computer_use.health_failed', {
        request_id: requestId,
        phase: 'chat.sdk.dispatch',
        latency_ms: health.latencyMs,
        error: computerUseHealthError,
      });
    }
  }

  const computerUseLine = contractEnabled
    ? buildComputerUsePromptInjection({
        capabilityAvailable,
        sessionEnabled,
        allowForegroundCursor: computerUsePreferences?.allowForegroundCursor ?? false,
        consentedAt: computerUsePreferences?.consentedAt ?? null,
        healthError: computerUseHealthError,
      })
    : null;

  const prompt = buildPrompt(request, computerUseLine);
  if (prompt.trim().length === 0) {
    throw new RuntimeGatewayError('message is required', 400, 'chat.sdk.dispatch', requestId);
  }

  const agentOptions = await buildLocalAgentOptions(
    cwd,
    requestId,
    computerUseActive,
    computerUseHealthError,
  );
  const timeoutMs = resolveDispatchTimeoutMs();

  const { agent, resumed } = await withDispatchTimeout(
    resolveAgent(request, agentOptions, requestId, cwd, conversationKey),
    timeoutMs,
    requestId,
  );

  registerRuntimeSession(agent.agentId, async () => {
    await agent[Symbol.asyncDispose]();
  });

  const run = await sendAgentPromptWithRelease({
    agent,
    prompt,
    conversationId: conversationKey,
    workspaceRoot: cwd,
    requestId,
    timeoutMs,
    withTimeout: withDispatchTimeout,
  });
  const runId = run.id;
  const agentId = agent.agentId;
  const durationMs = Date.now() - startedAt;

  registerRuntimeRun(runId, run, conversationKey, agentId);

  runtimeLogger.info('chat.sdk.dispatch.ok', {
    request_id: requestId,
    phase: 'chat.sdk.dispatch',
    run_id: runId,
    agent_id: agentId,
    conversation_id: conversationKey,
    cwd,
    duration_ms: durationMs,
    resumed,
  });

  void appendDispatchLog(
    {
      event: 'chat.sdk.dispatch.ok',
      request_id: requestId,
      phase: 'chat.sdk.dispatch',
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationKey,
      project_id: request.project_id,
      cwd,
      duration_ms: durationMs,
      detail: resumed ? 'resumed' : 'created',
    },
    cwd,
  );

  return {
    run_id: runId,
    agent_id: agentId,
    conversation_id: conversationKey,
    stream_url: `/api/runtime/stream?run_id=${encodeURIComponent(runId)}&agent_id=${encodeURIComponent(agentId)}`,
    request_id: requestId,
  };
}

export function mapDispatchError(
  error: unknown,
  requestId: string,
  phase = 'chat.sdk.dispatch',
): RuntimeGatewayError {
  if (error instanceof RuntimeGatewayError) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'Failed to dispatch chat to runtime';
  const lower = message.toLowerCase();

  if (isConnectUnauthenticated(error) || lower.includes('invalid api key')) {
    return new RuntimeGatewayError(
      `${message} — verifique CURSOR_API_KEY em harness-control-plane/.env`,
      503,
      phase,
      requestId,
    );
  }

  if (lower.includes('network request failed') || error instanceof Error && error.name === 'NetworkError') {
    return new RuntimeGatewayError(
      'Sem conexão com a API Cursor — a verificação de sessão deveria ter bloqueado o envio; tente "Verificar novamente" no banner amarelo',
      503,
      phase,
      requestId,
    );
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return new RuntimeGatewayError(message, 504, phase, requestId);
  }

  if (lower.includes('already has active run')) {
    return new RuntimeGatewayError(
      'O runtime ainda tinha uma execução ativa para este agente. Tente enviar novamente — runs obsoletas são liberadas automaticamente.',
      409,
      phase,
      requestId,
    );
  }

  return new RuntimeGatewayError(message, 500, phase, requestId);
}

export function gatewayErrorDetail(error: RuntimeGatewayError): string | undefined {
  if (!isDebugLogLevel()) {
    return undefined;
  }
  return `${error.phase} (${error.requestId})`;
}
