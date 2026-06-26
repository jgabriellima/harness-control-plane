'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { isUnknownSlashCommand } from '@/lib/slash-command';
import { subscribeRuntimeHubStream } from '@/lib/sse-client';
import {
  applyHubEvent,
  createConversationState,
  countStreamingConversations,
} from '@/lib/runtime-hub-store';
import {
  applyActiveRunToConversationState,
  attachActiveRunStream,
  fetchActiveRunsIndex,
  findActiveRunForConversation,
  purgeStaleActiveRun,
  resolveTurnTrackingForActiveRun,
} from '@/lib/active-run-sync';
import { mapHydratedMessages } from '@/lib/chat-message-mapper';
import { DRAFT_CONVERSATION_ID, isDraftConversationId } from '@/lib/draft-conversation';
import { DEFAULT_WORKSPACE_ID } from '@/lib/workspace-constants';
import { isTransientHydrateFailure, waitForRuntimeReady, fetchDispatchHealth } from '@/lib/runtime-readiness-client';
import {
  extractBrowserNavigateUrl,
  isBrowserToolName,
  resolveBrowserPanelTarget,
} from '@/lib/runtime-browser-types';
import type {
  ConversationRuntimeState,
  DispatchMessagePayload,
  RunPhase,
  RuntimeHubContextValue,
  RuntimeHubWireEvent,
  WorkspaceLayoutMode,
} from '@/lib/runtime-hub-types';
import { conversationIdFromPath, navigateShell, useShellPathname } from '@/lib/shell-navigation';
import { WELCOME_MESSAGE } from '@/lib/runtime-hub-types';

const RuntimeHubContext = createContext<RuntimeHubContextValue | null>(null);

interface TurnTracking {
  assistantMessageId: string;
  thinkingMessageId: string;
}

function dispatchBrowserToolSideEffect(event: RuntimeHubWireEvent): void {
  if (typeof window === 'undefined' || event.type !== 'tool_call') {
    return;
  }

  const tool = typeof event.payload.tool === 'string' ? event.payload.tool : '';
  if (!isBrowserToolName(tool)) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('runtime:browser-tool', {
      detail: {
        tool,
        args: event.payload.args,
        conversationId: event.conversation_id,
      },
    }),
  );

  const navigateUrl = extractBrowserNavigateUrl(event.payload.args);
  if (navigateUrl) {
    const resolved = resolveBrowserPanelTarget(navigateUrl, window.location.origin);
    if (resolved.harnessSelf && resolved.url === 'about:blank') {
      window.dispatchEvent(new CustomEvent('runtime:sync-browser'));
      return;
    }

    window.dispatchEvent(
      new CustomEvent('runtime:open-browser', {
        detail: {
          url: resolved.url,
          conversationId: event.conversation_id,
          interactive: resolved.interactive,
        },
      }),
    );
  }
}

function resolveTurnTracking(
  conversationId: string,
  state: ConversationRuntimeState,
  trackingMap: Map<string, TurnTracking>,
): TurnTracking | null {
  const existing = trackingMap.get(conversationId);
  if (existing) {
    return existing;
  }

  if (state.activeRunId) {
    const tracking = resolveTurnTrackingForActiveRun(state, state.activeRunId);
    trackingMap.set(conversationId, tracking);
    return tracking;
  }

  const assistantMessage = [...state.messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.streaming);

  if (!assistantMessage) {
    return null;
  }

  const thinkingMessage = [...state.messages]
    .reverse()
    .find((message) => message.role === 'thinking' && message.streaming);

  const tracking: TurnTracking = {
    assistantMessageId: assistantMessage.id,
    thinkingMessageId: thinkingMessage?.id ?? `thinking-recovered-${assistantMessage.id}`,
  };
  trackingMap.set(conversationId, tracking);
  return tracking;
}

function parseLayoutMode(value: string | null): WorkspaceLayoutMode {
  if (value === 'split-2' || value === 'grid-4') {
    return value;
  }
  return 'single';
}

function paneCountForMode(mode: WorkspaceLayoutMode): number {
  switch (mode) {
    case 'split-2':
      return 2;
    case 'grid-4':
      return 4;
    default:
      return 1;
  }
}

