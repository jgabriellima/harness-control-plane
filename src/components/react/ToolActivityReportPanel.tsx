'use client';

import React, { useMemo } from 'react';
import { X } from 'lucide-react';

import { ToolInspectorList } from '@/components/react/ToolInspector';
import { useSdkObservability, mergeToolCallsWithLiveMessages } from '@/hooks/useSdkObservability';
import { sdkToolCallToToolRecord } from '@/lib/sdk-tool-call-mapper';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import type { ToolActivitySelection } from '@/components/react/ToolActivityProvider';

interface ToolActivityReportPanelProps {
  selection: ToolActivitySelection;
  onClose: () => void;
}

export default function ToolActivityReportPanel({
  selection,
  onClose,
}: ToolActivityReportPanelProps) {
  const hub = useRuntimeHub();
  const conversation = hub.getConversationState(selection.conversationId);
  const contextUsageRevision = conversation?.contextUsageRevision ?? 0;
  const liveMessages = conversation?.messages ?? [];

  const observability = useSdkObservability({
    agentId: selection.agentId,
    projectId: selection.projectId,
    conversationId: selection.conversationId,
    refreshRevision: contextUsageRevision,
  });

  const toolCalls = useMemo(
    () => mergeToolCallsWithLiveMessages(observability.toolCalls, liveMessages),
    [liveMessages, observability.toolCalls],
  );

  const hasRunning = toolCalls.some((call) => call.status === 'running');
  const activeCallId = toolCalls.find((call) => call.status === 'running')?.callId ?? toolCalls[0]?.callId;

  const toolEntries = useMemo(
    () =>
      toolCalls.map((call) => ({
        id: call.callId,
        streaming: call.status === 'running',
        tool: sdkToolCallToToolRecord(call),
      })),
    [toolCalls],
  );

  const invocationLabel = `${toolCalls.length} invocation${toolCalls.length === 1 ? '' : 's'}`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white" data-testid="tool-activity-report-panel">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-gray-900">Tool Activity</h2>
          <p className="truncate text-xs text-gray-500">
            {selection.title ?? 'Session'}
            {toolCalls.length > 0 ? ` · ${invocationLabel}` : ''}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close tool activity panel"
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          onClick={onClose}
          data-testid="tool-activity-close"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {observability.error ? (
        <p className="shrink-0 px-4 py-3 text-sm text-red-600" data-testid="tool-activity-error">
          {observability.error}
        </p>
      ) : null}

      {observability.loading && toolCalls.length === 0 ? (
        <p className="shrink-0 px-4 py-3 text-sm text-gray-500">Loading tool activity from SDK store…</p>
      ) : null}

      {toolCalls.length === 0 && !observability.loading && !observability.error ? (
        <p className="shrink-0 px-4 py-3 text-sm text-gray-500">No tool invocations recorded for this agent.</p>
      ) : null}

      {toolCalls.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ToolInspectorList
            tools={toolEntries}
            activeToolId={hasRunning ? activeCallId : undefined}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          />
          <footer className="shrink-0 border-t border-gray-100 px-4 py-2 text-center text-[10px] text-gray-400">
            Cursor SDK agent store · {invocationLabel}
          </footer>
        </div>
      ) : null}
    </div>
  );
}
