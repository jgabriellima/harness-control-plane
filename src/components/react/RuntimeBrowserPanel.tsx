import { X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import type { RuntimeBrowserSelection } from '@/lib/runtime-browser-types';

interface RuntimeBrowserPanelProps {
  selection: RuntimeBrowserSelection;
  onClose: () => void;
}

export default function RuntimeBrowserPanel({ selection, onClose }: RuntimeBrowserPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

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

  async function handleViewportClick(event: React.MouseEvent<HTMLDivElement>): Promise<void> {
    if (!selection.sessionId || !viewportRef.current) {
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

  return (
    <aside
      className="flex min-h-0 min-w-0 flex-col border-l border-gray-200 bg-white"
      data-testid="runtime-browser-panel"
      aria-label={`Runtime browser: ${selection.url}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">Runtime Browser</p>
          <p className="truncate font-mono text-xs text-gray-700" data-testid="runtime-browser-url">
            {selection.url}
          </p>
          <p className="mt-0.5 text-[10px] text-gray-400">
            Shared Playwright session — click to interact; agent MCP uses same CDP endpoint
          </p>
        </div>
        <button
          type="button"
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Close browser panel"
          data-testid="runtime-browser-close"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 cursor-crosshair overflow-hidden bg-gray-900"
        data-testid="runtime-browser-viewport"
        onClick={(event) => {
          void handleViewportClick(event);
        }}
      >
        {selection.loading ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-300">
            Starting browser session…
          </p>
        ) : null}

        {!selection.loading && selection.error ? (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-400" role="alert">
            {selection.error}
          </p>
        ) : null}

        {!selection.loading && !selection.error && streamError ? (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-amber-300" role="alert">
            {streamError}
          </p>
        ) : null}

        {!selection.loading && !selection.error && frameSrc ? (
          <img
            src={frameSrc}
            alt={`Browser view of ${selection.url}`}
            className="h-full w-full object-contain object-top"
            data-testid="runtime-browser-screencast"
          />
        ) : null}

        {!selection.loading && !selection.error && !frameSrc && !streamError ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Waiting for browser stream…
          </p>
        ) : null}
      </div>
    </aside>
  );
}
