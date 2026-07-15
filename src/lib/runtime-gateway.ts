import type { ChatDispatchResponse, ChatRequest } from './harness-types';
import { SCHEDULE_INTERVIEW_AGENT_BRIEF } from './schedule-tips';
import { wrapPromptInject } from './prompt-inject';
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
import {
  buildComposioMcpServers,
  composioMcpServersForSdk,
  connectedComposioSlots,
  type ComposioMcpServerBinding,
} from './composio-mcp-bridge';
import {
  buildIntegrationBaselineContract,
  buildIntegrationSlotContext,
} from './integration-prompt';
import { loadComputerUsePreferences, isComputerUseContractEnabled } from './runtime-computer-use-preferences';
import { probeComputerUseSetup, ensureDaemonRunning } from './runtime-computer-use-setup';
import { loadComputerUseSession, saveComputerUseSession } from './runtime-computer-use-sessions';
import { readComputerUsePreviewManifest } from './runtime-computer-use-panel-bridge';
import {
  buildComputerUsePromptInjection,
  parseComputerUseTargetMode,
  type ComputerUseTargetMode,
} from './runtime-computer-use-types';
import {
  buildSandboxOpenUrlRecipe,
  ensureSandboxVncStream,
  normalizeProjectId,
  resolveSandboxManifestForProject,
} from './runtime-computer-use-sandbox-bridge';
import { buildSandboxCustomTools } from './runtime-computer-use-sandbox-tools';
import { resolveControlPlaneInstallRoot, resolvePlatformAppRoot } from './repo-root';
import { resolveRuntimeApiKey, ensureRuntimeApiKeyInProcessEnv } from './runtime-sdk-local';
import { resolveLocalAgentStore } from './runtime-sdk-config';
import { canAttemptRuntimeSdkCall } from './runtime-sdk-auth-gate';
import { invalidateSdkProbeCache, probeSdkDispatchHealth } from './runtime-sdk-probe';
import { buildPresentationPromptSection } from './openui-prompt';
import {
  parsePresentationDefaultFromUiConfig,
  resolvePresentation,
  stripPresentationPrefixes,
} from './presentation-policy';
import type { ResolvedPresentation } from './presentation-types';
import { setRunContext } from './runtime-run-context';
import { loadUIConfig } from './ui-config';
import {
  readWorkspacePresentation,
  toPresentationConfig,
} from './workspace-presentation';

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

function buildPrompt(
  request: ChatRequest,
  computerUseLine: string | null,
  presentation: ResolvedPresentation,
  composioBindings?: Record<string, ComposioMcpServerBinding>,
): string {
  const injections: string[] = [];

  if (computerUseLine) {
    injections.push(wrapPromptInject('computer_use', computerUseLine));
  }

  if (request.mode === 'deep_research') {
    injections.push(wrapPromptInject('deep_research', 'enabled'));
  }

  if (request.metadata?.schedule_interview === true) {
    injections.push(wrapPromptInject('schedule_interview', SCHEDULE_INTERVIEW_AGENT_BRIEF));
  }

  const presentationPrompt = buildPresentationPromptSection(presentation.promptVariant);
  if (presentationPrompt) {
    injections.push(presentationPrompt);
  }

  const userBody = stripPresentationPrefixes(request.message).trim();

  const integrationContract =
    request.integration_slots && request.integration_slots.length > 0
      ? buildIntegrationSlotContext(request.integration_slots, composioBindings)
      : buildIntegrationBaselineContract();
  injections.push(wrapPromptInject('integrations', integrationContract));

  if (request.attachments && request.attachments.length > 0) {
    const attachmentList = request.attachments
      .map((item) => item.path ?? item.name)
      .join(', ');
    injections.push(wrapPromptInject('attachments', attachmentList));
  }

  if (userBody.length > 0) {
    injections.push(userBody);
  }

  return injections.join('\n\n');
}

function resolveRuntimeModelId(): string {
  const configured = process.env.CURSOR_RUNTIME_MODEL?.trim();
  return configured && configured.length > 0 ? configured : 'composer-2.5';
}

