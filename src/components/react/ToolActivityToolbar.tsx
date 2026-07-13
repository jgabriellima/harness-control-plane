'use client';

import React from 'react';
import { ArrowDownUp, Search } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ToolActivityFilterState,
  ToolActivitySortDirection,
  ToolActivitySortField,
  ToolActivityStatusFilter,
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

function parseSortValue(value: string): Pick<ToolActivityFilterState, 'sortField' | 'sortDirection'> {
  const [sortField, sortDirection] = value.split(':') as [ToolActivitySortField, ToolActivitySortDirection];
  return { sortField, sortDirection };
}

export default function ToolActivityToolbar({
  state,
  toolNames,
  filteredCount,
  totalCount,
  onChange,
}: ToolActivityToolbarProps) {
  const sortValue = `${state.sortField}:${state.sortDirection}`;

  return (
    <div
      className="shrink-0 space-y-2 border-b border-gray-100 bg-gray-50/60 px-3 py-2.5"
      data-testid="tool-activity-toolbar"
    >
      <label className="relative block">
        <span className="sr-only">Search activity</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={state.query}
          onChange={(event) => onChange({ ...state, query: event.target.value })}
          placeholder="Search tools, input, or output"
          className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
          data-testid="tool-activity-search"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={state.statusFilter}
          onValueChange={(value) =>
            onChange({ ...state, statusFilter: value as ToolActivityStatusFilter })
          }
        >
          <SelectTrigger
            className="h-7 min-w-[7.5rem] flex-1 text-xs"
            aria-label="Filter by status"
            data-testid="tool-activity-status-filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={state.toolFilter}
          onValueChange={(value) => onChange({ ...state, toolFilter: value })}
        >
          <SelectTrigger
            className="h-7 min-w-[7.5rem] flex-1 text-xs"
            aria-label="Filter by tool"
            data-testid="tool-activity-tool-filter"
          >
            <SelectValue placeholder="All tools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tools</SelectItem>
            {toolNames.map((toolName) => (
              <SelectItem key={toolName} value={toolName}>
                {toolName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sortValue}
          onValueChange={(value) => onChange({ ...state, ...parseSortValue(value) })}
        >
          <SelectTrigger
            className="h-7 min-w-[8.5rem] flex-1 text-xs"
            aria-label="Sort activity"
            data-testid="tool-activity-sort"
          >
            <span className="inline-flex items-center gap-1.5">
              <ArrowDownUp className="h-3 w-3 shrink-0 text-gray-400" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {state.query.trim().length > 0 ||
      state.statusFilter !== 'all' ||
      state.toolFilter !== 'all' ? (
        <p className="text-[10px] text-gray-500" data-testid="tool-activity-filter-summary">
          Showing {filteredCount} of {totalCount} invocation{totalCount === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}