function readLayoutFromUrl(): { mode: WorkspaceLayoutMode; panes: string[] } {
  const params = new URLSearchParams(window.location.search);
  const mode = parseLayoutMode(params.get('layout'));
  const panesRaw = params.get('panes');
  const panes =
    panesRaw != null && panesRaw.length > 0
      ? panesRaw.split(',').map((entry) => entry.trim())
      : [];

  if (panes.length === 0) {
    const storedPanes = localStorage.getItem('runtime-hub-pane-ids');
    if (storedPanes) {
      try {
        const parsed = JSON.parse(storedPanes) as unknown;
        if (Array.isArray(parsed)) {
          return {
            mode: parseLayoutMode(localStorage.getItem('runtime-hub-layout-mode')),
            panes: parsed.filter((entry): entry is string => typeof entry === 'string'),
          };
        }
      } catch {
        // Ignore invalid localStorage payload.
      }
    }
  }

  const storedMode = localStorage.getItem('runtime-hub-layout-mode');
  return {
    mode: panes.length > 0 ? mode : parseLayoutMode(storedMode),
    panes,
  };
}

function persistLayout(mode: WorkspaceLayoutMode, panes: string[]): void {
  localStorage.setItem('runtime-hub-layout-mode', mode);
  localStorage.setItem('runtime-hub-pane-ids', JSON.stringify(panes));
}

function syncUrlLayout(mode: WorkspaceLayoutMode, panes: string[]): void {
  const url = new URL(window.location.href);
  if (mode === 'single') {
    url.searchParams.delete('layout');
    url.searchParams.delete('panes');
  } else {
    url.searchParams.set('layout', mode);
    const serialized = normalizePaneIds(panes, mode).join(',');
    if (serialized.replace(/,/g, '').length > 0) {
      url.searchParams.set('panes', serialized);
    } else {
      url.searchParams.delete('panes');
    }
  }
  window.history.replaceState({}, '', url.toString());
}

function normalizePaneIds(panes: string[], mode: WorkspaceLayoutMode): string[] {
  const count = paneCountForMode(mode);
  const next = panes.slice(0, count);
  while (next.length < count) {
    next.push('');
  }
  return next;
}