async function resolveComputerUsePreviewPromptHints(
  conversationId: string,
  targetMode: ComputerUseTargetMode | null,
  workspaceRoot?: string,
  projectId?: string,
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

  const previewManifest = workspaceRoot
    ? await readComputerUsePreviewManifest(workspaceRoot)
    : null;
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

  if (targetMode === 'sandbox' && workspaceRoot) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const sandboxManifest = await resolveSandboxManifestForProject(
      normalizedProjectId,
      workspaceRoot,
    );
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
  sandboxComputerUseActive: boolean,
  computerUseHealthError: string | null,
  integrationSlots: string[] = [],
  projectId?: string,
) {
  const local: {
    cwd: string;
    settingSources: readonly [];
    sandboxOptions?: { enabled: boolean };
    customTools?: Record<string, import('@cursor/sdk').SDKCustomTool>;
    autoReview?: boolean;
    store?: Awaited<ReturnType<typeof resolveLocalAgentStore>>;
  } = {
    cwd,
    settingSources: [] as const,
  };

  if (hostComputerUseActive && !computerUseHealthError) {
    local.sandboxOptions = { enabled: false };
    local.customTools = await buildComputerUseCustomTools();
  } else if (sandboxComputerUseActive) {
    local.sandboxOptions = { enabled: false };
    local.customTools = buildSandboxCustomTools({
      workspaceRoot: cwd,
      projectId: normalizeProjectId(projectId),
    });
    runtimeLogger.info('chat.computer_use.sandbox_tools.injected', {
      request_id: requestId,
      phase: 'chat.sdk.dispatch',
      cwd,
      project_id: normalizeProjectId(projectId),
      tools: Object.keys(local.customTools),
    });
  }

  const composioBindings = await buildComposioMcpServers({
    workspaceRoot: cwd,
    integrationSlots,
    projectId: projectId?.trim() || 'default',
  });
  const composioMcp = composioMcpServersForSdk(composioBindings);
  const composioActive = Boolean(composioMcp && Object.keys(composioMcp).length > 0);

  if (composioActive) {
    // OAuth in Settings is the trust boundary for Composio. Disable sandbox and do NOT
    // enable autoReview — the embed has no Smart Mode approval UI, so the classifier
    // would block MCP calls with no way for the operator to approve.
    local.sandboxOptions = { enabled: false };
    runtimeLogger.info('chat.composio.mcp.injected', {
      request_id: requestId,
      phase: 'chat.sdk.dispatch',
      cwd,
      project_id: projectId,
      integration_slots: integrationSlots,
      mcp_servers: Object.keys(composioMcp ?? {}),
    });
  } else if (integrationSlots.length > 0) {
    const connected = await connectedComposioSlots(integrationSlots, projectId?.trim() || 'default');
    if (connected.length > 0) {
      throw new RuntimeGatewayError(
        'Selected integrations are connected in Settings but Composio MCP failed to initialize. Verify COMPOSIO_API_KEY and retry.',
        503,
        'chat.composio.mcp',
        requestId,
      );
    }
  }

  const store = await resolveLocalAgentStore(cwd);
  if (store) {
    local.store = store;
  }

  return {
    agentOptions: {
      apiKey: requireApiKey(requestId),
      model: { id: resolveRuntimeModelId() },
      local,
      ...(composioMcp ? { mcpServers: composioMcp } : {}),
    },
    composioBindings,
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

import type { AgentOptions } from '@cursor/sdk';

async function resolveAgent(
  request: ChatRequest,
  agentOptions: AgentOptions,
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

  requireApiKey(requestId);
  ensureRuntimeApiKeyInProcessEnv();

  if (!canAttemptRuntimeSdkCall()) {
    invalidateSdkProbeCache(cwd);
    const health = await probeSdkDispatchHealth({
      cacheKey: cwd,
      force: true,
      workspaceCwd: cwd,
      probeLocalExecution: true,
    });
    if (!health.ready) {
      throw new RuntimeGatewayError(
        health.message ?? sdkDispatchAuthMessage(getCachedServerSdkMessageContext()),
        503,
        'chat.auth.reconcile',
        requestId,
      );
    }
  }

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

  if (sandboxComputerUseActive) {
    await ensureSandboxVncStream({
      projectId: normalizeProjectId(request.project_id),
      conversationId: conversationKey,
      workspaceRoot: cwd,
    });
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
        ...(await resolveComputerUsePreviewPromptHints(
          conversationKey,
          targetMode ?? 'host',
          cwd,
          request.project_id,
        )),
      })
    : null;

  const workspacePresentation = toPresentationConfig(await readWorkspacePresentation(cwd));
  const uiConfig = await loadUIConfig(resolvePlatformAppRoot());
  const dslDefault = parsePresentationDefaultFromUiConfig(uiConfig);
  const presentation = resolvePresentation(request, workspacePresentation, dslDefault);

  const { agentOptions, composioBindings } = await buildLocalAgentOptions(
    cwd,
    requestId,
    hostComputerUseActive,
    sandboxComputerUseActive,
    computerUseHealthError,
    request.integration_slots ?? [],
    request.project_id,
  );

  const prompt = buildPrompt(request, computerUseLine, presentation, composioBindings);
  if (prompt.trim().length === 0) {
    throw new RuntimeGatewayError('message is required', 400, 'chat.sdk.dispatch', requestId);
  }

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
  setRunContext(runId, {
    wireMode: presentation.wireMode,
    promptVariant: presentation.promptVariant,
    surfaceId: `openui-${runId}`,
    requestId,
  });

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
