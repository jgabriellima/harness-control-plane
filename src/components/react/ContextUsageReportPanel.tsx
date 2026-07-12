'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

import ContextUsageContentPreview from '@/components/react/ContextUsageContentPreview';
import ContextUsageSegmentedBar from '@/components/react/ContextUsageSegmentedBar';
import { ToolRow } from '@/components/react/ToolInspector';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import { useContextUsageReport } from '@/hooks/useContextUsageReport';
import { useSdkObservability, mergeToolCallsWithLiveMessages } from '@/hooks/useSdkObservability';
import {
  DEFAULT_CONTEXT_WINDOW_SIZE,
  formatContextTokenCount,
} from '@/lib/context-usage';
import type {
  ContextUsageDetailItem,
  ContextUsageSelection,
  ContextUsageSlice,
  ContextUsageSource,
} from '@/lib/context-usage-types';
import type { SdkToolCallRecord } from '@/lib/sdk-agent-observability-types';
import { sdkToolCallToToolRecord } from '@/lib/sdk-tool-call-mapper';
import { toolNamesMatch } from '@/lib/tool-name-match';

interface ContextUsageReportPanelProps {
  selection: ContextUsageSelection;
  onClose: () => void;
}

function formatInstructionScopeLabel(scope: string | undefined): string | null {
  if (!scope) {
    return null;
  }

  switch (scope) {
    case '.cursor/rules':
      return 'Rule';
    case '.cursor/memories':
      return 'Memory';
    case '.cursor/skills':
      return 'Skill';
    case '.cursor/commands':
      return 'Command';
    case '.cursor/agents':
      return 'Agent';
    case 'runtime://system_prompt':
      return 'System';
    case 'runtime://subagents':
      return 'Subagent';
    default:
      return scope.replace(/^\.cursor\//, '').replace(/^runtime:\/\//, '');
  }
}

function formatLoadContextLabel(loadContext: string | undefined): string | null {
  if (!loadContext) {
    return null;
  }

  if (loadContext === 'always_injected') {
    return 'Always injected';
  }

  if (loadContext === 'on_invocation') {
    return 'On invocation';
  }

  if (loadContext === 'runtime_injected') {
    return 'Runtime injected';
  }

  return loadContext.replace(/_/g, ' ');
}

function ContextUsageInstructionChildRow({
  child,
  source,
}: {
  child: ContextUsageDetailItem;
  source: ContextUsageSource;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(child.path || child.description || child.contentPreview || child.sdkTag);
  const scopeLabel = formatInstructionScopeLabel(child.scope);
  const loadContextLabel = formatLoadContextLabel(child.loadContext);
  const tokenPrefix =
    source === 'sdk_checkpoint' && child.tokenSource !== 'corpus_estimate' ? '' : '~';

  return (
    <div
      className="border-b border-gray-100/80 last:border-b-0"
      data-testid={`context-usage-instruction-child-${child.path ?? child.name}`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-2 py-2 text-left text-xs text-gray-600 hover:text-gray-800"
        onClick={() => {
          if (hasDetail) {
            setExpanded((current) => !current);
          }
        }}
        disabled={!hasDetail}
        aria-expanded={expanded}
      >
        {hasDetail ? (
          expanded ? (
            <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
          )
        ) : (
          <span className="mt-0.5 inline-block h-3 w-3 shrink-0" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-gray-800" title={child.name}>
              {child.name}
            </span>
            {scopeLabel ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                {scopeLabel}
              </span>
            ) : null}
          </span>
          {child.path ? (
            <span className="truncate font-mono text-[10px] text-gray-400" title={child.path}>
              {child.path}
            </span>
          ) : child.sdkTag ? (
            <span className="truncate font-mono text-[10px] text-gray-400" title={child.sdkTag}>
              {child.sdkTag}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 pt-0.5 text-gray-400">
          {tokenPrefix}
          {formatContextTokenCount(child.tokens)}
        </span>
      </button>
      {expanded && hasDetail ? (
        <div className="mb-2 ml-5 space-y-2 rounded-md border border-gray-200 bg-white px-3 py-2">
          {loadContextLabel ? (
            <p className="text-[10px] uppercase tracking-wide text-gray-400">
              Load context: <span className="font-medium text-gray-600">{loadContextLabel}</span>
            </p>
          ) : null}
          {child.description ? (
            <p className="text-[11px] leading-relaxed text-gray-600">{child.description}</p>
          ) : null}
          {child.contentPreview ? (
            <ContextUsageContentPreview
              content={child.contentPreview}
              testId={`context-usage-content-preview-${child.path ?? child.name}`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ContextUsageToolChildRow({
  child,
  invocations,
}: {
  child: ContextUsageDetailItem;
  invocations: SdkToolCallRecord[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasInvocations = invocations.length > 0;

  return (
    <div
      className="border-b border-gray-100/80 last:border-b-0"
      data-testid={`context-usage-tool-child-${child.name}`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs text-gray-600 hover:text-gray-800"
        onClick={() => {
          if (hasInvocations) {
            setExpanded((current) => !current);
          }
        }}
        disabled={!hasInvocations}
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {hasInvocations ? (
            expanded ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
            )
          ) : (
            <span className="inline-block h-3 w-3 shrink-0" />
          )}
          <span className="truncate font-medium" title={child.path ?? child.name}>
            {child.name}
          </span>
          {hasInvocations ? (
            <span className="shrink-0 rounded-full bg-gray-200/80 px-1.5 py-0.5 text-[10px] text-gray-500">
              {invocations.length}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-gray-400">{formatContextTokenCount(child.tokens)}</span>
      </button>
      {expanded && hasInvocations ? (
        <ul
          className="mb-2 ml-4 rounded-md border border-gray-200 bg-white"
          data-testid={`context-usage-tool-invocations-${child.name}`}
        >
          {invocations.map((call) => (
            <ToolRow
              key={call.callId}
              toolId={call.callId}
              tool={sdkToolCallToToolRecord(call)}
              streaming={call.status === 'running'}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ContextUsageExplorerRow({
  slice,
  expanded,
  onToggle,
  source,
  toolCalls,
}: {
  slice: ContextUsageSlice;
  expanded: boolean;
  onToggle: () => void;
  source: ContextUsageSource;
  toolCalls: SdkToolCallRecord[];
}) {
  const hasChildren = Boolean(slice.children && slice.children.length > 0);
  const hasExpandable = hasChildren || Boolean(slice.description);
  const childCount = slice.children?.length ?? 0;
  const expandableInstructionCategory =
    slice.category === 'rules' ||
    slice.category === 'skills' ||
    slice.category === 'subagent_definitions' ||
    slice.category === 'system_prompt';
  const rowLabel =
    childCount > 0 && (slice.category === 'tool_definitions' || expandableInstructionCategory)
      ? `${slice.label} (${childCount})`
      : slice.label;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50"
        onClick={hasExpandable ? onToggle : undefined}
        disabled={!hasExpandable}
        data-testid={`context-usage-row-${slice.category}`}
      >
        {hasExpandable ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          )
        ) : (
          <span className="inline-block h-3.5 w-3.5 shrink-0" />
        )}
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ backgroundColor: slice.color }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{rowLabel}</span>
        <span className="shrink-0 text-xs text-gray-500">
          {source === 'sdk_checkpoint' ? '' : '~'}
          {formatContextTokenCount(slice.tokens)}
        </span>
      </button>
      {expanded && hasExpandable ? (
        <div className="space-y-2 bg-gray-50/80 px-4 pb-3 pl-10">
          {slice.description ? (
            <p className="text-xs leading-relaxed text-gray-500">{slice.description}</p>
          ) : null}
          <div
            className="space-y-0"
            data-testid={
              slice.category === 'tool_definitions'
                ? 'context-usage-tool-children'
                : slice.category === 'rules'
                  ? 'context-usage-rule-children'
                  : undefined
            }
          >
            {slice.children?.map((child) =>
              slice.category === 'tool_definitions' ? (
                <ContextUsageToolChildRow
                  key={`${slice.category}-${child.path ?? child.name}`}
                  child={child}
                  invocations={toolCalls.filter((call) => toolNamesMatch(child.name, call.tool))}
                />
              ) : expandableInstructionCategory ? (
                <ContextUsageInstructionChildRow
                  key={`${slice.category}-${child.path ?? child.name}`}
                  child={child}
                  source={source}
                />
              ) : (
                <div
                  key={`${slice.category}-${child.path ?? child.name}`}
                  className="flex items-center justify-between gap-2 py-1 text-xs text-gray-600"
                >
                  <span className="truncate" title={child.path ?? child.name}>
                    {child.name}
                  </span>
                  <span className="shrink-0 text-gray-400">
                    {source === 'sdk_checkpoint' && child.tokenSource !== 'corpus_estimate' ? '' : '~'}
                    {formatContextTokenCount(child.tokens)}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ContextUsageReportPanel({
  selection,
  onClose,
}: ContextUsageReportPanelProps) {
  const hub = useRuntimeHub();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const conversation = hub.getConversationState(selection.conversationId);
  const messages = conversation?.messages ?? [];
  const contextUsageRevision = conversation?.contextUsageRevision ?? 0;

  const observability = useSdkObservability({
    agentId: selection.agentId,
    projectId: selection.projectId,
    conversationId: selection.conversationId,
    refreshRevision: contextUsageRevision,
  });

  const { report, loading, error: loadError } = useContextUsageReport({
    agentId: selection.agentId,
    projectId: selection.projectId,
    conversationId: selection.conversationId,
    title: selection.title,
    messages,
    refreshRevision: contextUsageRevision,
    observability,
  });

  const toolCalls = useMemo(
    () => mergeToolCallsWithLiveMessages(observability.toolCalls, messages),
    [messages, observability.toolCalls],
  );

  const toggleCategory = useCallback((category: string): void => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback((): void => {
    if (!report) {
      return;
    }
    setExpandedCategories(new Set(report.slices.map((slice) => slice.category)));
  }, [report]);

  const displayTitle = selection.title ?? 'Context Usage';

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-white"
      data-testid="context-usage-report-panel"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-gray-900">Context Usage</h2>
          <p className="truncate text-xs text-gray-500">{displayTitle}</p>
        </div>
        <button
          type="button"
          aria-label="Close context usage panel"
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          onClick={onClose}
          data-testid="context-usage-close"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadError ? (
          <p className="p-4 text-sm text-red-600" data-testid="context-usage-error">
            {loadError}
          </p>
        ) : null}

        {!report && !loadError ? (
          <p className="p-4 text-sm text-gray-500">
            {loading ? 'Loading context from SDK store…' : 'Loading context breakdown…'}
          </p>
        ) : null}

        {report ? (
          <div className="space-y-4 p-4">
            <div className="space-y-1 text-center">
              <p className="text-xs text-gray-500">
                Repository: <span className="font-medium text-gray-700">{report.repository}</span>
                {' · '}
                Context size:{' '}
                <span className="font-medium text-gray-700">
                  {formatContextTokenCount(report.contextWindowSize)}
                </span>
                {' · '}
                Tokens used:{' '}
                <span className="font-medium text-gray-700">
                  {report.source === 'sdk_checkpoint' ? '' : '~'}
                  {formatContextTokenCount(report.totalTokens)}
                </span>
              </p>
              <p className="mx-auto max-w-md text-xs leading-relaxed text-gray-400">
                The context window holds everything the agent sees — instructions, files, tools, and
                conversation history. As it fills, responses may slow down.
              </p>
            </div>

            <ContextUsageSegmentedBar
              slices={report.slices}
              contextWindowSize={report.contextWindowSize}
              totalTokens={report.totalTokens}
              percentFull={report.percentFull}
              source={report.source}
            />

            <div className="rounded-lg border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Context explorer
                </span>
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:text-gray-700"
                  onClick={expandAll}
                >
                  Expand all
                </button>
              </div>
              {report.slices.map((slice) => (
                <ContextUsageExplorerRow
                  key={slice.category}
                  slice={slice}
                  expanded={expandedCategories.has(slice.category)}
                  onToggle={() => toggleCategory(slice.category)}
                  source={report.source}
                  toolCalls={toolCalls}
                />
              ))}
            </div>

            <p className="text-center text-[10px] text-gray-400">
              {report.source === 'sdk_checkpoint'
                ? `Cursor runtime checkpoint · window ${formatContextTokenCount(report.contextWindowSize)}`
                : `Estimates via ${report.tokenizer} · window ${DEFAULT_CONTEXT_WINDOW_SIZE / 1000}K`}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
