import { ArrowRight, Bot, Hand, Loader2, RotateCw, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { BrowserControlMode, RuntimeBrowserSelection } from '@/lib/runtime-browser-types';

interface RuntimeBrowserPanelProps {
  selection: RuntimeBrowserSelection;
  onClose: () => void;
  onNavigate: (url: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onControlModeChange: (mode: BrowserControlMode) => Promise<void>;
}

function normalizeAddressInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'about:blank';
  }
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('about:')
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export default function RuntimeBrowserPanel({
  selection,
  onClose,
  onNavigate,
  onRefresh,
  onControlModeChange,
}: RuntimeBrowserPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [addressValue, setAddressValue] = useState(selection.url);
  const [navigating, setNavigating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [controlPending, setControlPending] = useState(false);

  useEffect(() => {
    setAddressValue(selection.url);
  }, [selection.url]);

  useEffect(() => {
    if (!selection.streamUrl || selection.loading) {
      return;
    }

    setStreamError(null);
    const source = new EventSource(selection.streamUrl);

    source.onmessage = (message: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(message.data) as { frame?: string };
        if (payload.frame) {
          setFrameSrc(`data:image/jpeg;base64,${payload.frame}`);
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    source.onerror = () => {
      setStreamError('Browser stream disconnected');
      source.close();
    };

    return () => {
      source.close();
    };
  }, [selection.loading, selection.streamUrl]);

  const userControl = selection.controlMode === 'user';

  async function handleViewportClick(event: React.MouseEvent<HTMLDivElement>): Promise<void> {
    if (!userControl || !selection.sessionId || !viewportRef.current) {
      return;
    }

    const rect = viewportRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    await fetch('/api/runtime/browser/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: selection.sessionId,
        action: 'click',
        x: Math.round(x),
        y: Math.round(y),
      }),
    }).catch(() => undefined);
  }

  async function handleNavigate(): Promise<void> {
    const target = normalizeAddressInput(addressValue);
    setNavigating(true);
    try {
      await onNavigate(target);
    } finally {
      setNavigating(false);
    }
  }

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleControlMode(mode: BrowserControlMode): Promise<void> {
    if (mode === selection.controlMode) {
      return;
    }
    setControlPending(true);
    try {
      await onControlModeChange(mode);
    } finally {
      setControlPending(false);
    }
  }

  return (
    <aside
      className="flex min-h-0 min-w-0 flex-col border-l border-gray-200 bg-gray-50"
      data-testid="runtime-browser-panel"
      aria-label={`Runtime browser: ${selection.url}`}
    >
      <header className="shrink-0 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">
            Runtime Browser
          </p>
          <button
            type="button"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Close browser panel"
            data-testid="runtime-browser-close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-3 pb-2">
          <button
            type="button"
            className="shrink-0 rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-100 hover:text-violet-600 disabled:opacity-40"
            aria-label="Refresh page"
            data-testid="runtime-browser-refresh"
            disabled={selection.loading || Boolean(selection.error) || refreshing || navigating}
            onClick={() => {
              void handleRefresh();
            }}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5" />
            )}
          </button>
          <div
            className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1"
            data-testid="runtime-browser-address-bar"
          >
            <input
              type="url"
              value={addressValue}
              onChange={(event) => setAddressValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleNavigate();
                }
              }}
              className="min-w-0 flex-1 bg-transparent font-mono text-xs text-gray-800 outline-none placeholder:text-gray-400"
              placeholder="https://"
              aria-label="Browser address"
              data-testid="runtime-browser-address-input"
              disabled={selection.loading || Boolean(selection.error)}
            />
            <button
              type="button"
              className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-violet-600 disabled:opacity-40"
              aria-label="Navigate"
              data-testid="runtime-browser-navigate"
              disabled={selection.loading || Boolean(selection.error) || navigating}
              onClick={() => {
                void handleNavigate();
              }}
            >
              {navigating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        <div
          className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-2"
          data-testid="runtime-browser-control-toggle"
        >
          <p className="text-[10px] text-gray-500">Control</p>
          <div className="flex rounded-md border border-gray-200 bg-white p-0.5">
            <Button
              type="button"
              variant={userControl ? 'default' : 'ghost'}
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              data-testid="runtime-browser-control-user"
              disabled={controlPending || selection.loading || Boolean(selection.error)}
              onClick={() => {
                void handleControlMode('user');
              }}
            >
              <Hand className="h-3.5 w-3.5" />
              User
            </Button>
            <Button
              type="button"
              variant={!userControl ? 'default' : 'ghost'}
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              data-testid="runtime-browser-control-agent"
              disabled={controlPending || selection.loading || Boolean(selection.error)}
              onClick={() => {
                void handleControlMode('agent');
              }}
            >
              <Bot className="h-3.5 w-3.5" />
              Agent
            </Button>
          </div>
        </div>
      </header>

      <div
        ref={viewportRef}
        className={`relative min-h-0 flex-1 overflow-hidden bg-white ${
          userControl ? 'cursor-crosshair' : 'cursor-default'
        }`}
        data-testid="runtime-browser-viewport"
        data-control-mode={selection.controlMode}
        onClick={(event) => {
          void handleViewportClick(event);
        }}
      >
        {selection.loading ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Starting browser session…
          </p>
        ) : null}

        {!selection.loading && selection.error ? (
          <p
            className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-500"
            role="alert"
          >
            {selection.error}
          </p>
        ) : null}

        {!selection.loading && !selection.error && streamError ? (
          <p
            className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-amber-600"
            role="alert"
          >
            {streamError}
          </p>
        ) : null}

        {!selection.loading && !selection.error && frameSrc ? (
          <div className="flex h-full w-full items-center justify-center bg-gray-100">
            <img
              src={frameSrc}
              alt={`Browser view of ${selection.url}`}
              className="max-h-full max-w-full object-contain"
              data-testid="runtime-browser-screencast"
            />
          </div>
        ) : null}

        {!selection.loading && !selection.error && !frameSrc && !streamError ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Waiting for browser stream…
          </p>
        ) : null}

        {!selection.loading && !selection.error && !userControl ? (
          <div
            className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white"
            data-testid="runtime-browser-agent-control-badge"
          >
            Agent control — MCP uses shared CDP
          </div>
        ) : null}
      </div>

      <p
        className="shrink-0 truncate border-t border-gray-200 bg-white px-3 py-1.5 font-mono text-[10px] text-gray-500"
        data-testid="runtime-browser-url"
      >
        {selection.url}
      </p>
    </aside>
  );
}
