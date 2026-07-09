'use client';

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import RuntimeComputerUsePanel from '@/components/react/RuntimeComputerUsePanel';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import { conversationIdFromPath, useShellPathname } from '@/lib/shell-navigation';
import type { ComputerUseTargetMode } from '@/lib/runtime-computer-use-types';
import { isCuaToolName, parseComputerUseTargetMode } from '@/lib/runtime-computer-use-types';
import {
  emptyComputerUseSelection,
  type ComputerUseControlMode,
  type RuntimeComputerUseSelection,
} from '@/lib/runtime-computer-use-panel-types';

interface OpenPreviewOptions {
  forceRestart?: boolean;
}

interface RuntimeComputerUseContextValue {
  openPreview: (
    conversationId?: string | null,
    targetMode?: ComputerUseTargetMode,
    options?: OpenPreviewOptions,
  ) => Promise<void>;
  restartPreview: () => Promise<void>;
  closePreview: () => Promise<void>;
  setControlMode: (mode: ComputerUseControlMode) => Promise<void>;
  selection: RuntimeComputerUseSelection | null;
}

const RuntimeComputerUseContext = React.createContext<RuntimeComputerUseContextValue | null>(null);

interface PreviewSessionPayload {
  sessionId: string;
  conversationId?: string;
  targetMode?: ComputerUseTargetMode;
  streamKind?: 'host_screencast' | 'sandbox_vnc';
  controlMode?: ComputerUseControlMode;
  viewportWidth?: number;
  viewportHeight?: number;
  label?: string;
  vncUrl?: string | null;
  sandboxPhase?: RuntimeComputerUseSelection['sandboxPhase'];
  sandboxMessage?: string | null;
  sandboxPreflightChecks?: RuntimeComputerUseSelection['sandboxPreflightChecks'];
  error?: string | null;
  status?: string;
}

function selectionFromSession(
  session: PreviewSessionPayload,
  conversationId: string,
): RuntimeComputerUseSelection {
  const streamKind = session.streamKind ?? (session.targetMode === 'sandbox' ? 'sandbox_vnc' : 'host_screencast');
  const sandboxLoading =
    streamKind === 'sandbox_vnc' && session.status !== 'ready' && !session.vncUrl && !session.error;

  return {
    sessionId: session.sessionId,
    conversationId: session.conversationId ?? conversationId,
    targetMode: session.targetMode ?? 'host',
    streamKind,
    loading: sandboxLoading,
    error: session.error ?? null,
    streamUrl:
      streamKind === 'host_screencast'
        ? `/api/runtime/computer-use/preview/stream?session_id=${encodeURIComponent(session.sessionId)}`
        : null,
    vncUrl: session.vncUrl ?? null,
    sandboxPhase: session.sandboxPhase ?? null,
    sandboxMessage: session.sandboxMessage ?? null,
    sandboxPreflightChecks: session.sandboxPreflightChecks ?? null,
    controlMode: session.controlMode ?? 'agent',
    viewportWidth: session.viewportWidth ?? 1280,
    viewportHeight: session.viewportHeight ?? 720,
    label: session.label ?? 'My computer',
  };
}

function sessionIsAttachable(session: PreviewSessionPayload): boolean {
  return session.status !== 'error' && !session.error;
}

async function postPreviewAction(
  sessionId: string,
  body: Record<string, unknown>,
): Promise<{ session?: PreviewSessionPayload; error?: string }> {
  const response = await fetch('/api/runtime/computer-use/preview/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, ...body }),
  });
  const payload = (await response.json()) as { session?: PreviewSessionPayload; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Computer-use preview action failed');
  }
  return payload;
}

