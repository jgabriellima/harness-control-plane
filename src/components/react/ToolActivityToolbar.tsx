'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, ListFilter, Search, Terminal } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  isToolFilterActive,
  isToolSelected,
  toggleToolSelection,
  type ToolActivityFilterState,
  type ToolActivitySortDirection,
  type ToolActivitySortField,
  type ToolActivityStatusFilter,
} from '@/lib/tool-activity-filter';

interface ToolActivityToolbarProps {
  state: ToolActivityFilterState;
  toolNames: string[];
  filteredCount: number;
  totalCount: number;
  onChange: (next: ToolActivityFilterState) => void;
}

const STATUS_OPTIONS: Array<{ value: ToolActivityStatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

const SORT_OPTIONS: Array<{ value: `${ToolActivitySortField}:${ToolActivitySortDirection}`; label: string }> = [
  { value: 'recordedAt:desc', label: 'Newest first' },
  { value: 'recordedAt:asc', label: 'Oldest first' },
  { value: 'durationMs:desc', label: 'Longest duration' },
  { value: 'durationMs:asc', label: 'Shortest duration' },
];

const ICON_TRIGGER_CLASS =
  'h-7 w-7 shrink-0 justify-center gap-0 p-0 shadow-none [&>span]:!hidden [&>svg:last-child]:hidden';

function parseSortValue(value: string): Pick<ToolActivityFilterState, 'sortField' | 'sortDirection'> {
  const [sortField, sortDirection] = value.split(':') as [ToolActivitySortField, ToolActivitySortDirection];
  return { sortField, sortDirection };
}

function ToolFilterMenu({
  toolNames,
  selectedTools,
  onChange,
}: {
  toolNames: string[];
  selectedTools: string[];
  onChange: (selectedTools: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = isToolFilterActive(selectedTools);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 ${
          active ? 'border-gray-300 bg-gray-100' : ''
        }`}
        aria-label="Filter by tool"
        aria-expanded={open}
        title={
          active
            ? `${selectedTools.length} tool${selectedTools.length === 1 ? '' : 's'} selected`
            : 'Filter by tool'
        }
        data-testid="tool-activity-tool-filter"
        onClick={() => setOpen((current) => !current)}
      >
        <Terminal className="h-3.5 w-3.5" aria-hidden />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-1 w-52 overflow-hidden rounded-md border border-gray-200 bg-white shadow-md"
          data-testid="tool-activity-tool-filter-menu"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-2.5 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Tools</span>
            <button
              type="button"
              className="text-[10px] font-medium text-gray-500 hover:text-gray-800"
              onClick={() => onChange([])}
            >
              Show all
            </button>
          </div>

          <ul className="max-h-56 overflow-y-auto overscroll-contain py-1">
            {toolNames.length === 0 ? (
              <li className="px-2.5 py-2 text-xs text-gray-400">No tools recorded</li>
            ) : (
              toolNames.map((toolName) => {
                const checked = isToolSelected(toolName, toolNames, selectedTools);
                return (
                  <li key={toolName}>
                    <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-gray-50">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-300"
                        checked={checked}
                        onChange={() => onChange(toggleToolSelection(toolName, toolNames, selectedTools))}
                        data-testid={`tool-activity-tool-option-${toolName}`}
                      />
                      <span className="min-w-0 truncate font-mono text-gray-700">{toolName}</span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function ToolActivityToolbar({
  state,
  toolNames,
  filteredCount,
  totalCount,
  onChange,
}: ToolActivityToolbarProps) {
  const sortValue = `${state.sortField}:${state.sortDirection}`;
  const hasActiveFilters =
    state.query.trim().length > 0 ||
    state.statusFilter !== 'all' ||
    isToolFilterActive(state.selectedTools);

  return (
    <div
      className="shrink-0 border-b border-gray-100 bg-gray-50/60 px-3 py-2"
      data-testid="tool-activity-toolbar"
    >
      <div className="flex items-center gap-1.5">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search activity</span>
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={state.query}
            onChange={(event) => onChange({ ...state, query: event.target.value })}
            placeholder="Search tools, input, or output"
            className="h-7 w-full rounded-md border border-gray-200 bg-white py-0 pl-7 pr-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
            data-testid="tool-activity-search"
          />
        </label>

        <Select
          value={state.statusFilter}
          onValueChange={(value) =>
            onChange({ ...state, statusFilter: value as ToolActivityStatusFilter })
          }
        >
          <SelectTrigger
            className={`${ICON_TRIGGER_CLASS} ${
              state.statusFilter !== 'all' ? 'border-gray-300 bg-gray-100' : ''
            }`}
            aria-label="Filter by status"
            title="Filter by status"
            data-testid="tool-activity-status-filter"
          >
            <ListFilter className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
          </SelectTrigger>
          <SelectContent align="end">
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ToolFilterMenu
          toolNames={toolNames}
          selectedTools={state.selectedTools}
          onChange={(selectedTools) => onChange({ ...state, selectedTools })}
        />

        <Select
          value={sortValue}
          onValueChange={(value) => onChange({ ...state, ...parseSortValue(value) })}
        >
          <SelectTrigger
            className={ICON_TRIGGER_CLASS}
            aria-label="Sort activity"
            title="Sort activity"
            data-testid="tool-activity-sort"
          >
            <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
          </SelectTrigger>
          <SelectContent align="end">
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters ? (
        <p className="mt-1.5 text-[10px] leading-none text-gray-500" data-testid="tool-activity-filter-summary">
          Showing {filteredCount} of {totalCount} invocation{totalCount === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}
