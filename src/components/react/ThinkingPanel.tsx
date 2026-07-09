'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

const REASONING_CONTENT_DEFAULT_HEIGHT = 72;
const REASONING_CONTENT_MIN_HEIGHT = 72;

interface ThinkingPanelProps {
  content: string;
  streaming?: boolean;
  durationMs?: number;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export default function ThinkingPanel({ content, streaming = false, durationMs }: ThinkingPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [contentHeight, setContentHeight] = useState(REASONING_CONTENT_DEFAULT_HEIGHT);
  const [showResizeHandle, setShowResizeHandle] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const hasContent = content.trim().length > 0;

  const measureLayout = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }
    setShowResizeHandle(element.scrollHeight > REASONING_CONTENT_DEFAULT_HEIGHT + 1);
  }, []);

  useEffect(() => {
    setContentHeight(REASONING_CONTENT_DEFAULT_HEIGHT);
  }, [content]);

  useEffect(() => {
    measureLayout();
  }, [content, contentHeight, collapsed, measureLayout]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element || collapsed) {
      return;
    }

    const observer = new ResizeObserver(() => {
      measureLayout();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [collapsed, measureLayout]);

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { startY: event.clientY, startHeight: contentHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!resizeRef.current || !contentRef.current) {
      return;
    }
    const delta = event.clientY - resizeRef.current.startY;
    const fullHeight = contentRef.current.scrollHeight;
    const nextHeight = Math.max(
      REASONING_CONTENT_MIN_HEIGHT,
      Math.min(fullHeight, resizeRef.current.startHeight + delta),
    );
    setContentHeight(nextHeight);
  }

  function handleResizePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (!resizeRef.current) {
      return;
    }
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleResizeDoubleClick(event: React.MouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const element = contentRef.current;
    if (!element) {
      return;
    }
    const fullHeight = element.scrollHeight;
    const isFullyExpanded = contentHeight >= fullHeight - 1;
    setContentHeight(isFullyExpanded ? REASONING_CONTENT_DEFAULT_HEIGHT : fullHeight);
  }

  return (
    <div
      className={`rounded-lg border pl-11 ${
        streaming
          ? 'border-gray-200 bg-gray-50'
          : 'border-gray-200 bg-gray-50/80'
      }`}
      data-testid="chat-message-thinking"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
        )}
        {streaming ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gray-500" aria-hidden />
        ) : null}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Reasoning
          {streaming ? ' · active' : ''}
          {!streaming && durationMs !== undefined ? ` · ${formatDuration(durationMs)}` : ''}
        </span>
        {streaming ? (
          <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-gray-400" aria-hidden />
        ) : null}
      </button>
      {!collapsed ? (
        <>
          <div
            ref={contentRef}
            className="overflow-y-auto border-t border-gray-200/80 px-3 py-2"
            style={{ height: contentHeight }}
            data-testid="chat-message-thinking-content"
          >
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-500">
              {hasContent ? content : streaming ? 'Processing…' : ''}
            </p>
          </div>
          {showResizeHandle ? (
            <div
              className="h-1.5 shrink-0 cursor-row-resize rounded-b-lg bg-gray-100 hover:bg-gray-200"
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onDoubleClick={handleResizeDoubleClick}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize reasoning panel; double-click to expand or collapse"
              data-testid="chat-message-thinking-resize"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
