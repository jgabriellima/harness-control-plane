'use client';

import React, { useMemo } from 'react';
import { X } from 'lucide-react';

import { ToolInspectorList } from '@/components/react/ToolInspector';
import { useSdkObservability, mergeToolCallsWithLiveMessages } from '@/hooks/useSdkObservability';
import { useRuntimeConversation } from '@/hooks/useRuntimeConversation';
import { sdkToolCallToToolRecord } from '@/lib/sdk-tool-call-mapper';
import type { ToolActivitySelection } from '@/components/react/ToolActivityProvider';

interface ToolActivityReportPanelProps {
  selection: ToolActivitySelection;
  onClose: () => void;
}

function isToolStatusRunning(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'running' || normalized === 'pending' || normalized === 'in_progress';
}

export default function ToolActivityReportPanel({
  selection,
  onClose,
}: ToolActivityReportPanelProps) {
  const { state } = useRuntimeConversation(selection.conversationId);
  const liveMessages = state.messages;
  const contextUsageRevision = state.contextUsageRevision;

  const observability = useSdkObservability({
    agentId: selection.agentId,
    projectId: selection.projectId,
    conversationId: selection.conversationId,
    refreshRevision: contextUsageRevision,
  });

  const toolCalls = useMemo(
    () =>
      mergeToolCallsWithLiveMessages(observability.toolCalls, liveMessages, {
        toolActivity: state.toolActivity,
        runPhase: state.runPhase,
      }),
    [liveMessages, observability.toolCalls, state.runPhase, state.toolActivity],
  );

  const hasRunning = toolCalls.some((call) => isToolStatusRunning(call.status));
  const activeCallId =
    toolCalls.find((call) => isToolStatusRunning(call.status))?.callId ?? toolCalls[0]?.callId;

  const toolEntries = useMemo(
    () =>
      toolCalls.map((call) => ({
        id: call.callId,
        streaming: isToolStatusRunning(call.status),
        tool: sdkToolCallToToolRecord(call),
      })),
    [toolCalls],
  );

  const invocationLabel = `${toolCalls.length} invocation${toolCalls.length === 1 ? '' : 's'}`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white" data-testid="tool-activity-report-panel">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-gray-900">Activity</h2>
          <p className="truncate text-xs text-gray-500">
            {selection.title ?? 'Session'}
            {toolCalls.length > 0 ? ` · ${invocationLabel}` : ''}
            {hasRunning ? ' · live' : ''}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close activity panel"
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          onClick={onClose}
          data-testid="tool-activity-close"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {observability.error && toolCalls.length === 0 ? (
        <p className="shrink-0 px-4 py-3 text-sm text-red-600" data-testid="tool-activity-error">
          {observability.error}
        </p>
      ) : null}

      {observability.error && toolCalls.length > 0 ? (
        <p
          className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800"
          data-testid="tool-activity-warning"
        >
          {observability.error}
        </p>
      ) : null}

      {observability.loading && toolCalls.length === 0 ? (
        <p className="shrink-0 px-4 py-3 text-sm text-gray-500">Loading activity from runtime store…</p>
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
            layout="panel"
          />
          <footer className="shrink-0 border-t border-gray-100 px-4 py-2 text-center text-[10px] text-gray-400">
            Runtime agent store · {invocationLabel}
            {hasRunning ? ' · streaming via SSE' : ''}
          </footer>
        </div>
      ) : null}
    </div>
  );
}