async function deletePreviewSession(sessionId: string): Promise<void> {
  await fetch(
    `/api/runtime/computer-use/preview/session?session_id=${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  ).catch(() => undefined);
}

async function createPreviewSession(input: {
  conversationId: string;
  targetMode: ComputerUseTargetMode;
  forceRestart?: boolean;
}): Promise<RuntimeComputerUseSelection> {
  const response = await fetch('/api/runtime/computer-use/preview/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: input.conversationId,
      target_mode: input.targetMode,
      force_restart: input.forceRestart === true,
    }),
  });

  const payload = (await response.json()) as {
    session?: PreviewSessionPayload;
    error?: string;
  };

  if (!response.ok || !payload.session?.sessionId) {
    return {
      ...emptyComputerUseSelection(input.conversationId),
      targetMode: input.targetMode,
      loading: false,
      error: payload.error ?? 'Failed to open computer-use preview',
      streamUrl: null,
    };
  }

  return selectionFromSession(payload.session, input.conversationId);
}

export function RuntimeComputerUseProvider({ children }: { children: React.ReactNode }) {
  const pathname = useShellPathname();
  const hub = useRuntimeHub();
  const foregroundConversationId =
    hub.foregroundConversationId ?? conversationIdFromPath(pathname);

  const [selection, setSelection] = useState<RuntimeComputerUseSelection | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const attachExistingSession = useCallback(
    async (conversationId: string): Promise<boolean> => {
      const response = await fetch(
        `/api/runtime/computer-use/preview/session?conversation_id=${encodeURIComponent(conversationId)}`,
      );
      if (!response.ok) {
        return false;
      }
      const payload = (await response.json()) as { session?: PreviewSessionPayload | null };
      if (!payload.session?.sessionId || !sessionIsAttachable(payload.session)) {
        return false;
      }
      setSelection(selectionFromSession(payload.session, conversationId));
      return true;
    },
    [],
  );

  const openPreview = useCallback(
    async (
      conversationId?: string | null,
      targetMode: ComputerUseTargetMode = 'host',
      options?: OpenPreviewOptions,
    ): Promise<void> => {
      const resolvedConversationId = conversationId ?? foregroundConversationId ?? 'default';
      const forceRestart = options?.forceRestart === true;

      if (!forceRestart) {
        const attached = await attachExistingSession(resolvedConversationId);
        if (attached) {
          return;
        }
      } else {
        const sessionId = selectionRef.current?.sessionId;
        if (sessionId) {
          await deletePreviewSession(sessionId);
        }
      }

      setSelection({
        ...emptyComputerUseSelection(resolvedConversationId),
        targetMode,
        streamKind: targetMode === 'sandbox' ? 'sandbox_vnc' : 'host_screencast',
        label: targetMode === 'sandbox' ? 'Sandbox' : 'My computer',
      });

      try {
        const nextSelection = await createPreviewSession({
          conversationId: resolvedConversationId,
          targetMode,
          forceRestart,
        });
        setSelection(nextSelection);
      } catch (openError) {
        const message =
          openError instanceof Error ? openError.message : 'Failed to open computer-use preview';
        setSelection({
          ...emptyComputerUseSelection(resolvedConversationId),
          targetMode,
          loading: false,
          error: message,
          streamUrl: null,
        });
      }
    },
    [attachExistingSession, foregroundConversationId],
  );

  const restartPreview = useCallback(async (): Promise<void> => {
    const current = selectionRef.current;
    if (!current) {
      return;
    }
    await openPreview(current.conversationId, current.targetMode, { forceRestart: true });
  }, [openPreview]);

  const closePreview = useCallback(async (): Promise<void> => {
    const sessionId = selectionRef.current?.sessionId;
    if (sessionId) {
      await deletePreviewSession(sessionId);
    }
    setSelection(null);
  }, []);

  const setControlMode = useCallback(async (mode: ComputerUseControlMode): Promise<void> => {
    const sessionId = selectionRef.current?.sessionId;
    if (!sessionId) {
      return;
    }

    const payload = await postPreviewAction(sessionId, {
      action: 'set_control_mode',
      control_mode: mode,
    });
    if (payload.session) {
      setSelection((current) =>
        current
          ? {
              ...current,
              controlMode: payload.session?.controlMode ?? mode,
            }
          : current,
      );
    }
  }, []);

  useEffect(() => {
    function onOpenPreview(event: Event): void {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      void openPreview(detail?.conversationId ?? foregroundConversationId);
    }

    window.addEventListener('runtime:open-computer-use-preview', onOpenPreview);
    return () => window.removeEventListener('runtime:open-computer-use-preview', onOpenPreview);
  }, [foregroundConversationId, openPreview]);

  useEffect(() => {
    function onRestartPreview(): void {
      void restartPreview();
    }

    window.addEventListener('runtime:restart-computer-use-preview', onRestartPreview);
    return () => window.removeEventListener('runtime:restart-computer-use-preview', onRestartPreview);
  }, [restartPreview]);

  useEffect(() => {
    function onSyncPreview(): void {
      const conversationId = foregroundConversationId ?? 'default';
      void attachExistingSession(conversationId);
    }

    window.addEventListener('runtime:sync-computer-use-preview', onSyncPreview);
    return () => window.removeEventListener('runtime:sync-computer-use-preview', onSyncPreview);
  }, [attachExistingSession, foregroundConversationId]);

  useEffect(() => {
    function onComputerUseTool(event: Event): void {
      const detail = (event as CustomEvent<{
        tool?: string;
        conversationId?: string;
      }>).detail;

      if (!detail?.tool || !isCuaToolName(detail.tool)) {
        return;
      }

      const targetConversation = detail.conversationId ?? foregroundConversationId;
      if (
        targetConversation &&
        foregroundConversationId &&
        targetConversation !== foregroundConversationId
      ) {
        return;
      }

      void openPreview(targetConversation ?? foregroundConversationId);
    }

    window.addEventListener('runtime:computer-use-tool', onComputerUseTool);
    return () => window.removeEventListener('runtime:computer-use-tool', onComputerUseTool);
  }, [foregroundConversationId, openPreview]);

  useEffect(() => {
    if (!selection?.sessionId || selection.streamKind !== 'sandbox_vnc') {
      return;
    }
    if (selection.error) {
      return;
    }
    if (selection.vncUrl) {
      return;
    }

    let cancelled = false;
    const sessionId = selection.sessionId;
    const conversationId = selection.conversationId;

    async function pollSandboxSession(): Promise<void> {
      if (cancelled) {
        return;
      }
      const response = await fetch(
        `/api/runtime/computer-use/preview/session?session_id=${encodeURIComponent(sessionId)}`,
      );
      if (!response.ok || cancelled) {
        return;
      }
      const payload = (await response.json()) as { session?: PreviewSessionPayload | null };
      if (!payload.session?.sessionId || cancelled) {
        return;
      }
      setSelection(selectionFromSession(payload.session, conversationId));
    }

    void pollSandboxSession();
    const timer = window.setInterval(() => {
      void pollSandboxSession();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    selection?.conversationId,
    selection?.error,
    selection?.sessionId,
    selection?.streamKind,
    selection?.vncUrl,
  ]);

  useEffect(() => {
    if (selection !== null || !foregroundConversationId) {
      return;
    }

    let cancelled = false;
    async function syncExistingSession(): Promise<void> {
      if (cancelled) {
        return;
      }
      await attachExistingSession(foregroundConversationId);
    }

    void syncExistingSession();
    const timer = window.setInterval(() => {
      void syncExistingSession();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [attachExistingSession, foregroundConversationId, selection]);

  const value = useMemo(
    () => ({
      openPreview,
      restartPreview,
      closePreview,
      setControlMode,
      selection,
    }),
    [closePreview, openPreview, restartPreview, selection, setControlMode],
  );

  return (
    <RuntimeComputerUseContext.Provider value={value}>{children}</RuntimeComputerUseContext.Provider>
  );
}

export function useRuntimeComputerUse(): RuntimeComputerUseContextValue {
  const context = useContext(RuntimeComputerUseContext);
  if (!context) {
    throw new Error('useRuntimeComputerUse must be used within RuntimeComputerUseProvider');
  }
  return context;
}

export function RuntimeComputerUsePanelSlot(): React.ReactNode {
  const { selection, closePreview, setControlMode, restartPreview } = useRuntimeComputerUse();

  if (!selection) {
    return null;
  }

  return (
    <div className="h-full min-h-0">
      <RuntimeComputerUsePanel
        selection={selection}
        onClose={() => {
          void closePreview();
        }}
        onControlModeChange={setControlMode}
        onRestart={restartPreview}
      />
    </div>
  );
}
