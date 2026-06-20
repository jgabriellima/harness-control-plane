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
import type {
  ConversationRuntimeState,
  DispatchMessagePayload,
  RunPhase,
  RuntimeHubContextValue,
  RuntimeHubWireEvent,
  WorkspaceLayoutMode,
} from '@/lib/runtime-hub-types';
import { WELCOME_MESSAGE } from '@/lib/runtime-hub-types';

const RuntimeHubContext = createContext<RuntimeHubContextValue | null>(null);

interface TurnTracking {
  assistantMessageId: string;
  thinkingMessageId: string;
}

function conversationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/conversation\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
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
  const panes = panesRaw
    ? panesRaw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
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
    if (panes.length > 0) {
      url.searchParams.set('panes', panes.join(','));
    } else {
      url.searchParams.delete('panes');
    }
  }
  window.history.replaceState({}, '', url.toString());
}

export function RuntimeHubProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Map<string, ConversationRuntimeState>>(
    () => new Map(),
  );
  const [foregroundConversationId, setForegroundConversationId] = useState<string | null>(null);
  const [layoutMode, setLayoutModeState] = useState<WorkspaceLayoutMode>('single');
  const [paneConversationIds, setPaneConversationIdsState] = useState<string[]>([]);
  const turnTrackingRef = useRef<Map<string, TurnTracking>>(new Map());

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

  const handleHubEvent = useCallback(
    (event: RuntimeHubWireEvent) => {
      const conversationId = event.conversation_id;
      if (!conversationId) {
        return;
      }

      const tracking = turnTrackingRef.current.get(conversationId);
      if (!tracking) {
        return;
      }

      updateConversation(conversationId, (state) =>
        applyHubEvent(
          state,
          event,
          tracking.assistantMessageId,
          tracking.thinkingMessageId,
        ),
      );

      if (event.type === 'run_complete' || event.type === 'error') {
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

  useEffect(() => {
    const unsubscribe = subscribeRuntimeHubStream({
      onEvent: handleHubEvent,
    });
    return unsubscribe;
  }, [handleHubEvent]);

  useEffect(() => {
    const syncFromLocation = (): void => {
      setForegroundConversationId(conversationIdFromPath(window.location.pathname));
      const { mode, panes } = readLayoutFromUrl();
      setLayoutModeState(mode);
      const foreground = conversationIdFromPath(window.location.pathname);
      const normalizedPanes =
        panes.length > 0
          ? panes
          : foreground
            ? [foreground]
            : [];
      setPaneConversationIdsState(normalizedPanes.slice(0, paneCountForMode(mode)));
    };

    syncFromLocation();
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, []);

  useEffect(() => {
    void fetch('/api/runtime/active-runs')
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          active?: Array<{ runId: string; conversationId: string; agentId: string }>;
        };
        const active = payload.active ?? [];
        for (const entry of active) {
          updateConversation(entry.conversationId, (state) => ({
            ...state,
            agentId: entry.agentId,
            activeRunId: entry.runId,
            runPhase: 'streaming',
          }));
        }
      })
      .catch(() => undefined);
  }, [updateConversation]);

  const hydrateConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      const existing = conversations.get(conversationId);
      if (existing?.hydrated) {
        return;
      }

      try {
        const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);
        if (!response.ok) {
          throw new Error('Failed to load conversation session');
        }

        const payload = (await response.json()) as {
          id: string;
          title: string;
          projectId: string;
          agentId: string | null;
          messages: ConversationRuntimeState['messages'];
        };

        updateConversation(conversationId, (state) => {
          const restored =
            payload.messages.length > 0
              ? payload.messages.filter((message) => message.role !== 'tool')
              : [];
          return {
            ...state,
            title: payload.title,
            projectId: payload.projectId,
            agentId: payload.agentId,
            messages: restored.length > 0 ? [WELCOME_MESSAGE, ...restored] : [WELCOME_MESSAGE],
            hydrated: true,
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load conversation';
        updateConversation(conversationId, (state) => ({
          ...state,
          error: message,
          hydrated: true,
        }));
      }
    },
    [conversations, updateConversation],
  );

  const dispatchMessage = useCallback(
    async (conversationId: string | null, payload: DispatchMessagePayload): Promise<void> => {
      const targetId = conversationId ?? 'ephemeral-new-chat';
      const state = conversations.get(targetId) ?? createConversationState(targetId);

      if (state.runPhase === 'streaming') {
        updateConversation(targetId, (current) => ({
          ...current,
          error: 'A run is already in progress for this conversation.',
        }));
        return;
      }

      const commandsResponse = await fetch('/api/runtime/commands');
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
        toolActivity: [],
        activeRunId: null,
        messages: [
          ...current.messages,
          { id: userMessageId, role: 'user', content: payload.message },
          { id: assistantMessageId, role: 'assistant', content: '', streaming: true },
        ],
      }));

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: payload.projectId,
            conversation_id: conversationId,
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
          error?: string;
        };

        if (!response.ok) {
          throw new Error(body.error ?? 'Runtime dispatch failed');
        }

        updateConversation(targetId, (current) => ({
          ...current,
          activeRunId: body.run_id,
          agentId: body.agent_id,
          projectId: payload.projectId,
        }));
      } catch (error) {
        turnTrackingRef.current.delete(targetId);
        const message = error instanceof Error ? error.message : 'Failed to dispatch chat';
        updateConversation(targetId, (current) => ({
          ...current,
          activeRunId: null,
          runPhase: 'failed',
          error: message,
          messages: current.messages.map((entry) =>
            entry.id === assistantMessageId
              ? { ...entry, content: message, streaming: false, role: 'system' }
              : entry,
          ),
        }));
      }
    },
    [conversations, updateConversation],
  );

  const setLayoutMode = useCallback((mode: WorkspaceLayoutMode) => {
    setLayoutModeState(mode);
    setPaneConversationIdsState((current) => {
      const count = paneCountForMode(mode);
      const next = current.slice(0, count);
      while (next.length < count) {
        next.push('');
      }
      persistLayout(mode, next.filter((entry) => entry.length > 0));
      syncUrlLayout(mode, next.filter((entry) => entry.length > 0));
      return next;
    });
  }, []);

  const setPaneConversationIds = useCallback((ids: string[]) => {
    setPaneConversationIdsState(ids);
    persistLayout(layoutMode, ids.filter((entry) => entry.length > 0));
    syncUrlLayout(layoutMode, ids.filter((entry) => entry.length > 0));
  }, [layoutMode]);

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

  const contextValue: RuntimeHubContextValue = {
    foregroundConversationId,
    layoutMode,
    paneConversationIds,
    activeRunCount,
    setForegroundConversation: setForegroundConversationId,
    setLayoutMode,
    setPaneConversationIds,
    getConversationPhase,
    getConversationState,
    dispatchMessage,
    hydrateConversation,
  };

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
