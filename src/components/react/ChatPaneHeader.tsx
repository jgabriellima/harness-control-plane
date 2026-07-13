'use client';

import React, { useState } from 'react';
import { BarChart3, Maximize2, Pin, PinOff, Wrench, X } from 'lucide-react';

import ContextUsageBar from '@/components/react/ContextUsageBar';
import { useChatArtifact } from '@/components/react/ChatArtifactProvider';
import { useContextUsage } from '@/components/react/ContextUsageProvider';
import { useRuntimeComputerUse } from '@/components/react/RuntimeComputerUseProvider';
import { useToolActivity } from '@/components/react/ToolActivityProvider';
import type { ContextUsageReport } from '@/lib/context-usage-types';
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
  projectId?: string;
  contextUsageEnabled?: boolean;
  contextUsageReport?: ContextUsageReport | null;
  contextUsageLoading?: boolean;
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
  messages: _messages,
  projectId = 'default',
  contextUsageEnabled = true,
  contextUsageReport = null,
  contextUsageLoading = false,
  compact = false,
  paneIndex,
}: ChatPaneHeaderProps) {
  const hub = useRuntimeHub();
  const contextUsage = useContextUsage();
  const toolActivity = useToolActivity();
  const { closeArtifact } = useChatArtifact();
  const { closePreview: closeComputerUsePreview } = useRuntimeComputerUse();
  const [pinned, setPinned] = useState(() => isConversationPinned(conversationId));

  const agentId = hub.getConversationState(conversationId)?.agentId ?? null;
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

  function handleOpenContextUsage(): void {
    toolActivity.closeToolActivityReport();
    closeArtifact();
    void closeComputerUsePreview();
    contextUsage.openContextReport(conversationId, projectId, title, agentId);
  }

  function handleOpenToolActivity(): void {
    contextUsage.closeContextReport();
    closeArtifact();
    void closeComputerUsePreview();
    toolActivity.openToolActivityReport(conversationId, projectId, title, agentId);
  }

  const contextReportOpen =
    contextUsage.selection?.conversationId === conversationId;
  const toolActivityOpen =
    toolActivity.selection?.conversationId === conversationId;

  return (
    <header
      className={`flex w-full min-w-0 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-gray-200 bg-white ${
        compact ? 'px-3 py-2' : 'px-4 py-2.5'
      }`}
      data-testid="chat-pane-header"
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-baseline gap-2 overflow-hidden">
          <h2
            className={`min-w-0 flex-1 truncate font-medium text-gray-900 ${compact ? 'text-xs' : 'text-sm'}`}
            data-testid="chat-pane-header-title"
            title={displayTitle}
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

        {contextUsageEnabled ? (
          <div
            className="mt-1 flex min-w-0 w-full items-center text-[10px] text-gray-500"
            data-testid="chat-pane-header-metrics"
          >
            <ContextUsageBar
              report={contextUsageReport}
              loading={contextUsageLoading}
              compact={compact}
              active={contextReportOpen}
              onOpen={handleOpenContextUsage}
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {contextUsageEnabled ? (
          <button
            type="button"
            data-testid="chat-pane-context-usage"
            aria-label="Open context usage report"
            aria-pressed={contextReportOpen}
            title="Context usage"
            className={`rounded p-1.5 transition-colors ${
              contextReportOpen
                ? 'bg-gray-100 text-gray-700'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
            onClick={handleOpenContextUsage}
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </button>
        ) : null}

        <button
          type="button"
          data-testid="chat-pane-tool-activity"
          aria-label="Open activity report"
          aria-pressed={toolActivityOpen}
          title="Activity"
          className={`rounded p-1.5 transition-colors ${
            toolActivityOpen
              ? 'bg-gray-100 text-gray-700'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
          onClick={handleOpenToolActivity}
        >
          <Wrench className="h-3.5 w-3.5" />
        </button>

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
