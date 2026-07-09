import type { ChatDispatchResponse, ChatRequest } from './harness-types';
import { SCHEDULE_INTERVIEW_AGENT_BRIEF } from './schedule-tips';
import { sendAgentPromptWithRelease } from './runtime-agent-run-release';
import { appendDispatchLog } from './runtime-dispatch-log';
import { isConnectUnauthenticated } from './runtime-connect-errors';
import {
  getCachedServerSdkMessageContext,
  sdkDispatchAuthMessage,
  sdkDispatchNetworkMessage,
} from './runtime-sdk-messages';
import { createRequestId, errorFields, isDebugLogLevel, runtimeLogger } from './runtime-logger';
import { registerRuntimeRun, registerRuntimeSession } from './runtime-sessions';
import {
  buildComputerUseCustomTools,
  probeComputerUseHealth,
} from './runtime-computer-use-bridge';
import { loadComputerUsePreferences, isComputerUseContractEnabled } from './runtime-computer-use-preferences';
import { probeComputerUseSetup, ensureDaemonRunning } from './runtime-computer-use-setup';
import { loadComputerUseSession, saveComputerUseSession } from './runtime-computer-use-sessions';
import { readComputerUsePreviewManifest } from './runtime-computer-use-panel-bridge';
import {
  buildComputerUsePromptInjection,
  parseComputerUseTargetMode,
  type ComputerUseTargetMode,
} from './runtime-computer-use-types';
import { buildSandboxOpenUrlRecipe, readSandboxManifest } from './runtime-computer-use-sandbox-bridge';
import { resolveControlPlaneInstallRoot } from './repo-root';
import { resolveRuntimeApiKey } from './runtime-sdk-local';

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
  const apiKey = resolveRuntimeApiKey();
  if (!apiKey) {
    throw new RuntimeGatewayError(
      'RUNTIME_API_KEY is required for runtime chat',
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

async function resolveComputerUsePreviewPromptHints(
  conversationId: string,
  targetMode: ComputerUseTargetMode | null,
  workspaceRoot?: string,
): Promise<{
  previewActive?: boolean;
  previewControlMode?: 'user' | 'agent';
  sandboxReady?: boolean;
  sandboxName?: string;
  sandboxApiPort?: number;
  sandboxVncPort?: number;
  sandboxOpenUrlRecipe?: string;
}> {
  const hints: {
    previewActive?: boolean;
    previewControlMode?: 'user' | 'agent';
    sandboxReady?: boolean;
    sandboxName?: string;
    sandboxApiPort?: number;
    sandboxVncPort?: number;
    sandboxOpenUrlRecipe?: string;
  } = {};

  const previewManifest = await readComputerUsePreviewManifest();
  if (previewManifest && typeof previewManifest === 'object') {
    const active = (previewManifest as Record<string, unknown>).active;
    if (active && typeof active === 'object') {
      const record = active as Record<string, unknown>;
      if (record.conversationId === conversationId) {
        hints.previewActive = true;
        hints.previewControlMode = record.controlMode === 'user' ? 'user' : 'agent';
      }
    }
  }

  if (targetMode === 'sandbox') {
    const sandboxManifest = await readSandboxManifest(conversationId, workspaceRoot);
    if (sandboxManifest?.phase === 'ready' && sandboxManifest.sandboxName) {
      const harnessRoot = resolveControlPlaneInstallRoot();
      hints.sandboxReady = true;
      hints.sandboxName = sandboxManifest.sandboxName;
      if (sandboxManifest.apiPort !== null) {
        hints.sandboxApiPort = sandboxManifest.apiPort;
      }
      if (sandboxManifest.vncPort !== null) {
        hints.sandboxVncPort = sandboxManifest.vncPort;
      }
      hints.sandboxOpenUrlRecipe = buildSandboxOpenUrlRecipe(sandboxManifest.sandboxName, harnessRoot);
    } else {
      hints.sandboxReady = false;
    }
  }

  return hints;
}

async function buildLocalAgentOptions(
  cwd: string,
  requestId: string,
  hostComputerUseActive: boolean,
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

  if (hostComputerUseActive && !computerUseHealthError) {
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
  const previousSession =
    conversationKey !== 'ephemeral-new-chat'
      ? await loadComputerUseSession(conversationKey, cwd)
      : null;

  let targetMode = parseComputerUseTargetMode(request.computer_use_mode);
  if (sessionEnabled && !targetMode) {
    targetMode = previousSession?.mode ?? 'host';
  }

  const computerUseModeChanged =
    Boolean(previousSession?.enabled && sessionEnabled) &&
    previousSession?.mode !== null &&
    targetMode !== null &&
    previousSession.mode !== targetMode;

  const hostComputerUseActive =
    capabilityAvailable && sessionEnabled && targetMode === 'host';
  const sandboxComputerUseActive = sessionEnabled && targetMode === 'sandbox';
  const computerUseActive = hostComputerUseActive || sandboxComputerUseActive;

  /** Host↔sandbox switch must not resume an agent that was wired for the other plane. */
  const effectiveAgentId =
    computerUseModeChanged && sessionEnabled ? undefined : request.agent_id;

  if (conversationKey !== 'ephemeral-new-chat') {
    await saveComputerUseSession(
      conversationKey,
      sessionEnabled,
      cwd,
      sessionEnabled ? targetMode : null,
    );
  }

  runtimeLogger.info('chat.sdk.dispatch.start', {
    request_id: requestId,
    phase: 'chat.sdk.dispatch',
    conversation_id: conversationKey,
    project_id: request.project_id,
    agent_id: request.agent_id,
    computer_use_enabled: sessionEnabled,
    computer_use_mode: targetMode,
    computer_use_active: computerUseActive,
    computer_use_mode_changed: computerUseModeChanged,
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
  if (hostComputerUseActive) {
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
        targetMode: targetMode ?? 'host',
        allowForegroundCursor: computerUsePreferences?.allowForegroundCursor ?? false,
        consentedAt: computerUsePreferences?.consentedAt ?? null,
        healthError: computerUseHealthError,
        ...(await resolveComputerUsePreviewPromptHints(conversationKey, targetMode ?? 'host', cwd)),
      })
    : null;

  const prompt = buildPrompt(request, computerUseLine);
  if (prompt.trim().length === 0) {
    throw new RuntimeGatewayError('message is required', 400, 'chat.sdk.dispatch', requestId);
  }

  const agentOptions = await buildLocalAgentOptions(
    cwd,
    requestId,
    hostComputerUseActive,
    computerUseHealthError,
  );
  const timeoutMs = resolveDispatchTimeoutMs();

  const dispatchRequest: ChatRequest = {
    ...request,
    agent_id: effectiveAgentId,
  };

  const { agent, resumed } = await withDispatchTimeout(
    resolveAgent(dispatchRequest, agentOptions, requestId, cwd, conversationKey),
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

  const messageContext = getCachedServerSdkMessageContext();

  if (isConnectUnauthenticated(error) || lower.includes('invalid api key')) {
    return new RuntimeGatewayError(
      sdkDispatchAuthMessage(messageContext),
      503,
      phase,
      requestId,
    );
  }

  if (lower.includes('network request failed') || error instanceof Error && error.name === 'NetworkError') {
    return new RuntimeGatewayError(
      sdkDispatchNetworkMessage(messageContext),
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
