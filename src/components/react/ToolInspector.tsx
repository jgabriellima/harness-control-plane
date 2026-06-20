'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { formatInspectable } from '@/lib/format-inspect';

export interface ToolRecord {
  name: string;
  status: string;
  args?: unknown;
  result?: unknown;
}

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
      <pre className="max-h-36 overflow-auto rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-gray-600">
        {formatted}
      </pre>
    </div>
  );
}

function ToolRow({ tool, streaming }: { tool: ToolRecord; streaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail =
    tool.args !== undefined ||
    tool.result !== undefined ||
    streaming === true;

  return (
    <li className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50/80"
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
        <span className="rounded bg-violet-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-violet-700">
          {tool.name}
        </span>
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClasses(tool.status)}`}
        >
          {tool.status}
          {streaming ? '…' : ''}
        </span>
      </button>
      {expanded && hasDetail ? (
        <div className="space-y-2 border-t border-gray-100 bg-white px-3 py-2">
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

export function ToolInspectorGroup({
  tools,
  defaultCollapsed,
}: {
  tools: Array<{ id: string; tool: ToolRecord; streaming?: boolean }>;
  defaultCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

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
        <span className="rounded-full bg-gray-200/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
          {tools.length}
        </span>
      </button>
      {!collapsed ? (
        <ul>
          {tools.map((entry) => (
            <ToolRow key={entry.id} tool={entry.tool} streaming={entry.streaming} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
