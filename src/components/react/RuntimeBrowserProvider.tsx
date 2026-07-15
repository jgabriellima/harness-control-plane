'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';

import RuntimeBrowserPanel from '@/components/react/RuntimeBrowserPanel';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import {
  RUNTIME_BROWSER_LAYOUT_DEFAULTS,
  RUNTIME_BROWSER_LAYOUT_GROUP_ID,
  RUNTIME_BROWSER_LAYOUT_MIN,
  RUNTIME_BROWSER_PANEL_IDS,
  sanitizeRuntimeBrowserLayout,
} from '@/lib/runtime-browser-layout';
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
import { registerHcpUiHandlers } from '@/lib/runtime-ui-bridge';

interface RuntimeBrowserContextValue {
  openBrowser: (url: string, conversationId?: string | null) => Promise<void>;
  /** External Chromium window — no embedded panel. Operator/agent must request explicitly. */
  openUserBrowser: (url: string, conversationId?: string | null) => Promise<void>;
  closeBrowser: () => Promise<void>;
  navigateBrowser: (url: string) => Promise<void>;
  refreshBrowser: () => Promise<void>;
  setControlMode: (mode: BrowserControlMode) => Promise<void>;
  applyLiveUrl: (sessionId: string, url: string, conversationId?: string) => void;
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
  const openingSessionRef = useRef<Promise<void> | null>(null);

  const attachExistingSession = useCallback(
    async (
      conversationId: string,
      sessionHint?: SessionPayload | null,
    ): Promise<boolean> => {
      if (sessionHint?.sessionId && !sessionHint.interactive) {
        setSelection(selectionFromSession(sessionHint, sessionHint.url));
        return true;
      }

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

  const applyBrowserUrlChanged = useCallback(
    (sessionId: string, url: string, conversationId?: string): void => {
      if (
        conversationId &&
        foregroundConversationId &&
        conversationId !== foregroundConversationId
      ) {
        return;
      }

      setSelection((current) =>
        current && current.sessionId === sessionId && current.url !== url
          ? { ...current, url }
          : current,
      );
    },
    [foregroundConversationId],
  );

  const startBrowserSession = useCallback(
    async (
      rawUrl: string,
      conversationId: string,
      interactive: boolean,
    ): Promise<void> => {
      if (openingSessionRef.current) {
        await openingSessionRef.current;
        if (!interactive && selectionRef.current?.sessionId) {
          return;
        }
      }

      const run = async (): Promise<void> => {
        const resolved = resolveBrowserPanelTarget(rawUrl, window.location.origin);

        if (!interactive) {
          const attached = await attachExistingSession(conversationId);
          if (attached) {
            if (resolved.harnessSelf && resolved.url === 'about:blank') {
              return;
            }
            const normalized = normalizeBrowserUrl(resolved.url);
            const current = selectionRef.current;
            if (current?.sessionId && current.url !== normalized) {
              const payload = await postBrowserAction(current.sessionId, {
                action: 'navigate',
                url: normalized,
              });
              if (payload.session) {
                setSelection(selectionFromSession(payload.session, normalized));
              }
            }
            return;
          }
        } else if (resolved.harnessSelf && resolved.url === 'about:blank') {
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
      };

      openingSessionRef.current = run();
      try {
        await openingSessionRef.current;
      } finally {
        openingSessionRef.current = null;
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
    setSelection((current) =>
      current ? { ...current, url: normalized, loading: false } : current,
    );
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
    return registerHcpUiHandlers({
      openBrowser: (url, conversationId) => {
        void openBrowser(url, conversationId);
      },
      closeBrowser: () => {
        void closeBrowser();
      },
    });
  }, [closeBrowser, openBrowser]);

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
    function onSyncBrowser(event: Event): void {
      const detail = (
        event as CustomEvent<{
          conversationId?: string;
          session?: SessionPayload | null;
        }>
      ).detail;

      const targetConversationId = detail?.conversationId ?? foregroundConversationId ?? 'default';
      if (
        foregroundConversationId &&
        detail?.conversationId &&
        detail.conversationId !== foregroundConversationId
      ) {
        return;
      }

      void attachExistingSession(targetConversationId, detail?.session ?? null);
    }

    window.addEventListener('runtime:sync-browser', onSyncBrowser);
    return () => window.removeEventListener('runtime:sync-browser', onSyncBrowser);
  }, [attachExistingSession, foregroundConversationId]);

  useEffect(() => {
    if (selection !== null || !foregroundConversationId) {
      return;
    }

    void attachExistingSession(foregroundConversationId);
  }, [attachExistingSession, foregroundConversationId, selection]);

  useEffect(() => {
    function onBrowserUrlChanged(event: Event): void {
      const detail = (
        event as CustomEvent<{
          conversationId?: string;
          sessionId?: string;
          url?: string;
        }>
      ).detail;

      if (!detail?.sessionId || !detail.url) {
        return;
      }

      applyBrowserUrlChanged(detail.sessionId, detail.url, detail.conversationId);
    }

    window.addEventListener('runtime:browser-url-changed', onBrowserUrlChanged);
    return () => window.removeEventListener('runtime:browser-url-changed', onBrowserUrlChanged);
  }, [applyBrowserUrlChanged]);

  useEffect(() => {
    function onBrowserSessionClosed(event: Event): void {
      const detail = (
        event as CustomEvent<{
          conversationId?: string;
          sessionId?: string;
        }>
      ).detail;

      if (!detail?.sessionId) {
        return;
      }

      if (
        detail.conversationId &&
        foregroundConversationId &&
        detail.conversationId !== foregroundConversationId
      ) {
        return;
      }

      setSelection((current) => (current?.sessionId === detail.sessionId ? null : current));
    }

    window.addEventListener('runtime:browser-session-closed', onBrowserSessionClosed);
    return () =>
      window.removeEventListener('runtime:browser-session-closed', onBrowserSessionClosed);
  }, [foregroundConversationId]);

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
      applyLiveUrl: applyBrowserUrlChanged,
      selection,
    }),
    [
      applyBrowserUrlChanged,
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

function ResizableRuntimeBrowserSplitShell({
  children,
  selection,
  onClose,
  onNavigate,
  onRefresh,
  onControlModeChange,
  onLiveUrlChange,
}: {
  children: React.ReactNode;
  selection: RuntimeBrowserSelection;
  onClose: () => void;
  onNavigate: (url: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onControlModeChange: (mode: BrowserControlMode) => Promise<void>;
  onLiveUrlChange: (url: string) => void;
}) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    groupId: RUNTIME_BROWSER_LAYOUT_GROUP_ID,
    panelIds: [RUNTIME_BROWSER_PANEL_IDS.main, RUNTIME_BROWSER_PANEL_IDS.browser],
  });

