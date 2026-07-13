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
  applyContinuableRunState,
  applyInterruptedConversationState,
  applyRecoveredCompletedConversationState,
  fetchRunSessionSnapshot,
  findActiveRunForConversation,
  findContinuableRunForConversation,
  purgeStaleActiveRun,
  resolveTurnTrackingForActiveRun,
  type ActiveRunRegistryEntry,
  type ContinuableRunRegistryEntry,
} from '@/lib/active-run-sync';
import { mapHydratedMessages } from '@/lib/chat-message-mapper';
import { seedUserMessageFromTitle, cachePendingUserMessage, clearPendingUserMessage } from '@/lib/conversation-message-seed';
import {
  buildDispatchContextBadges,
  formatUserMessageForDisplay,
  mergeUserContextBadges,
} from '@/lib/user-message-display';
import { DRAFT_CONVERSATION_ID, isDraftConversationId } from '@/lib/draft-conversation';
import { SCHEDULE_INTERVIEW_CONVERSATION_ID } from '@/lib/schedule-tips';
import { DEFAULT_WORKSPACE_ID } from '@/lib/workspace-constants';
import { isTransientHydrateFailure, waitForRuntimeReady, fetchDispatchHealth } from '@/lib/runtime-readiness-client';
import { RUNTIME_CREDENTIALS_CHANGED_EVENT } from '@/lib/runtime-credentials-events';
import {
  clientSdkMessageContext,
  sdkHealthProbeFailedFallback,
  sdkHealthUnavailableFallback,
} from '@/lib/runtime-sdk-messages';
import { isRunAuthFailureText } from '@/lib/runtime-run-failure';
import {
  extractBrowserNavigateUrl,
  isBrowserToolName,
  resolveBrowserPanelTarget,
} from '@/lib/runtime-browser-types';
import { isCuaToolName } from '@/lib/runtime-computer-use-types';
import {
  logInternalRuntimeError,
  toUserFacingRuntimeDispatchErrorMessage,
} from '@/lib/user-facing-error';
import type {
  ConversationRuntimeState,
  DispatchMessagePayload,
  RunPhase,
  RuntimeHubContextValue,
  RuntimeHubWireEvent,
  WorkspaceLayoutMode,
} from '@/lib/runtime-hub-types';
import { conversationIdFromPath, navigateShell, useShellPathname } from '@/lib/shell-navigation';
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

function dispatchComputerUseToolSideEffect(event: RuntimeHubWireEvent): void {
  if (typeof window === 'undefined' || event.type !== 'tool_call') {
    return;
  }

  const tool = typeof event.payload.tool === 'string' ? event.payload.tool : '';
  if (!isCuaToolName(tool)) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('runtime:computer-use-tool', {
      detail: {
        tool,
        args: event.payload.args,
        conversationId: event.conversation_id,
      },
    }),
  );

  window.dispatchEvent(
    new CustomEvent('runtime:open-computer-use-preview', {
      detail: {
        conversationId: event.conversation_id,
      },
    }),
  );
}

function dispatchComputerUsePreviewSessionSideEffect(event: RuntimeHubWireEvent): void {
  if (typeof window === 'undefined' || event.type !== 'computer_use.preview.ready') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('runtime:open-computer-use-preview', {
      detail: {
        conversationId: event.conversation_id,
      },
    }),
  );
}

function sessionPayloadFromHubEvent(
  event: RuntimeHubWireEvent,
): {
  sessionId: string;
  url: string;
  renderMode?: 'screencast' | 'iframe';
  controlMode?: 'user' | 'agent';
  viewportWidth?: number;
  viewportHeight?: number;
  interactive?: boolean;
} | null {
  const sessionId = typeof event.payload.sessionId === 'string' ? event.payload.sessionId : '';
  const url = typeof event.payload.url === 'string' ? event.payload.url : '';
  if (!sessionId || !url) {
    return null;
  }

  const controlMode = event.payload.controlMode === 'user' ? 'user' : 'agent';
  const viewportWidth =
    typeof event.payload.viewportWidth === 'number' ? event.payload.viewportWidth : 1280;
  const viewportHeight =
    typeof event.payload.viewportHeight === 'number' ? event.payload.viewportHeight : 720;

  return {
    sessionId,
    url,
    renderMode: 'screencast',
    controlMode,
    viewportWidth,
    viewportHeight,
    interactive: event.payload.interactive === true,
  };
}

