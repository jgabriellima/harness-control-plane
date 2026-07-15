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
  const userResizedRef = useRef(false);
  const hasContent = content.trim().length > 0;

  const measureLayout = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }
    setShowResizeHandle(element.scrollHeight > REASONING_CONTENT_DEFAULT_HEIGHT + 1);
  }, []);

  const expandToContent = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }
    const fullHeight = element.scrollHeight;
    setContentHeight(Math.max(fullHeight, REASONING_CONTENT_MIN_HEIGHT));
    setShowResizeHandle(fullHeight > REASONING_CONTENT_DEFAULT_HEIGHT + 1);
  }, []);

  useEffect(() => {
    if (collapsed) {
      return;
    }

    if (streaming) {
      userResizedRef.current = false;
      expandToContent();
      return;
    }

    setContentHeight(REASONING_CONTENT_DEFAULT_HEIGHT);
    measureLayout();
  }, [collapsed, expandToContent, measureLayout, streaming]);

  useEffect(() => {
    if (collapsed || !streaming || userResizedRef.current) {
      return;
    }
    expandToContent();
  }, [collapsed, content, expandToContent, streaming]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element || collapsed) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (streaming && !userResizedRef.current) {
        expandToContent();
        return;
      }
      measureLayout();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [collapsed, expandToContent, measureLayout, streaming]);

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    userResizedRef.current = true;
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
    <div className="thought-block" data-testid="chat-message-thinking">
      <button
        type="button"
        className="thought-block__toggle"
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
        <span>
          {streaming
            ? 'Thinking…'
            : durationMs !== undefined
              ? `Thought for ${formatDuration(durationMs)}`
              : 'Thought'}
        </span>
        {streaming ? (
          <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-gray-400" aria-hidden />
        ) : null}
      </button>
      {!collapsed ? (
        <>
          <div
            ref={contentRef}
            className="thought-block__content overflow-y-auto"
            style={{ height: contentHeight }}
            data-testid="chat-message-thinking-content"
          >
            {hasContent ? content : streaming ? 'Processing…' : ''}
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