  const resolvedLayout = sanitizeRuntimeBrowserLayout(defaultLayout);

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      onLayoutChanged(sanitizeRuntimeBrowserLayout(layout));
    },
    [onLayoutChanged],
  );

  return (
    <div className="h-full min-h-0 overflow-hidden" data-testid="runtime-browser-shell">
      <Group
        id={RUNTIME_BROWSER_LAYOUT_GROUP_ID}
        orientation="horizontal"
        className="h-full min-h-0 overflow-hidden"
        defaultLayout={resolvedLayout}
        onLayoutChanged={handleLayoutChanged}
      >
        <Panel
          id={RUNTIME_BROWSER_PANEL_IDS.main}
          minSize={RUNTIME_BROWSER_LAYOUT_MIN.main}
          defaultSize={
            resolvedLayout[RUNTIME_BROWSER_PANEL_IDS.main] ?? RUNTIME_BROWSER_LAYOUT_DEFAULTS.main
          }
          className="relative min-h-0 min-w-0 overflow-hidden [&>*]:min-h-0"
        >
          {children}
        </Panel>
        <Separator
          id="runtime-browser-resize-handle"
          className="w-1 shrink-0 bg-gray-200 transition-colors hover:bg-gray-300"
        />
        <Panel
          id={RUNTIME_BROWSER_PANEL_IDS.browser}
          minSize={RUNTIME_BROWSER_LAYOUT_MIN.browser}
          defaultSize={
            resolvedLayout[RUNTIME_BROWSER_PANEL_IDS.browser] ??
            RUNTIME_BROWSER_LAYOUT_DEFAULTS.browser
          }
          className="relative min-h-0 min-w-0 overflow-hidden [&>*]:min-h-0"
        >
          <RuntimeBrowserPanel
            selection={selection}
            onClose={onClose}
            onNavigate={onNavigate}
            onRefresh={onRefresh}
            onControlModeChange={onControlModeChange}
            onLiveUrlChange={onLiveUrlChange}
          />
        </Panel>
      </Group>
    </div>
  );
}

export function RuntimeBrowserSplitShell({ children }: RuntimeBrowserSplitShellProps) {
  const {
    selection,
    closeBrowser,
    navigateBrowser,
    refreshBrowser,
    setControlMode,
    applyLiveUrl,
  } = useRuntimeBrowser();

  if (!selection) {
    return (
      <div className="h-full min-h-0 overflow-hidden" data-testid="runtime-browser-shell">
        {children}
      </div>
    );
  }

  return (
    <ResizableRuntimeBrowserSplitShell
      selection={selection}
      onClose={() => {
        void closeBrowser();
      }}
      onNavigate={navigateBrowser}
      onRefresh={refreshBrowser}
      onControlModeChange={setControlMode}
      onLiveUrlChange={(url) => {
        const sessionId = selection.sessionId;
        if (sessionId) {
          applyLiveUrl(sessionId, url);
        }
      }}
    >
      {children}
    </ResizableRuntimeBrowserSplitShell>
  );
}