export function RuntimeHubProvider({ children }: { children: React.ReactNode }) {
  const pathname = useShellPathname();
  const [conversations, setConversations] = useState<Map<string, ConversationRuntimeState>>(
    () => new Map(),
  );
  const [foregroundConversationId, setForegroundConversationId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? conversationIdFromPath(window.location.pathname) : null,
  );
  const [layoutMode, setLayoutModeState] = useState<WorkspaceLayoutMode>('single');
  const [paneConversationIds, setPaneConversationIdsState] = useState<string[]>([]);
  const turnTrackingRef = useRef<Map<string, TurnTracking>>(new Map());
  const hydratedIdsRef = useRef<Set<string>>(new Set());
  const syncCooldownRef = useRef<Map<string, number>>(new Map());
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const SYNC_COOLDOWN_MS = 10_000;

  const updateConversation = useCallback(
    (conversationId: string, updater: (state: ConversationRuntimeState) => ConversationRuntimeState) => {
      setConversations((current) => {
        const next = new Map(current);
        const existing = next.get(conversationId) ?? createConversationState(conversationId);
        next.set(conversationId, updater(existing));
        return next;
      });
    },
    [],
  );

  const applyWireEvent = useCallback(
    (event: RuntimeHubWireEvent) => {
      const conversationId = event.conversation_id;
      if (!conversationId) {
        return;
      }

      dispatchBrowserToolSideEffect(event);

      let terminalEvent = false;

      updateConversation(conversationId, (state) => {
        const tracking = resolveTurnTracking(conversationId, state, turnTrackingRef.current);
        if (!tracking) {
          return state;
        }

        const nextState = applyHubEvent(
          state,
          event,
          tracking.assistantMessageId,
          tracking.thinkingMessageId,
        );

        if (event.type === 'run_complete' || event.type === 'error' || event.type === 'run.aborted') {
          terminalEvent = true;
        }

        return nextState;
      });

      if (terminalEvent) {
        turnTrackingRef.current.delete(conversationId);
        setTimeout(() => {
          updateConversation(conversationId, (state) => ({
            ...state,
            runPhase: state.runPhase === 'failed' ? 'failed' : 'idle',
          }));
        }, 0);
      }
    },
    [updateConversation],
  );

  const handleHubEvent = useCallback(
    (event: RuntimeHubWireEvent) => {
      applyWireEvent(event);
    },
    [applyWireEvent],
  );

  useEffect(() => {
    const unsubscribe = subscribeRuntimeHubStream({
      onEvent: handleHubEvent,
    });
    return unsubscribe;
  }, [handleHubEvent]);

  useEffect(() => {
    const foreground = conversationIdFromPath(pathname);
    setForegroundConversationId(foreground);

    const { mode, panes } = readLayoutFromUrl();
    setLayoutModeState(mode);

    if (pathname === '/' && mode === 'single') {
      setPaneConversationIdsState([]);
      persistLayout('single', []);
      syncUrlLayout('single', []);
      return;
    }

    const normalizedPanes =
      panes.length > 0
        ? panes
        : foreground
          ? [foreground]
          : [];
    setPaneConversationIdsState(normalizedPanes.slice(0, paneCountForMode(mode)));
  }, [pathname]);

  const syncActiveRunForConversation = useCallback(
    async (conversationId: string): Promise<boolean> => {
      if (isDraftConversationId(conversationId)) {
        return false;
      }

      const lastAttempt = syncCooldownRef.current.get(conversationId) ?? 0;
      if (Date.now() - lastAttempt < SYNC_COOLDOWN_MS) {
        return false;
      }
      syncCooldownRef.current.set(conversationId, Date.now());

      const activeRuns = await fetchActiveRunsIndex();
      const entry = findActiveRunForConversation(activeRuns, conversationId);
      if (!entry) {
        return false;
      }

      const existingState = conversationsRef.current.get(conversationId);
      if (existingState?.runPhase === 'streaming' && existingState.activeRunId === entry.runId) {
        return true;
      }

      const attached = await attachActiveRunStream(entry.runId);
      if (!attached) {
        await purgeStaleActiveRun(entry.runId);
        return false;
      }

      updateConversation(conversationId, (state) => {
        const tracking = resolveTurnTrackingForActiveRun(state, entry.runId);
        turnTrackingRef.current.set(conversationId, tracking);
        return applyActiveRunToConversationState(state, entry);
      });

      return true;
    },
    [updateConversation],
  );

  useEffect(() => {
    const foreground = conversationIdFromPath(pathname);
    if (!foreground || isDraftConversationId(foreground)) {
      return;
    }

    void syncActiveRunForConversation(foreground);
  }, [pathname, syncActiveRunForConversation]);

  const ensureSdkHealth = useCallback(
    async (
      conversationId: string,
      projectId: string,
      options?: { force?: boolean },
    ): Promise<boolean> => {
      updateConversation(conversationId, (state) => ({
        ...state,
        sdkHealth: 'checking',
      }));

      try {
        const health = await fetchDispatchHealth(projectId, { force: options?.force });
        updateConversation(conversationId, (state) => ({
          ...state,
          sdkHealth: health.ready ? 'ready' : 'unavailable',
          sdkHealthMessage: health.message,
        }));
        return health.ready;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Não foi possível verificar conectividade com o runtime Cursor';
        updateConversation(conversationId, (state) => ({
          ...state,
          sdkHealth: 'unavailable',
          sdkHealthMessage: message,
        }));
        return false;
      }
    },
    [updateConversation],
  );

  const hydrateConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      if (isDraftConversationId(conversationId)) {
        const draftProjectId =
          conversations.get(conversationId)?.projectId ?? DEFAULT_WORKSPACE_ID;
        updateConversation(conversationId, (current) => ({
          ...current,
          title: 'New chat',
          hydrated: true,
          error: null,
        }));
        void ensureSdkHealth(conversationId, draftProjectId);
        return;
      }

      const alreadyHydrated = hydratedIdsRef.current.has(conversationId);

      if (!alreadyHydrated) {
        try {
          await waitForRuntimeReady();

          let response: Response | null = null;
          let lastStatus: number | null = null;

          for (let attempt = 0; attempt < 4; attempt += 1) {
            try {
              response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);
              lastStatus = response.status;
              if (response.ok || response.status === 404) {
                break;
              }
              if (!isTransientHydrateFailure(response.status)) {
                break;
              }
            } catch {
              lastStatus = null;
              if (attempt === 3) {
                throw new Error('Failed to load conversation session');
              }
            }

            await new Promise((resolve) => {
              window.setTimeout(resolve, 250 * (attempt + 1));
            });
          }

          if (!response) {
            throw new Error('Failed to load conversation session');
          }

          if (response.status === 404) {
            hydratedIdsRef.current.add(conversationId);
            updateConversation(conversationId, (state) => ({
              ...state,
              error: 'Conversation not found',
              hydrated: true,
            }));
            return;
          }

          if (!response.ok) {
            throw new Error(
              lastStatus && isTransientHydrateFailure(lastStatus)
                ? 'Runtime server is starting — retry in a moment'
                : 'Failed to load conversation session',
            );
          }

          const payload = (await response.json()) as {
            id: string;
            title: string;
            projectId: string;
            agentId: string | null;
            updatedAt: string;
            messages: import('@/lib/conversation-store').StoredChatMessage[];
          };

          hydratedIdsRef.current.add(conversationId);

          updateConversation(conversationId, (state) => {
            const restored =
              payload.messages.length > 0 ? mapHydratedMessages(payload.messages) : [];
            return {
              ...state,
              title: payload.title,
              projectId: payload.projectId,
              agentId: payload.agentId,
              updatedAt: payload.updatedAt,
              messages: restored.length > 0 ? [WELCOME_MESSAGE, ...restored] : [WELCOME_MESSAGE],
              hydrated: true,
              error: null,
            };
          });

          void ensureSdkHealth(conversationId, payload.projectId);
        } catch (error) {
          hydratedIdsRef.current.add(conversationId);
          const message = error instanceof Error ? error.message : 'Failed to load conversation';
          updateConversation(conversationId, (state) => ({
            ...state,
            error: message,
            hydrated: true,
          }));
        }
      }

      await syncActiveRunForConversation(conversationId);
    },
    [conversations, ensureSdkHealth, syncActiveRunForConversation, updateConversation],
  );

  const ensurePersistedConversation = useCallback(
    async (
      conversationId: string | null,
      projectId: string,
    ): Promise<{ conversationId: string; migratedFrom: string | null }> => {
      if (!isDraftConversationId(conversationId)) {
        return { conversationId: conversationId as string, migratedFrom: null };
      }

      const draftKey = conversationId ?? DRAFT_CONVERSATION_ID;
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New chat',
          project_id: projectId,
        }),
      });

      const payload = (await response.json()) as {
        conversation?: { id: string };
        error?: string;
      };

      if (!response.ok || !payload.conversation?.id) {
        throw new Error(payload.error ?? 'Failed to create conversation');
      }

      const persistedId = payload.conversation.id;

      setConversations((current) => {
        const next = new Map(current);
        const draftState = next.get(draftKey) ?? createConversationState(persistedId);
        next.delete(draftKey);
        next.delete(DRAFT_CONVERSATION_ID);
        next.delete('ephemeral-new-chat');
        next.set(persistedId, {
          ...draftState,
          conversationId: persistedId,
          projectId,
          title: draftState.title ?? 'New chat',
          updatedAt: new Date().toISOString(),
          hydrated: true,
        });
        return next;
      });

      if (layoutMode === 'single') {
        setForegroundConversationId(persistedId);
        navigateShell(`/conversation/${encodeURIComponent(persistedId)}`);
      } else {
        setPaneConversationIdsState((current) => {
          const normalized = normalizePaneIds(current, layoutMode);
          const draftIndex = normalized.findIndex((entry) => isDraftConversationId(entry));
          if (draftIndex >= 0) {
            normalized[draftIndex] = persistedId;
          }
          persistLayout(layoutMode, normalized);
          syncUrlLayout(layoutMode, normalized);
          return normalized;
        });
        setForegroundConversationId(persistedId);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('runtime:conversations-changed'));
      }

      return { conversationId: persistedId, migratedFrom: draftKey };
    },
    [layoutMode],
  );

  const dispatchMessage = useCallback(
    async (conversationId: string | null, payload: DispatchMessagePayload): Promise<void> => {
      let targetId = conversationId ?? DRAFT_CONVERSATION_ID;
      let persistedConversationId = conversationId;

      try {
        const ensured = await ensurePersistedConversation(conversationId, payload.projectId);
        targetId = ensured.conversationId;
        persistedConversationId = ensured.conversationId;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create conversation';
        updateConversation(targetId, (current) => ({
          ...current,
          error: message,
        }));
        return;
      }

      const state = conversations.get(targetId) ?? createConversationState(targetId);

      if (state.runPhase === 'streaming') {
        return;
      }

      const sdkReady =
        state.sdkHealth === 'ready'
          ? true
          : await ensureSdkHealth(targetId, payload.projectId, {
              force: state.sdkHealth === 'unavailable',
            });

      if (!sdkReady) {
        const healthMessage =
          conversations.get(targetId)?.sdkHealthMessage ??
          'Runtime Cursor indisponível — verifique conectividade antes de enviar mensagens';
        updateConversation(targetId, (current) => ({
          ...current,
          error: healthMessage,
          runPhase: 'failed',
          runActivity: 'idle',
        }));
        return;
      }

      const commandsResponse = await fetch(
        `/api/runtime/commands?project_id=${encodeURIComponent(payload.projectId)}`,
      );
      if (!commandsResponse.ok) {
        throw new Error('Failed to load harness commands');
      }
      const commandsPayload = (await commandsResponse.json()) as {
        commands: Array<{ command: string }>;
      };
      const knownCommands = commandsPayload.commands.map((item) => item.command);

      if (isUnknownSlashCommand(payload.message, knownCommands)) {
        updateConversation(targetId, (current) => ({
          ...current,
          error: 'Unknown slash command.',
        }));
        return;
      }

      const turnStamp = Date.now();
      const userMessageId = `user-${turnStamp}`;
      const thinkingMessageId = `thinking-${turnStamp}`;
      const assistantMessageId = `assistant-${turnStamp}`;

      turnTrackingRef.current.set(targetId, {
        assistantMessageId,
        thinkingMessageId,
      });

      updateConversation(targetId, (current) => ({
        ...current,
        error: null,
        runPhase: 'streaming',
        runActivity: 'dispatching',
        toolActivity: [],
        activeRunId: null,
        messages: [
          ...current.messages,
          {
            id: userMessageId,
            role: 'user',
            content: payload.message,
            recordedAt: new Date().toISOString(),
          },
          {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            streaming: true,
            recordedAt: new Date().toISOString(),
          },
        ],
      }));

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: payload.projectId,
            conversation_id: persistedConversationId,
            message: payload.message,
            mode: payload.mode === 'deep_research' ? 'deep_research' : 'default',
            integration_slots: payload.integrationSlots ?? [],
            attachments: payload.attachments ?? [],
            agent_id: state.agentId,
          }),
        });

        const body = (await response.json()) as {
          run_id: string;
          agent_id: string;
          request_id?: string;
          error?: string;
          phase?: string;
          detail?: string;
        };

        if (!response.ok) {
          const parts = [body.error ?? 'Runtime dispatch failed'];
          if (body.phase) {
            parts.push(`phase: ${body.phase}`);
          }
          if (body.request_id) {
            parts.push(`request_id: ${body.request_id}`);
          }
          if (body.detail) {
            parts.push(body.detail);
          }
          throw new Error(parts.join('\n'));
        }

        updateConversation(targetId, (current) => ({
          ...current,
          activeRunId: body.run_id,
          agentId: body.agent_id,
          projectId: payload.projectId,
          lastRequestId: body.request_id ?? null,
        }));
      } catch (error) {
        turnTrackingRef.current.delete(targetId);
        const message = error instanceof Error ? error.message : 'Failed to dispatch chat';
        updateConversation(targetId, (current) => ({
          ...current,
          activeRunId: null,
          runPhase: 'failed',
          runActivity: 'idle',
          error: message,
          messages: current.messages.map((entry) =>
            entry.id === assistantMessageId
              ? { ...entry, content: message, streaming: false, role: 'system' }
              : entry,
          ),
        }));
      }
    },
    [conversations, ensurePersistedConversation, ensureSdkHealth, updateConversation],
  );

  const cancelActiveRun = useCallback(
    async (conversationId: string): Promise<void> => {
      const state = conversations.get(conversationId);
      const runId = state?.activeRunId;
      if (!runId) {
        return;
      }

      const response = await fetch(`/api/runtime/runs/${encodeURIComponent(runId)}/cancel`, {
        method: 'POST',
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        updateConversation(conversationId, (current) => ({
          ...current,
          error: body.error ?? 'Failed to cancel run',
        }));
      }
    },
    [conversations, updateConversation],
  );

  const setLayoutMode = useCallback((mode: WorkspaceLayoutMode) => {
    setLayoutModeState(mode);
    setPaneConversationIdsState((current) => {
      const next = normalizePaneIds(current, mode);
      persistLayout(mode, next);
      syncUrlLayout(mode, next);
      return next;
    });
  }, []);

  const setPaneConversationIds = useCallback((ids: string[]) => {
    const normalized = normalizePaneIds(ids, layoutMode);
    setPaneConversationIdsState(normalized);
    persistLayout(layoutMode, normalized);
    syncUrlLayout(layoutMode, normalized);
  }, [layoutMode]);

  const assignConversationToPane = useCallback(
    (paneIndex: number, conversationId: string) => {
      setPaneConversationIdsState((current) => {
        const normalized = normalizePaneIds(current, layoutMode);
        normalized[paneIndex] = conversationId;
        persistLayout(layoutMode, normalized);
        syncUrlLayout(layoutMode, normalized);
        return normalized;
      });

      if (paneIndex === 0) {
        setForegroundConversationId(conversationId);
        navigateShell(`/conversation/${encodeURIComponent(conversationId)}`);
      }

      void hydrateConversation(conversationId);
    },
    [hydrateConversation, layoutMode],
  );

  const navigateToConversation = useCallback(
    (conversationId: string, options?: { paneIndex?: number }) => {
      const paneIndex = options?.paneIndex ?? 0;

      if (layoutMode === 'single') {
        navigateShell(`/conversation/${encodeURIComponent(conversationId)}`);
        setForegroundConversationId(conversationId);
        void hydrateConversation(conversationId);
        return;
      }

      assignConversationToPane(paneIndex, conversationId);
    },
    [assignConversationToPane, hydrateConversation, layoutMode],
  );

  const startSessionInPane = useCallback(
    async (paneIndex: number, _projectId?: string): Promise<string | null> => {
      assignConversationToPane(paneIndex, DRAFT_CONVERSATION_ID);
      return DRAFT_CONVERSATION_ID;
    },
    [assignConversationToPane],
  );

  const closePane = useCallback(
    (paneIndex?: number) => {
      if (layoutMode === 'single') {
        navigateShell('/');
        setForegroundConversationId(null);
        return;
      }

      const index = paneIndex ?? 0;
      setPaneConversationIdsState((current) => {
        const normalized = normalizePaneIds(current, layoutMode);
        normalized[index] = '';
        persistLayout(layoutMode, normalized);
        syncUrlLayout(layoutMode, normalized);
        return normalized;
      });

      if (index === 0) {
        setForegroundConversationId(null);
        navigateShell('/');
      }
    },
    [layoutMode],
  );

  const activeRunCount = useMemo(() => countStreamingConversations(conversations), [conversations]);

  const getConversationPhase = useCallback(
    (conversationId: string): RunPhase => {
      return conversations.get(conversationId)?.runPhase ?? 'idle';
    },
    [conversations],
  );

  const getConversationState = useCallback(
    (conversationId: string): ConversationRuntimeState | undefined => {
      return conversations.get(conversationId);
    },
    [conversations],
  );

  const contextValue = useMemo<RuntimeHubContextValue>(
    () => ({
      foregroundConversationId,
      layoutMode,
      paneConversationIds,
      activeRunCount,
      setForegroundConversation: setForegroundConversationId,
      setLayoutMode,
      setPaneConversationIds,
      assignConversationToPane,
      navigateToConversation,
      startSessionInPane,
      closePane,
      getConversationPhase,
      getConversationState,
      dispatchMessage,
      cancelActiveRun,
      hydrateConversation,
      ensureSdkHealth,
    }),
    [
      foregroundConversationId,
      layoutMode,
      paneConversationIds,
      activeRunCount,
      setLayoutMode,
      setPaneConversationIds,
      assignConversationToPane,
      navigateToConversation,
      startSessionInPane,
      closePane,
      getConversationPhase,
      getConversationState,
      dispatchMessage,
      cancelActiveRun,
      hydrateConversation,
      ensureSdkHealth,
    ],
  );

  return (
    <RuntimeHubContext.Provider value={contextValue}>{children}</RuntimeHubContext.Provider>
  );
}

export function useRuntimeHub(): RuntimeHubContextValue {
  const context = useContext(RuntimeHubContext);
  if (!context) {
    throw new Error('useRuntimeHub must be used within RuntimeHubProvider');
  }
  return context;
}
