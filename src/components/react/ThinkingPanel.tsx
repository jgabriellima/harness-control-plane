'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

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
  const hasContent = content.trim().length > 0;

  return (
    <div
      className={`rounded-lg border pl-11 ${
        streaming
          ? 'border-violet-200 bg-violet-50/60'
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
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-violet-500" aria-hidden />
        ) : null}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Reasoning
          {streaming ? ' · active' : ''}
          {!streaming && durationMs !== undefined ? ` · ${formatDuration(durationMs)}` : ''}
        </span>
        {streaming ? (
          <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-violet-400" aria-hidden />
        ) : null}
      </button>
      {!collapsed ? (
        <div className="border-t border-gray-200/80 px-3 py-2">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-500">
            {hasContent ? content : streaming ? 'Processing…' : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}
