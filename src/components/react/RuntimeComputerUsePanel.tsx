import { Bot, Hand, Loader2, Monitor, RotateCw, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import ArtifactActionsMenu from '@/components/react/ArtifactActionsMenu';
import ComputerUseSandboxLoader from '@/components/react/ComputerUseSandboxLoader';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  ComputerUseControlMode,
  RuntimeComputerUseSelection,
} from '@/lib/runtime-computer-use-panel-types';

interface RuntimeComputerUsePanelProps {
  selection: RuntimeComputerUseSelection;
  onClose: () => void;
  onControlModeChange: (mode: ComputerUseControlMode) => Promise<void>;
  onRestart: () => void | Promise<void>;
}

export default function RuntimeComputerUsePanel({
  selection,
  onClose,
  onControlModeChange,
  onRestart,
}: RuntimeComputerUsePanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [controlPending, setControlPending] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!selection.streamUrl || selection.loading || selection.streamKind !== 'host_screencast') {
      return;
    }

    setStreamError(null);
    const source = new EventSource(selection.streamUrl);

    source.onmessage = (message: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(message.data) as { frame?: string; mime?: string };
        if (payload.frame) {
          const mime = payload.mime ?? 'image/png';
          setFrameSrc(`data:${mime};base64,${payload.frame}`);
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    source.onerror = () => {
      setStreamError('Desktop stream disconnected');
      source.close();
    };

    return () => {
      source.close();
    };
  }, [selection.loading, selection.streamKind, selection.streamUrl]);

  const isSandboxVnc = selection.streamKind === 'sandbox_vnc';
  const showSandboxLoader = isSandboxVnc && !selection.vncUrl;
  const showHostStream = selection.streamKind === 'host_screencast';

  const userControl = selection.controlMode === 'user';

  async function postAction(body: Record<string, unknown>): Promise<void> {
    if (!selection.sessionId) {
      return;
    }
    await fetch('/api/runtime/computer-use/preview/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: selection.sessionId, ...body }),
    }).catch(() => undefined);
  }

  function pageCoordsFromEvent(event: React.MouseEvent<HTMLImageElement>): { x: number; y: number } | null {
    const img = imgRef.current;
    if (!img) {
      return null;
    }
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const contentWidth = img.naturalWidth || selection.viewportWidth;
    const contentHeight = img.naturalHeight || selection.viewportHeight;
    const scale = Math.min(rect.width / contentWidth, rect.height / contentHeight);
    const renderedWidth = contentWidth * scale;
    const renderedHeight = contentHeight * scale;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    const localX = event.clientX - rect.left - offsetX;
    const localY = event.clientY - rect.top - offsetY;

    if (localX < 0 || localY < 0 || localX > renderedWidth || localY > renderedHeight) {
      return null;
    }

    const x = (localX / renderedWidth) * selection.viewportWidth;
    const y = (localY / renderedHeight) * selection.viewportHeight;
    return { x: Math.round(x), y: Math.round(y) };
  }

  async function handleViewportClick(event: React.MouseEvent<HTMLImageElement>): Promise<void> {
    if (!userControl || !selection.sessionId) {
      return;
    }
    const coords = pageCoordsFromEvent(event);
    if (!coords) {
      return;
    }
    await postAction({ action: 'click', x: coords.x, y: coords.y });
    viewportRef.current?.focus();
  }

  async function handleViewportKeyDown(event: React.KeyboardEvent<HTMLDivElement>): Promise<void> {
    if (!userControl || !selection.sessionId) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    event.preventDefault();
    if (event.key.length === 1) {
      await postAction({ action: 'type', text: event.key });
      return;
    }
    await postAction({ action: 'keydown', key: event.key });
  }

  async function handleControlMode(mode: ComputerUseControlMode): Promise<void> {
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

  async function handleRestart(): Promise<void> {
    if (restarting) {
      return;
    }
    setRestarting(true);
    setStreamError(null);
    try {
      await onRestart();
    } finally {
      setRestarting(false);
    }
  }

  const canRestart = Boolean(selection.error) || isSandboxVnc;
  const menuActions = canRestart
    ? [
        {
          id: 'restart-preview',
          label: selection.error ? 'Retry preview' : 'Restart preview',
          testId: 'runtime-computer-use-restart-menu',
          onSelect: () => {
            void handleRestart();
          },
        },
      ]
    : [];

  return (
    <aside
      className="flex h-full min-h-0 min-w-0 flex-col border-l border-gray-200 bg-white"
      data-testid="runtime-computer-use-panel"
      aria-label={`Computer use preview: ${selection.label}`}
    >
      <header className="shrink-0 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Monitor className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-600">
              {selection.targetMode === 'sandbox' ? 'CUA Sandbox' : 'My Computer'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ArtifactActionsMenu actions={menuActions} />
            <button
              type="button"
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
              aria-label="Close computer use preview"
              data-testid="runtime-computer-use-close"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <button
              type="button"
              className="shrink-0 rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
              aria-label="Restart preview"
              data-testid="runtime-computer-use-restart"
              disabled={restarting}
              title={selection.error ? 'Retry after error' : 'Restart sandbox preview'}
              onClick={() => {
                void handleRestart();
              }}
            >
              {restarting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCw className="h-3.5 w-3.5" />
              )}
            </button>

            <div
              className="flex shrink-0 rounded-md border border-gray-200 bg-white p-0.5"
              data-testid="runtime-computer-use-control-toggle"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`rounded p-1.5 disabled:opacity-40 ${
                      userControl
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                    aria-label="Take control"
                    data-testid="runtime-computer-use-control-user"
                    disabled={controlPending || selection.loading || Boolean(selection.error) || isSandboxVnc}
                    onClick={() => {
                      void handleControlMode('user');
                    }}
                  >
                    <Hand className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Take control — click and type on the desktop stream
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`rounded p-1.5 disabled:opacity-40 ${
                      !userControl
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                    aria-label="Return to agent"
                    data-testid="runtime-computer-use-control-agent"
                    disabled={controlPending || selection.loading || Boolean(selection.error) || isSandboxVnc}
                    onClick={() => {
                      void handleControlMode('agent');
                    }}
                  >
                    <Bot className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Return to agent — resume automated desktop actions
                </TooltipContent>
              </Tooltip>
            </div>

            <p className="min-w-0 flex-1 truncate font-mono text-[10px] text-gray-500">
              {selection.label}
            </p>
          </div>
        </TooltipProvider>
      </header>

      <div
        ref={viewportRef}
        className={`relative min-h-0 flex-1 overflow-hidden bg-gray-950 outline-none ${
          userControl ? 'cursor-crosshair ring-1 ring-inset ring-blue-200' : 'cursor-default'
        }`}
        data-testid="runtime-computer-use-viewport"
        data-control-mode={selection.controlMode}
        tabIndex={userControl ? 0 : -1}
        onKeyDown={(event) => {
          void handleViewportKeyDown(event);
        }}
      >
        {showSandboxLoader ? (
          <div className="absolute inset-0">
            <ComputerUseSandboxLoader
            phase={selection.sandboxPhase}
            message={selection.sandboxMessage}
            error={selection.error}
            checks={selection.sandboxPreflightChecks}
            restarting={restarting}
            onRetry={() => {
              void handleRestart();
            }}
          />
          </div>
        ) : null}

        {!showSandboxLoader && selection.loading && showHostStream ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting desktop preview…
          </p>
        ) : null}

        {!showSandboxLoader && selection.error ? (
          <p
            className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-400"
            role="alert"
          >
            {selection.error}
          </p>
        ) : null}

        {!showSandboxLoader && !selection.error && showHostStream && streamError ? (
          <p
            className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-amber-400"
            role="alert"
          >
            {streamError}
          </p>
        ) : null}

        {!showSandboxLoader && !selection.error && selection.vncUrl ? (
          <div className="absolute inset-0 overflow-hidden bg-black">
            <iframe
              title={`CUA Sandbox VNC — ${selection.label}`}
              src={selection.vncUrl}
              className="size-full border-0 bg-black"
              data-testid="runtime-computer-use-vnc-frame"
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          </div>
        ) : null}

        {!showSandboxLoader && !selection.error && showHostStream && frameSrc ? (
          <div className="flex h-full w-full items-center justify-center bg-gray-950">
            <img
              ref={imgRef}
              src={frameSrc}
              alt={`Desktop preview for ${selection.label}`}
              className="max-h-full max-w-full object-contain"
              data-testid="runtime-computer-use-screencast"
              onClick={(event) => {
                void handleViewportClick(event);
              }}
            />
          </div>
        ) : null}

        {!showSandboxLoader &&
        !selection.error &&
        showHostStream &&
        !frameSrc &&
        !streamError &&
        !selection.loading ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Waiting for desktop stream…
          </p>
        ) : null}

        {!showSandboxLoader && !selection.error && !selection.loading && !userControl ? (
          <div
            className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white"
            data-testid="runtime-computer-use-agent-control-badge"
          >
            {isSandboxVnc
              ? 'Agent control — live VNC sandbox stream'
              : 'Agent control — desktop actions via CuaDriver'}
          </div>
        ) : null}

        {!selection.loading && !selection.error && userControl ? (
          <div
            className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-blue-700/90 px-2 py-1 text-[10px] font-medium text-white"
            data-testid="runtime-computer-use-user-control-badge"
          >
            Take control active — click to focus, then type
          </div>
        ) : null}
      </div>
    </aside>
  );
}