function dispatchBrowserSessionSideEffect(event: RuntimeHubWireEvent): void {
  if (typeof window === 'undefined' || event.type !== 'browser.session.ready') {
    return;
  }

  if (event.payload.interactive === true) {
    return;
  }

  const session = sessionPayloadFromHubEvent(event);
  window.dispatchEvent(
    new CustomEvent('runtime:sync-browser', {
      detail: {
        conversationId: event.conversation_id,
        session,
      },
    }),
  );
}

function dispatchBrowserUrlChangedSideEffect(event: RuntimeHubWireEvent): void {
  if (typeof window === 'undefined' || event.type !== 'browser.url.changed') {
    return;
  }

  const sessionId = typeof event.payload.sessionId === 'string' ? event.payload.sessionId : '';
  const url = typeof event.payload.url === 'string' ? event.payload.url : '';
  if (!sessionId || !url) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('runtime:browser-url-changed', {
      detail: {
        conversationId: event.conversation_id,
        sessionId,
        url,
      },
    }),
  );
}

function dispatchBrowserSessionClosedSideEffect(event: RuntimeHubWireEvent): void {
  if (typeof window === 'undefined' || event.type !== 'browser.session.closed') {
    return;
  }

  const sessionId = typeof event.payload.sessionId === 'string' ? event.payload.sessionId : '';
  if (!sessionId) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('runtime:browser-session-closed', {
      detail: {
        conversationId: event.conversation_id,
        sessionId,
      },
    }),
  );
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
      dispatchBrowserSessionSideEffect(event);
      dispatchBrowserUrlChangedSideEffect(event);
      dispatchBrowserSessionClosedSideEffect(event);
      dispatchComputerUseToolSideEffect(event);
      dispatchComputerUsePreviewSessionSideEffect(event);

      let terminalEvent = false;

      updateConversation(conversationId, (state) => {
        let tracking = resolveTurnTracking(conversationId, state, turnTrackingRef.current);

        if (!tracking && event.run_id) {
          const recovered = resolveTurnTrackingForActiveRun(state, event.run_id);
          turnTrackingRef.current.set(conversationId, recovered);
          tracking = recovered;
          if (state.activeRunId !== event.run_id) {
            state = applyActiveRunToConversationState(state, {
              runId: event.run_id,
              conversationId,
              agentId: event.agent_id,
            });
          }
        }

        if (!tracking) {
          return state;
        }

        const nextState = applyHubEvent(
          state,
          event,
          tracking.assistantMessageId,
          tracking.thinkingMessageId,
        );

        if (
          event.type === 'run_complete' ||
          event.type === 'error' ||
          event.type === 'run.aborted' ||
          event.type === 'run.interrupted'
        ) {
          terminalEvent = true;
        }

        return nextState;
      });

      if (terminalEvent) {
        clearPendingUserMessage(conversationId);
        turnTrackingRef.current.delete(conversationId);
        setTimeout(() => {
          updateConversation(conversationId, (state) => {
            if (state.runPhase === 'interrupted' || state.runPhase === 'failed') {
              return state;
            }
            return {
              ...state,
              runPhase: 'idle',
            };
          });
        }, 0);

        if (event.type === 'error') {
          const message =
            typeof event.payload.message === 'string' ? event.payload.message : '';
          if (isRunAuthFailureText(message)) {
            const projectId = conversations.get(conversationId)?.projectId;
            if (projectId) {
              void fetchDispatchHealth(projectId, { force: true })
                .then((health) => {
                  updateConversation(conversationId, (state) => ({
                    ...state,
                    sdkHealth: health.ready ? 'ready' : 'unavailable',
                    sdkHealthMessage: health.message,
                  }));
                })
                .catch(() => undefined);
            }
          }
        }
      }
    },
    [conversations, updateConversation],
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

  const reconnectExecutingRun = useCallback(
    async (entry: ActiveRunRegistryEntry): Promise<boolean> => {
      const attachResult = await attachActiveRunStream(entry.runId);
      if (attachResult.outcome === 'completed') {
        updateConversation(entry.conversationId, applyRecoveredCompletedConversationState);
        turnTrackingRef.current.delete(entry.conversationId);
        return true;
      }

      if (attachResult.outcome === 'stale') {
        updateConversation(entry.conversationId, (state) =>
          applyInterruptedConversationState(
            state,
            attachResult.message ??
              'Run was interrupted — local runtime session is no longer available',
          ),
        );
        return false;
      }

      if (attachResult.outcome === 'failed') {
        await purgeStaleActiveRun(entry.runId);
        updateConversation(entry.conversationId, (state) =>
          applyInterruptedConversationState(state, 'Could not reattach to active run'),
        );
        return false;
      }

      updateConversation(entry.conversationId, (state) => {
        const tracking = resolveTurnTrackingForActiveRun(state, entry.runId);
        turnTrackingRef.current.set(entry.conversationId, tracking);
        return applyActiveRunToConversationState(state, entry);
      });

      return true;
    },
    [updateConversation],
  );

  const applySessionBoundarySnapshot = useCallback(
    (continuable: ContinuableRunRegistryEntry[]): void => {
      for (const entry of continuable) {
        updateConversation(entry.conversationId, (state) => applyContinuableRunState(state, entry));
      }
    },
    [updateConversation],
  );

  const dismissContinuableRun = useCallback(
    (conversationId: string): void => {
      updateConversation(conversationId, (state) => ({
        ...state,
        runPhase: 'idle',
        activeRunId: null,
        continuableRun: null,
        error: null,
      }));
    },
    [updateConversation],
  );

  const recoverOrphanedActiveRun = useCallback(
    async (conversationId: string, runId: string): Promise<boolean> => {
      const attachResult = await attachActiveRunStream(runId);
      if (attachResult.outcome === 'completed') {
        updateConversation(conversationId, applyRecoveredCompletedConversationState);
        turnTrackingRef.current.delete(conversationId);
        return true;
      }

      if (attachResult.outcome === 'attached') {
        const entry: ActiveRunRegistryEntry = {
          runId,
          conversationId,
          agentId: conversationsRef.current.get(conversationId)?.agentId ?? '',
        };
        updateConversation(conversationId, (state) => {
          const tracking = resolveTurnTrackingForActiveRun(state, runId);
          turnTrackingRef.current.set(conversationId, tracking);
          return applyActiveRunToConversationState(state, entry);
        });
        return true;
      }

      if (attachResult.outcome === 'stale') {
        updateConversation(conversationId, (state) =>
          applyInterruptedConversationState(
            state,
            attachResult.message ??
              'Run was interrupted — local runtime session is no longer available',
          ),
        );
        return false;
      }

      if (attachResult.outcome === 'failed') {
        await purgeStaleActiveRun(runId);
        updateConversation(conversationId, applyRecoveredCompletedConversationState);
        return false;
      }

      return false;
    },
    [updateConversation],
  );

  useEffect(() => {
    void (async () => {
      const snapshot = await fetchRunSessionSnapshot();
      applySessionBoundarySnapshot(snapshot.continuable);
      await Promise.all(snapshot.executing.map((entry) => reconnectExecutingRun(entry)));
    })().catch(() => undefined);
  }, [applySessionBoundarySnapshot, reconnectExecutingRun]);

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

      const snapshot = await fetchRunSessionSnapshot();
      const continuable = findContinuableRunForConversation(snapshot.continuable, conversationId);
      if (continuable) {
        updateConversation(conversationId, (state) => applyContinuableRunState(state, continuable));
        return false;
      }

      const entry = findActiveRunForConversation(snapshot.executing, conversationId);
      if (entry) {
        return reconnectExecutingRun(entry);
      }

      const state = conversationsRef.current.get(conversationId);
      if (state?.runPhase === 'streaming' && state.activeRunId) {
        return recoverOrphanedActiveRun(conversationId, state.activeRunId);
      }

      return false;
    },
    [recoverOrphanedActiveRun, reconnectExecutingRun, updateConversation],
  );

  useEffect(() => {
    const foreground = conversationIdFromPath(pathname);
    if (!foreground || isDraftConversationId(foreground)) {
      return;
    }

    void syncActiveRunForConversation(foreground).catch(() => undefined);
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
            : sdkHealthProbeFailedFallback(clientSdkMessageContext());
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

  useEffect(() => {
    const refreshSdkHealth = (): void => {
      for (const [conversationId, state] of conversations) {
        if (!state.projectId) {
          continue;
        }
        void ensureSdkHealth(conversationId, state.projectId, { force: true });
      }
    };

    window.addEventListener(RUNTIME_CREDENTIALS_CHANGED_EVENT, refreshSdkHealth);
    return () => window.removeEventListener(RUNTIME_CREDENTIALS_CHANGED_EVENT, refreshSdkHealth);
  }, [conversations, ensureSdkHealth]);

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
              error:
                conversationId === SCHEDULE_INTERVIEW_CONVERSATION_ID
                  ? null
                  : 'Conversation not found',
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

          let payload = (await response.json()) as {
            id: string;
            title: string;
            projectId: string;
            agentId: string | null;
            updatedAt: string;
            messages: import('@/lib/conversation-store').StoredChatMessage[];
          };

          if (payload.messages.length === 0 && payload.agentId) {
            await new Promise((resolve) => {
              window.setTimeout(resolve, 500);
            });
            const retryResponse = await fetch(
              `/api/conversations/${encodeURIComponent(conversationId)}`,
            );
            if (retryResponse.ok) {
              payload = (await retryResponse.json()) as typeof payload;
            }
          }

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
              messages: seedUserMessageFromTitle(restored, payload.title, conversationId),
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
      if (!isDraftConversationId(conversationId) && conversationId !== SCHEDULE_INTERVIEW_CONVERSATION_ID) {
        return { conversationId: conversationId as string, migratedFrom: null };
      }

      const draftKey =
        conversationId === SCHEDULE_INTERVIEW_CONVERSATION_ID
          ? SCHEDULE_INTERVIEW_CONVERSATION_ID
          : (conversationId ?? DRAFT_CONVERSATION_ID);
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftKey === SCHEDULE_INTERVIEW_CONVERSATION_ID ? 'Schedule setup' : 'New chat',
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
        if (
          typeof window !== 'undefined' &&
          window.location.pathname !== '/scheduled' &&
          draftKey !== SCHEDULE_INTERVIEW_CONVERSATION_ID
        ) {
          navigateShell(`/conversation/${encodeURIComponent(persistedId)}`);
        }
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
        if (draftKey === SCHEDULE_INTERVIEW_CONVERSATION_ID) {
          window.dispatchEvent(
            new CustomEvent('runtime:schedule-interview-persisted', {
              detail: { conversationId: persistedId },
            }),
          );
        }
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

      if (state.runPhase === 'continuable') {
        updateConversation(targetId, (current) => ({
          ...current,
          runPhase: 'idle',
          activeRunId: null,
          continuableRun: null,
        }));
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
          sdkHealthUnavailableFallback(clientSdkMessageContext());
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

      const trimmedMessage = payload.message.trimStart();
      const presentationLabel = trimmedMessage.startsWith('/openui')
        ? 'Rich UI'
        : trimmedMessage.startsWith('/text')
          ? 'Plain text'
          : undefined;

      const formattedUserMessage = formatUserMessageForDisplay(payload.message);
      const userContextBadges = mergeUserContextBadges(
        formattedUserMessage.badges,
        buildDispatchContextBadges({
        message: payload.message,
        mode: payload.mode === 'deep_research' ? 'deep_research' : 'default',
        computerUseEnabled: payload.computerUseEnabled === true,
        computerUseMode: payload.computerUseMode,
        integrationSlots: payload.integrationSlots ?? [],
        attachments: payload.attachments ?? [],
        scheduleInterview: payload.scheduleInterview === true,
        presentationLabel,
        }),
      );

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
            content: formattedUserMessage.body,
            contextBadges: userContextBadges.length > 0 ? userContextBadges : undefined,
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

      cachePendingUserMessage(
        targetId,
        formattedUserMessage.body,
        userContextBadges.length > 0 ? userContextBadges : undefined,
      );

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
            computer_use_enabled: payload.computerUseEnabled === true,
            computer_use_mode: payload.computerUseMode,
            metadata: {
              ...(payload.scheduleInterview ? { schedule_interview: true } : {}),
            },
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
          logInternalRuntimeError('dispatch', new Error(body.error ?? 'Runtime dispatch failed'), {
            phase: body.phase,
            request_id: body.request_id,
            detail: body.detail,
          });
          throw new Error(toUserFacingRuntimeDispatchErrorMessage(body.error ?? 'Runtime dispatch failed'));
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
        logInternalRuntimeError('dispatch.catch', error);
        const message = toUserFacingRuntimeDispatchErrorMessage(error);
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

  const resumeContinuableRun = useCallback(
    async (conversationId: string): Promise<boolean> => {
      const state = conversationsRef.current.get(conversationId);
      const continuable = state?.continuableRun;
      if (!continuable?.resumable || !state) {
        return false;
      }

      try {
        await purgeStaleActiveRun(continuable.runId);
      } catch {
        // Best-effort — new dispatch must not be blocked by stale registry index.
      }

      updateConversation(conversationId, (current) => ({
        ...current,
        runPhase: 'idle',
        activeRunId: null,
        continuableRun: null,
        error: null,
        agentId: continuable.agentId || current.agentId,
      }));

      await dispatchMessage(conversationId, {
        message: continuable.resumePrompt,
        projectId: state.projectId,
      });

      return true;
    },
    [dispatchMessage, updateConversation],
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
      resumeContinuableRun,
      dismissContinuableRun,
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
      resumeContinuableRun,
      dismissContinuableRun,
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
