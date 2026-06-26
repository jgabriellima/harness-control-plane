'use client';

import React, { useMemo, useState } from 'react';
import { Maximize2, Pin, PinOff, X } from 'lucide-react';

import EventDistributionChart from '@/components/react/EventDistributionChart';
import {
  computeConversationMetrics,
  formatExecutionTime,
  formatTokenEstimate,
} from '@/lib/conversation-metrics';
import { resolveConversationTimestamp } from '@/lib/format-session-time';
import { isDraftConversationId } from '@/lib/draft-conversation';
import {
  isConversationPinned,
  togglePinnedConversation,
} from '@/lib/pinned-conversations';
import type { ChatMessage } from '@/lib/runtime-hub-types';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';

interface ChatPaneHeaderProps {
  conversationId: string;
  title: string | null;
  updatedAt: string | null;
  messages: ChatMessage[];
  compact?: boolean;
  paneIndex?: number;
}

function formatHeaderDate(conversationId: string, updatedAt: string | null): string | null {
  const date = resolveConversationTimestamp(conversationId, updatedAt);
  if (!date) {
    return null;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ChatPaneHeader({
  conversationId,
  title,
  updatedAt,
  messages,
  compact = false,
  paneIndex,
}: ChatPaneHeaderProps) {
  const hub = useRuntimeHub();
  const [pinned, setPinned] = useState(() => isConversationPinned(conversationId));

  const metrics = useMemo(() => computeConversationMetrics(messages), [messages]);
  const sessionDate = formatHeaderDate(conversationId, updatedAt);
  const displayTitle = title ?? (isDraftConversationId(conversationId) ? 'New session' : 'Session');

  function handleExpand(): void {
    hub.setLayoutMode('single');
    hub.navigateToConversation(conversationId);
  }

  function handleTogglePin(): void {
    const nextPinned = togglePinnedConversation(conversationId);
    setPinned(nextPinned);
  }

  function handleClose(): void {
    hub.closePane(paneIndex);
  }

  return (
    <header
      className={`flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white ${
        compact ? 'px-3 py-2' : 'px-4 py-2.5'
      }`}
      data-testid="chat-pane-header"
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2
            className={`truncate font-medium text-gray-900 ${compact ? 'text-xs' : 'text-sm'}`}
            data-testid="chat-pane-header-title"
          >
            {displayTitle}
          </h2>
          {sessionDate ? (
            <span
              className="shrink-0 text-[10px] text-gray-400"
              data-testid="chat-pane-header-date"
            >
              {sessionDate}
            </span>
          ) : null}
        </div>

        <div
          className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-gray-500"
          data-testid="chat-pane-header-metrics"
        >
          <span title="Total execution time">
            <span className="text-gray-400">Time</span>{' '}
            <span className="font-medium text-gray-600">
              {formatExecutionTime(metrics.executionTimeMs)}
            </span>
          </span>
          <span title="Estimated token count">
            <span className="text-gray-400">Tokens</span>{' '}
            <span className="font-medium text-gray-600">
              {formatTokenEstimate(metrics.tokenEstimate)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1" title="Message role distribution">
            <EventDistributionChart slices={metrics.eventSlices} size={compact ? 14 : 16} />
            <span className="text-gray-400">{metrics.totalEvents || '—'}</span>
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          data-testid="chat-pane-pin"
          aria-label={pinned ? 'Unpin conversation' : 'Pin conversation'}
          aria-pressed={pinned}
          className={`rounded p-1.5 transition-colors ${
            pinned
              ? 'text-gray-600 hover:bg-gray-100'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
          onClick={handleTogglePin}
        >
          {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
        </button>

        {hub.layoutMode !== 'single' ? (
          <button
            type="button"
            data-testid="chat-pane-expand"
            aria-label="Expand to single view"
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            onClick={handleExpand}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        ) : null}

        <button
          type="button"
          data-testid="chat-pane-close"
          aria-label="Close session and return to start"
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          onClick={handleClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
