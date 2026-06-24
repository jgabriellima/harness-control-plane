'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import RuntimeBrowserPanel from '@/components/react/RuntimeBrowserPanel';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import { conversationIdFromPath, useShellPathname } from '@/lib/shell-navigation';
import {
  emptyBrowserSelection,
  extractBrowserNavigateUrl,
  isBrowserToolName,
  type BrowserControlMode,
  type RuntimeBrowserSelection,
} from '@/lib/runtime-browser-types';

interface RuntimeBrowserContextValue {
  openBrowser: (url: string, conversationId?: string | null) => Promise<void>;
  closeBrowser: () => Promise<void>;
  navigateBrowser: (url: string) => Promise<void>;
  setControlMode: (mode: BrowserControlMode) => Promise<void>;
  selection: RuntimeBrowserSelection | null;
}

const RuntimeBrowserContext = React.createContext<RuntimeBrowserContextValue | null>(null);

function normalizeBrowserUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'about:blank';
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('about:')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

interface SessionPayload {
  sessionId: string;
  url: string;
  renderMode?: 'screencast' | 'iframe';
  controlMode?: BrowserControlMode;
}

function selectionFromSession(
  session: SessionPayload,
  fallbackUrl: string,
): RuntimeBrowserSelection {
  return {
    url: session.url ?? fallbackUrl,
    sessionId: session.sessionId,
    loading: false,
    error: null,
    renderMode: session.renderMode ?? 'screencast',
    streamUrl: `/api/runtime/browser/stream?session_id=${encodeURIComponent(session.sessionId)}`,
    controlMode: session.controlMode ?? 'agent',
  };
}

async function postBrowserAction(
  sessionId: string,
  body: Record<string, unknown>,
): Promise<{ session?: SessionPayload; error?: string }> {
  const response = await fetch('/api/runtime/browser/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, ...body }),
  });
  const payload = (await response.json()) as { session?: SessionPayload; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Browser action failed');
  }
  return payload;
}

export function RuntimeBrowserProvider({ children }: { children: React.ReactNode }) {
  const pathname = useShellPathname();
  const hub = useRuntimeHub();
  const foregroundConversationId =
    hub.foregroundConversationId ?? conversationIdFromPath(pathname);

  const [selection, setSelection] = useState<RuntimeBrowserSelection | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const openBrowser = useCallback(
    async (url: string, conversationId?: string | null): Promise<void> => {
      const normalized = normalizeBrowserUrl(url);
      const resolvedConversationId = conversationId ?? foregroundConversationId ?? 'default';

      setSelection(emptyBrowserSelection(normalized));

      try {
        const response = await fetch('/api/runtime/browser/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: normalized,
            conversation_id: resolvedConversationId,
          }),
        });

        const payload = (await response.json()) as {
          session?: SessionPayload;
          error?: string;
        };

        if (!response.ok || !payload.session?.sessionId) {
          setSelection({
            url: normalized,
            sessionId: null,
            loading: false,
            error: payload.error ?? 'Failed to open browser session',
            renderMode: 'screencast',
            streamUrl: null,
            controlMode: 'agent',
          });
          return;
        }

        setSelection(selectionFromSession(payload.session, normalized));
      } catch (openError) {
        const message = openError instanceof Error ? openError.message : 'Failed to open browser';
        setSelection({
          url: normalized,
          sessionId: null,
          loading: false,
          error: message,
          renderMode: 'screencast',
          streamUrl: null,
          controlMode: 'agent',
        });
      }
    },
    [foregroundConversationId],
  );

  const navigateBrowser = useCallback(async (url: string): Promise<void> => {
    const sessionId = selectionRef.current?.sessionId;
    if (!sessionId) {
      return;
    }

    const normalized = normalizeBrowserUrl(url);
    const payload = await postBrowserAction(sessionId, { action: 'navigate', url: normalized });
    if (payload.session) {
      setSelection(selectionFromSession(payload.session, normalized));
    }
  }, []);

  const setControlMode = useCallback(async (mode: BrowserControlMode): Promise<void> => {
    const sessionId = selectionRef.current?.sessionId;
    if (!sessionId) {
      return;
    }

    const payload = await postBrowserAction(sessionId, {
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

  const closeBrowser = useCallback(async (): Promise<void> => {
    const sessionId = selectionRef.current?.sessionId;
    if (sessionId) {
      await fetch(
        `/api/runtime/browser/session?session_id=${encodeURIComponent(sessionId)}`,
        { method: 'DELETE' },
      ).catch(() => undefined);
    }
    setSelection(null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoOpenUrl = params.get('browser-open');
    if (autoOpenUrl) {
      void openBrowser(autoOpenUrl, foregroundConversationId);
    }
  }, [foregroundConversationId, openBrowser]);

  useEffect(() => {
    function onOpenBrowser(event: Event): void {
      const detail = (event as CustomEvent<{ url?: string; conversationId?: string }>).detail;
      if (detail?.url) {
        void openBrowser(detail.url, detail.conversationId ?? foregroundConversationId);
      }
    }

    window.addEventListener('runtime:open-browser', onOpenBrowser);
    return () => window.removeEventListener('runtime:open-browser', onOpenBrowser);
  }, [foregroundConversationId, openBrowser]);

  useEffect(() => {
    function onBrowserTool(event: Event): void {
      const detail = (event as CustomEvent<{
        tool?: string;
        args?: unknown;
        conversationId?: string;
      }>).detail;

      if (!detail?.tool || !isBrowserToolName(detail.tool)) {
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

      const navigateUrl = extractBrowserNavigateUrl(detail.args);
      if (navigateUrl) {
        void openBrowser(navigateUrl, targetConversation ?? foregroundConversationId);
        return;
      }

      if (selectionRef.current?.sessionId) {
        setSelection((current) =>
          current
            ? {
                ...current,
                loading: false,
              }
            : current,
        );
      }
    }

    window.addEventListener('runtime:browser-tool', onBrowserTool);
    return () => window.removeEventListener('runtime:browser-tool', onBrowserTool);
  }, [foregroundConversationId, openBrowser]);

  const value = useMemo(
    () => ({
      openBrowser,
      closeBrowser,
      navigateBrowser,
      setControlMode,
      selection,
    }),
    [closeBrowser, navigateBrowser, openBrowser, selection, setControlMode],
  );

  return <RuntimeBrowserContext.Provider value={value}>{children}</RuntimeBrowserContext.Provider>;
}

export function useRuntimeBrowser(): RuntimeBrowserContextValue {
  const context = React.useContext(RuntimeBrowserContext);
  if (!context) {
    throw new Error('useRuntimeBrowser must be used within RuntimeBrowserProvider');
  }
  return context;
}

interface RuntimeBrowserSplitShellProps {
  children: React.ReactNode;
}

export function RuntimeBrowserSplitShell({ children }: RuntimeBrowserSplitShellProps) {
  const { selection, closeBrowser, navigateBrowser, setControlMode } = useRuntimeBrowser();
  const browserPanelOpen = selection !== null;

  return (
    <div
      className={`grid h-full min-h-0 overflow-hidden ${
        browserPanelOpen ? 'grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]' : 'grid-cols-1'
      }`}
      data-testid="runtime-browser-shell"
    >
      {children}
      {selection ? (
        <RuntimeBrowserPanel
          selection={selection}
          onClose={() => {
            void closeBrowser();
          }}
          onNavigate={navigateBrowser}
          onControlModeChange={setControlMode}
        />
      ) : null}
    </div>
  );
}
