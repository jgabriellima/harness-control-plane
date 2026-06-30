'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import RuntimeBrowserPanel from '@/components/react/RuntimeBrowserPanel';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import { conversationIdFromPath, useShellPathname } from '@/lib/shell-navigation';
import {
  emptyBrowserSelection,
  extractBrowserNavigateUrl,
  isBrowserToolName,
  normalizeBrowserUrl,
  resolveBrowserPanelTarget,
  type BrowserControlMode,
  type RuntimeBrowserSelection,
} from '@/lib/runtime-browser-types';

interface RuntimeBrowserContextValue {
  openBrowser: (url: string, conversationId?: string | null) => Promise<void>;
  /** External Chromium window — no embedded panel. Operator/agent must request explicitly. */
  openUserBrowser: (url: string, conversationId?: string | null) => Promise<void>;
  closeBrowser: () => Promise<void>;
  navigateBrowser: (url: string) => Promise<void>;
  refreshBrowser: () => Promise<void>;
  setControlMode: (mode: BrowserControlMode) => Promise<void>;
  selection: RuntimeBrowserSelection | null;
}

const RuntimeBrowserContext = React.createContext<RuntimeBrowserContextValue | null>(null);

interface SessionPayload {
  sessionId: string;
  url: string;
  renderMode?: 'screencast' | 'iframe';
  controlMode?: BrowserControlMode;
  viewportWidth?: number;
  viewportHeight?: number;
  interactive?: boolean;
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
    viewportWidth: session.viewportWidth ?? 1280,
    viewportHeight: session.viewportHeight ?? 720,
    interactive: session.interactive ?? false,
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

function stripBrowserOpenQueryParams(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('browser-open') && !params.has('browser-interactive')) {
    return;
  }
  params.delete('browser-open');
  params.delete('browser-interactive');
  const nextSearch = params.toString();
  const next = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', next);
}

