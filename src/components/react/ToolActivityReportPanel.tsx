'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { ToolInspectorList } from '@/components/react/ToolInspector';
import ToolActivityToolbar from '@/components/react/ToolActivityToolbar';
import { useSdkObservability, mergeToolCallsWithLiveMessages } from '@/hooks/useSdkObservability';
import { useRuntimeConversation } from '@/hooks/useRuntimeConversation';
import { sdkToolCallToToolRecord } from '@/lib/sdk-tool-call-mapper';
import {
  collectUniqueToolNames,
  DEFAULT_TOOL_ACTIVITY_FILTER,
  filterAndSortToolActivityEntries,
  isToolFilterActive,
  pruneSelectedTools,
  type ToolActivityFilterState,
} from '@/lib/tool-activity-filter';
import {
  activityPanelWarningMessage,
  logInternalActivityError,
  toUserFacingActivityErrorMessage,
} from '@/lib/user-facing-error';
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
  const [filterState, setFilterState] = useState<ToolActivityFilterState>(DEFAULT_TOOL_ACTIVITY_FILTER);

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

  const toolNames = useMemo(() => collectUniqueToolNames(toolEntries), [toolEntries]);

  const filteredToolEntries = useMemo(
    () => filterAndSortToolActivityEntries(toolEntries, filterState),
    [filterState, toolEntries],
  );

  useEffect(() => {
    const pruned = pruneSelectedTools(filterState.selectedTools, toolNames);
    if (pruned.length !== filterState.selectedTools.length) {
      setFilterState((current) => ({ ...current, selectedTools: pruned }));
    }
  }, [filterState.selectedTools, toolNames]);

  useEffect(() => {
    if (!observability.error) {
      return;
    }

    logInternalActivityError('observability', observability.error);
  }, [observability.error]);

  const activityErrorMessage = observability.error
    ? toUserFacingActivityErrorMessage(observability.error)
    : null;
  const activityWarningMessage = observability.error
    ? activityPanelWarningMessage(observability.error)
    : null;

  const invocationLabel = `${toolCalls.length} invocation${toolCalls.length === 1 ? '' : 's'}`;
  const hasActiveFilters =
    filterState.query.trim().length > 0 ||
    filterState.statusFilter !== 'all' ||
    isToolFilterActive(filterState.selectedTools);

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

      {activityErrorMessage && toolCalls.length === 0 ? (
        <div
          className="mx-4 mt-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3"
          data-testid="tool-activity-error"
          role="alert"
        >
          <p className="text-sm font-medium text-red-800">Activity unavailable</p>
          <p className="mt-1 text-sm text-red-700">{activityErrorMessage}</p>
        </div>
      ) : null}

      {activityWarningMessage && toolCalls.length > 0 ? (
        <p
          className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800"
          data-testid="tool-activity-warning"
        >
          {activityWarningMessage}
        </p>
      ) : null}

      {observability.loading && toolCalls.length === 0 ? (
        <p className="shrink-0 px-4 py-3 text-sm text-gray-500">Loading activity from runtime store…</p>
      ) : null}

      {toolCalls.length === 0 && !observability.loading && !activityErrorMessage ? (
        <p className="shrink-0 px-4 py-3 text-sm text-gray-500">No tool invocations recorded for this agent.</p>
      ) : null}

      {toolCalls.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ToolActivityToolbar
            state={filterState}
            toolNames={toolNames}
            filteredCount={filteredToolEntries.length}
            totalCount={toolEntries.length}
            onChange={setFilterState}
          />

          {filteredToolEntries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500" data-testid="tool-activity-empty-filter">
              No invocations match the current search or filters.
            </p>
          ) : (
            <ToolInspectorList
              tools={filteredToolEntries}
              activeToolId={hasRunning ? activeCallId : undefined}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              layout="panel"
            />
          )}

          <footer className="shrink-0 border-t border-gray-100 px-4 py-2 text-center text-[10px] text-gray-400">
            Runtime agent store · {hasActiveFilters ? `${filteredToolEntries.length} of ${invocationLabel}` : invocationLabel}
            {hasRunning ? ' · streaming via SSE' : ''}
          </footer>
        </div>
      ) : null}
    </div>
  );
}
