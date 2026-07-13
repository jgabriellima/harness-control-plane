import { formatInspectable } from '@/lib/format-inspect';
import type { ToolRecord } from '@/components/react/ToolInspector';

export type ToolActivityStatusFilter = 'all' | 'running' | 'completed' | 'failed';
export type ToolActivitySortField = 'recordedAt' | 'durationMs';
export type ToolActivitySortDirection = 'asc' | 'desc';

export interface ToolActivityFilterState {
  query: string;
  statusFilter: ToolActivityStatusFilter;
  toolFilter: string;
  sortField: ToolActivitySortField;
  sortDirection: ToolActivitySortDirection;
}

export interface ToolActivityEntry {
  id: string;
  tool: ToolRecord;
  streaming?: boolean;
}

export const DEFAULT_TOOL_ACTIVITY_FILTER: ToolActivityFilterState = {
  query: '',
  statusFilter: 'all',
  toolFilter: 'all',
  sortField: 'recordedAt',
  sortDirection: 'desc',
};

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function matchesStatusFilter(status: string, streaming: boolean | undefined, filter: ToolActivityStatusFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  const normalized = normalizeStatus(status);
  const running =
    streaming === true ||
    normalized === 'running' ||
    normalized === 'pending' ||
    normalized === 'in_progress';

  if (filter === 'running') {
    return running;
  }

  if (filter === 'completed') {
    return normalized === 'completed' || normalized === 'success';
  }

  if (filter === 'failed') {
    return normalized === 'failed' || normalized === 'error';
  }

  return true;
}

function entrySearchText(entry: ToolActivityEntry): string {
  const parts = [
    entry.tool.name,
    entry.tool.status,
    formatInspectable(entry.tool.args),
    formatInspectable(entry.tool.result),
    entry.tool.recordedAt ?? '',
    entry.tool.startedAt ?? '',
  ];

  return parts.join('\n').toLowerCase();
}

export function collectUniqueToolNames(entries: ToolActivityEntry[]): string[] {
  const names = new Set<string>();
  for (const entry of entries) {
    const trimmed = entry.tool.name.trim();
    if (trimmed.length > 0) {
      names.add(trimmed);
    }
  }

  return [...names].sort((left, right) => left.localeCompare(right));
}

export function filterAndSortToolActivityEntries(
  entries: ToolActivityEntry[],
  state: ToolActivityFilterState,
): ToolActivityEntry[] {
  const query = state.query.trim().toLowerCase();

  const filtered = entries.filter((entry) => {
    if (!matchesStatusFilter(entry.tool.status, entry.streaming, state.statusFilter)) {
      return false;
    }

    if (state.toolFilter !== 'all' && entry.tool.name !== state.toolFilter) {
      return false;
    }

    if (query.length === 0) {
      return true;
    }

    return entrySearchText(entry).includes(query);
  });

  const directionMultiplier = state.sortDirection === 'asc' ? 1 : -1;

  return filtered.sort((left, right) => {
    if (state.sortField === 'durationMs') {
      const leftDuration = left.tool.durationMs ?? -1;
      const rightDuration = right.tool.durationMs ?? -1;
      if (leftDuration !== rightDuration) {
        return (leftDuration - rightDuration) * directionMultiplier;
      }
    }

    const leftTimestamp = left.tool.recordedAt ?? left.tool.startedAt ?? '';
    const rightTimestamp = right.tool.recordedAt ?? right.tool.startedAt ?? '';
    return leftTimestamp.localeCompare(rightTimestamp) * directionMultiplier;
  });
}
