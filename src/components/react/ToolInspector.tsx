'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import JsonInspectPre from '@/components/react/JsonInspectPre';
import { formatContextTokenCount } from '@/lib/context-usage';
import { formatInspectable } from '@/lib/format-inspect';
import { formatRecordedAt } from '@/lib/format-recorded-at';
import { formatToolDuration } from '@/lib/format-tool-duration';

export interface ToolRecord {
  name: string;
  status: string;
  args?: unknown;
  result?: unknown;
  startedAt?: string;
  recordedAt?: string;
  durationMs?: number;
  tokenEstimate?: number;
}

export type ToolInspectorLayout = 'grouped' | 'panel';

function statusClasses(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'completed' || normalized === 'success') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }
  if (normalized === 'running' || normalized === 'pending') {
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
  if (normalized === 'failed' || normalized === 'error') {
    return 'bg-red-50 text-red-700 ring-red-200';
  }
  return 'bg-gray-100 text-gray-600 ring-gray-200';
}

function InspectBlock({ label, value }: { label: string; value: unknown }) {
  const formatted = formatInspectable(value);
  if (formatted.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <JsonInspectPre
        text={formatted}
        testId={`tool-inspect-${label.toLowerCase()}`}
      />
    </div>
  );
}

export function ToolRow({
  tool,
  streaming,
  toolId,
  active,
  layout = 'grouped',
}: {
  tool: ToolRecord;
  streaming?: boolean;
  toolId: string;
  active?: boolean;
  layout?: ToolInspectorLayout;
}) {
  const [expanded, setExpanded] = useState(active === true);
  const hasDetail =
    tool.args !== undefined ||
    tool.result !== undefined ||
    streaming === true;

  React.useEffect(() => {
    if (active) {
      setExpanded(true);
    }
  }, [active]);
  const formattedAt = formatRecordedAt(tool.recordedAt ?? tool.startedAt);
  const formattedDuration = formatToolDuration(tool.durationMs);
  const formattedTokens =
    tool.tokenEstimate !== undefined && tool.tokenEstimate > 0
      ? formatContextTokenCount(tool.tokenEstimate)
      : null;
  const rowShellClass =
    layout === 'panel'
      ? 'shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm'
      : 'border-b border-gray-100 last:border-b-0';

  return (
    <li
      className={rowShellClass}
      data-tool-row-id={toolId}
      data-testid={`tool-row-${toolId}`}
    >
      <button
        type="button"
        className={
          layout === 'panel'
            ? 'flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50/80'
            : 'flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50/80'
        }
        onClick={() => {
          if (hasDetail) {
            setExpanded((current) => !current);
          }
        }}
        aria-expanded={expanded}
        disabled={!hasDetail}
      >
        {hasDetail ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
          )
        ) : (
          <span className="inline-block h-3 w-3 shrink-0" />
        )}
        {layout === 'panel' ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
            {formattedAt ? (
              <time
                dateTime={tool.recordedAt ?? tool.startedAt}
                className="shrink-0 tabular-nums text-[10px] text-gray-400"
                data-testid="tool-row-timestamp"
                title={formattedAt}
              >
                {formattedAt}
              </time>
            ) : (
              <span className="shrink-0 text-[10px] text-gray-300" aria-hidden>
                —
              </span>
            )}
            <span className="min-w-0 truncate rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-gray-700">
              {tool.name}
            </span>
            {formattedTokens ? (
              <span
                className="shrink-0 tabular-nums text-[10px] text-gray-400"
                data-testid="tool-row-tokens"
                title="Estimated payload tokens (input + output)"
              >
                {formattedTokens} tok
              </span>
            ) : null}
            {formattedDuration ? (
              <span
                className="shrink-0 tabular-nums text-[10px] text-gray-400"
                data-testid="tool-row-duration"
              >
                {formattedDuration}
              </span>
            ) : null}
          </div>
        ) : (
        <div className="grid min-w-0 flex-1 grid-cols-[13rem_minmax(0,1fr)_auto_auto] items-center gap-x-2">
          {formattedAt ? (
            <time
              dateTime={tool.recordedAt ?? tool.startedAt}
              className="shrink-0 truncate tabular-nums text-[10px] text-gray-400"
              data-testid="tool-row-timestamp"
              title={formattedAt}
            >
              {formattedAt}
            </time>
          ) : (
            <span className="shrink-0 text-[10px] text-gray-300" aria-hidden>
              —
            </span>
          )}
          <span className="min-w-0 truncate rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-gray-700">
            {tool.name}
          </span>
          {formattedTokens ? (
            <span
              className="shrink-0 tabular-nums text-[10px] text-gray-400"
              data-testid="tool-row-tokens"
              title="Estimated payload tokens (input + output)"
            >
              {formattedTokens} tok
            </span>
          ) : (
            <span aria-hidden />
          )}
          {formattedDuration ? (
            <span
              className="shrink-0 tabular-nums text-[10px] text-gray-400"
              data-testid="tool-row-duration"
            >
              {formattedDuration}
            </span>
          ) : (
            <span aria-hidden />
          )}
        </div>
        )}
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClasses(tool.status)}`}
        >
          {tool.status}
          {streaming ? '…' : ''}
        </span>
      </button>
      {expanded && hasDetail ? (
        <div
          className={
            layout === 'panel'
              ? 'space-y-2 border-t border-gray-100 bg-gray-50/40 px-3 py-2'
              : 'space-y-2 border-t border-gray-100 bg-white px-3 py-2'
          }
        >
          <InspectBlock label="Input" value={tool.args} />
          <InspectBlock label="Output" value={tool.result} />
          {streaming && tool.result === undefined && tool.args === undefined ? (
            <p className="text-[11px] text-gray-400">Waiting for tool payload…</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ToolInspectorList({
  tools,
  activeToolId,
  className,
  layout = 'grouped',
}: {
  tools: Array<{ id: string; tool: ToolRecord; streaming?: boolean }>;
  activeToolId?: string;
  className?: string;
  layout?: ToolInspectorLayout;
}) {
  const listClassName =
    layout === 'panel'
      ? ['space-y-2 px-3 py-3', className].filter(Boolean).join(' ')
      : className ?? 'overflow-y-auto overscroll-contain';

  return (
    <ul className={listClassName} data-testid="tool-activity-list">
      {tools.map((entry) => (
        <ToolRow
          key={entry.id}
          toolId={entry.id}
          tool={entry.tool}
          streaming={entry.streaming}
          active={entry.id === activeToolId}
          layout={layout}
        />
      ))}
    </ul>
  );
}

export function ToolInspectorGroup({
  tools,
  defaultCollapsed,
  groupRecordedAt,
  activeToolId,
}: {
  tools: Array<{ id: string; tool: ToolRecord; streaming?: boolean }>;
  defaultCollapsed: boolean;
  groupRecordedAt?: string;
  activeToolId?: string;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const headerTimestamp =
    formatRecordedAt(groupRecordedAt) ??
    formatRecordedAt(tools.find((entry) => entry.tool.recordedAt)?.tool.recordedAt);

  React.useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  return (
    <div
      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
      data-testid="agent-tool-group"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-100/80"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}
        <span>Tool activity</span>
        {headerTimestamp ? (
          <time
            dateTime={groupRecordedAt ?? tools.find((entry) => entry.tool.recordedAt)?.tool.recordedAt}
            className="text-[10px] font-normal text-gray-400"
            data-testid="tool-group-timestamp"
          >
            {headerTimestamp}
          </time>
        ) : null}
        <span className="ml-auto rounded-full bg-gray-200/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
          {tools.length}
        </span>
      </button>
      {!collapsed ? (
        <ToolInspectorList
          tools={tools}
          activeToolId={activeToolId}
          className="max-h-80 overflow-y-auto overscroll-contain"
        />
      ) : null}
    </div>
  );
}
