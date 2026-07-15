import { formatInspectable } from '@/lib/format-inspect';
import type { ToolRecord } from '@/components/react/ToolInspector';

export type ToolActivityStatusFilter = 'all' | 'running' | 'completed' | 'failed';
export type ToolActivitySortField = 'recordedAt' | 'durationMs';
export type ToolActivitySortDirection = 'asc' | 'desc';

export interface ToolActivityFilterState {
  query: string;
  statusFilter: ToolActivityStatusFilter;
  /** Empty array means all tools (no tool filter). */
  selectedTools: string[];
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
  selectedTools: [],
  sortField: 'recordedAt',
  sortDirection: 'desc',
};

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function toolNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function isToolFilterActive(selectedTools: string[]): boolean {
  return selectedTools.length > 0;
}

export function isToolSelected(
  toolName: string,
  toolNames: string[],
  selectedTools: string[],
): boolean {
  if (selectedTools.length === 0) {
    return true;
  }

  const key = toolNameKey(toolName);
  return selectedTools.some((entry) => toolNameKey(entry) === key);
}

export function toggleToolSelection(
  toolName: string,
  toolNames: string[],
  selectedTools: string[],
): string[] {
  const key = toolNameKey(toolName);

  if (selectedTools.length === 0) {
    return toolNames.filter((entry) => toolNameKey(entry) !== key);
  }

  const currentlySelected = selectedTools.some((entry) => toolNameKey(entry) === key);
  if (currentlySelected) {
    return selectedTools.filter((entry) => toolNameKey(entry) !== key);
  }

  const next = [...selectedTools, toolName];
  const allSelected = toolNames.every((entry) =>
    next.some((selected) => toolNameKey(selected) === toolNameKey(entry)),
  );

  return allSelected ? [] : next;
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

function matchesSelectedTools(toolName: string, selectedTools: string[]): boolean {
  if (selectedTools.length === 0) {
    return true;
  }

  const key = toolNameKey(toolName);
  return selectedTools.some((entry) => toolNameKey(entry) === key);
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
  const byKey = new Map<string, string>();
  for (const entry of entries) {
    const trimmed = entry.tool.name.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const key = toolNameKey(trimmed);
    if (!byKey.has(key)) {
      byKey.set(key, trimmed);
    }
  }

  return [...byKey.values()].sort((left, right) => left.localeCompare(right));
}

export function pruneSelectedTools(selectedTools: string[], toolNames: string[]): string[] {
  if (selectedTools.length === 0) {
    return selectedTools;
  }

  const available = new Set(toolNames.map((name) => toolNameKey(name)));
  const pruned = selectedTools.filter((name) => available.has(toolNameKey(name)));

  if (pruned.length === 0) {
    return [];
  }

  const allSelected = toolNames.every((name) =>
    pruned.some((selected) => toolNameKey(selected) === toolNameKey(name)),
  );

  return allSelected ? [] : pruned;
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

    if (!matchesSelectedTools(entry.tool.name, state.selectedTools)) {
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