export function RuntimeBrowserProvider({ children }: { children: React.ReactNode }) {
  const pathname = useShellPathname();
  const hub = useRuntimeHub();
  const foregroundConversationId =
    hub.foregroundConversationId ?? conversationIdFromPath(pathname);

  const [selection, setSelection] = useState<RuntimeBrowserSelection | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const attachExistingSession = useCallback(
    async (conversationId: string): Promise<boolean> => {
      const response = await fetch(
        `/api/runtime/browser/session?conversation_id=${encodeURIComponent(conversationId)}`,
      );
      if (!response.ok) {
        return false;
      }
      const payload = (await response.json()) as { session?: SessionPayload | null };
      if (!payload.session?.sessionId || payload.session.interactive) {
        return false;
      }
      setSelection(selectionFromSession(payload.session, payload.session.url));
      return true;
    },
    [],
  );

  const startBrowserSession = useCallback(
    async (
      rawUrl: string,
      conversationId: string,
      interactive: boolean,
    ): Promise<void> => {
      const resolved = resolveBrowserPanelTarget(rawUrl, window.location.origin);

      if (resolved.harnessSelf && resolved.url === 'about:blank') {
        const attached = await attachExistingSession(conversationId);
        if (attached) {
          return;
        }
      }

      const normalized = normalizeBrowserUrl(resolved.url);
      if (interactive) {
        setSelection(null);
      } else {
        setSelection(emptyBrowserSelection(normalized));
      }

      try {
        const response = await fetch('/api/runtime/browser/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: normalized,
            conversation_id: conversationId,
            interactive,
          }),
        });

        const payload = (await response.json()) as {
          session?: SessionPayload;
          error?: string;
        };

        if (!response.ok || !payload.session?.sessionId) {
          if (!interactive) {
            setSelection({
              url: normalized,
              sessionId: null,
              loading: false,
              error: payload.error ?? 'Failed to open browser session',
              renderMode: 'screencast',
              streamUrl: null,
              controlMode: 'agent',
              viewportWidth: 1280,
              viewportHeight: 720,
              interactive: false,
            });
          }
          return;
        }

        if (interactive) {
          setSelection(null);
          return;
        }

        setSelection(selectionFromSession(payload.session, normalized));
      } catch (openError) {
        if (interactive) {
          return;
        }
        const message = openError instanceof Error ? openError.message : 'Failed to open browser';
        setSelection({
          url: normalized,
          sessionId: null,
          loading: false,
          error: message,
          renderMode: 'screencast',
          streamUrl: null,
          controlMode: 'agent',
          viewportWidth: 1280,
          viewportHeight: 720,
          interactive: false,
        });
      }
    },
    [attachExistingSession],
  );

  const openBrowser = useCallback(
    async (url: string, conversationId?: string | null): Promise<void> => {
      const resolvedConversationId = conversationId ?? foregroundConversationId ?? 'default';
      await startBrowserSession(url, resolvedConversationId, false);
    },
    [foregroundConversationId, startBrowserSession],
  );

  const openUserBrowser = useCallback(
    async (url: string, conversationId?: string | null): Promise<void> => {
      const resolvedConversationId = conversationId ?? foregroundConversationId ?? 'default';
      await startBrowserSession(url, resolvedConversationId, true);
    },
    [foregroundConversationId, startBrowserSession],
  );

  const navigateBrowser = useCallback(async (url: string): Promise<void> => {
    const sessionId = selectionRef.current?.sessionId;
    if (!sessionId) {
      return;
    }

    const resolved = resolveBrowserPanelTarget(url, window.location.origin);
    if (resolved.harnessSelf) {
      return;
    }

    const normalized = normalizeBrowserUrl(resolved.url);
    const payload = await postBrowserAction(sessionId, { action: 'navigate', url: normalized });
    if (payload.session) {
      setSelection(selectionFromSession(payload.session, normalized));
    }
  }, []);

  const refreshBrowser = useCallback(async (): Promise<void> => {
    const sessionId = selectionRef.current?.sessionId;
    if (!sessionId) {
      return;
    }

    const payload = await postBrowserAction(sessionId, { action: 'refresh' });
    if (payload.session) {
      setSelection((current) =>
        current
          ? {
              ...current,
              url: payload.session?.url ?? current.url,
            }
          : current,
      );
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
    if (!autoOpenUrl) {
      return;
    }

    const interactive = params.get('browser-interactive') === '1';
    stripBrowserOpenQueryParams();

    if (interactive) {
      void openUserBrowser(autoOpenUrl, foregroundConversationId);
      return;
    }
    void openBrowser(autoOpenUrl, foregroundConversationId);
  }, [foregroundConversationId, openBrowser, openUserBrowser]);

  useEffect(() => {
    function onOpenBrowser(event: Event): void {
      const detail = (event as CustomEvent<{ url?: string; conversationId?: string; interactive?: boolean }>)
        .detail;
      if (!detail?.url) {
        return;
      }

      const resolved = resolveBrowserPanelTarget(detail.url, window.location.origin);
      const conversationId = detail.conversationId ?? foregroundConversationId;

      if (resolved.harnessSelf && resolved.url === 'about:blank') {
        if (conversationId) {
          void attachExistingSession(conversationId);
        }
        return;
      }

      if (detail.interactive || resolved.interactive) {
        void openUserBrowser(resolved.url, conversationId);
        return;
      }
      void openBrowser(resolved.url, conversationId);
    }

    window.addEventListener('runtime:open-browser', onOpenBrowser);
    return () => window.removeEventListener('runtime:open-browser', onOpenBrowser);
  }, [attachExistingSession, foregroundConversationId, openBrowser, openUserBrowser]);

  useEffect(() => {
    function onSyncBrowser(): void {
      const conversationId = foregroundConversationId ?? 'default';
      void attachExistingSession(conversationId);
    }

    window.addEventListener('runtime:sync-browser', onSyncBrowser);
    return () => window.removeEventListener('runtime:sync-browser', onSyncBrowser);
  }, [attachExistingSession, foregroundConversationId]);

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
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [attachExistingSession, foregroundConversationId, selection]);

  useEffect(() => {
    const sessionId = selection?.sessionId;
    if (!sessionId) {
      return;
    }

    let cancelled = false;

    async function syncLiveUrl(): Promise<void> {
      if (cancelled) {
        return;
      }
      const response = await fetch(
        `/api/runtime/browser/session?session_id=${encodeURIComponent(sessionId)}`,
      );
      if (!response.ok || cancelled) {
        return;
      }
      const payload = (await response.json()) as { session?: SessionPayload | null };
      const liveUrl = payload.session?.url;
      if (!liveUrl || cancelled) {
        return;
      }
      setSelection((current) =>
        current && current.sessionId === sessionId && current.url !== liveUrl
          ? { ...current, url: liveUrl }
          : current,
      );
    }

    void syncLiveUrl();
    const timer = window.setInterval(() => {
      void syncLiveUrl();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selection?.sessionId]);

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
        const resolved = resolveBrowserPanelTarget(navigateUrl, window.location.origin);
        if (resolved.harnessSelf && resolved.url === 'about:blank') {
          if (targetConversation) {
            void attachExistingSession(targetConversation);
          }
          return;
        }
        void openBrowser(resolved.url, targetConversation ?? foregroundConversationId);
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
  }, [attachExistingSession, foregroundConversationId, openBrowser]);

  const value = useMemo(
    () => ({
      openBrowser,
      openUserBrowser,
      closeBrowser,
      navigateBrowser,
      refreshBrowser,
      setControlMode,
      selection,
    }),
    [
      closeBrowser,
      navigateBrowser,
      openBrowser,
      openUserBrowser,
      refreshBrowser,
      selection,
      setControlMode,
    ],
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
  const { selection, closeBrowser, navigateBrowser, refreshBrowser, setControlMode } =
    useRuntimeBrowser();
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
          onRefresh={refreshBrowser}
          onControlModeChange={setControlMode}
        />
      ) : null}
    </div>
  );
}
