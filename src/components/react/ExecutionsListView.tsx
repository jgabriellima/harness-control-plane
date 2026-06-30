import React, { useEffect, useState } from 'react';

import { formatStatusLabel } from '../../lib/execution-events';
import type { ExecutionStatus, ExecutionSummary } from '../../lib/harness-types';
import { readStaleSidebarCache, writeSidebarCache } from '../../lib/sidebar-cache';

const EXECUTIONS_CACHE_KEY = 'executions-list';

interface ExecutionsResponse {
  executions: ExecutionSummary[];
  error?: string;
}

function statusTone(status: ExecutionStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    case 'failed':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    case 'blocked':
    case 'paused':
      return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    case 'running':
    case 'in_progress':
      return 'bg-gray-100 text-gray-700 ring-gray-200';
    default:
      return 'bg-gray-50 text-gray-600 ring-gray-500/20';
  }
}

function formatTimestamp(value: string): string {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ExecutionsListView() {
  const [executions, setExecutions] = useState<ExecutionSummary[]>(
    () => readStaleSidebarCache<ExecutionSummary[]>(EXECUTIONS_CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState(
    () => (readStaleSidebarCache<ExecutionSummary[]>(EXECUTIONS_CACHE_KEY) ?? []).length === 0,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadExecutions(): Promise<void> {
      const cached = readStaleSidebarCache<ExecutionSummary[]>(EXECUTIONS_CACHE_KEY);
      if (!cached || cached.length === 0) {
        setLoading(true);
      }

      try {
        const response = await fetch('/api/executions');
        const payload = (await response.json()) as ExecutionsResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load executions');
        }

        if (!cancelled) {
          writeSidebarCache(EXECUTIONS_CACHE_KEY, payload.executions);
          setExecutions(payload.executions);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to load executions';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadExecutions();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8" data-testid="executions-loading">
        <p className="text-sm text-gray-500">Loading runs…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8" data-testid="executions-error">
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="executions-list-view">
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <h1 className="text-2xl font-semibold text-gray-900">Workflow Runs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Execution history for the active project — select a run to inspect nodes, gates, and artifacts.
        </p>
      </header>

      <div className="flex-1 px-6 py-6">
        {executions.length === 0 ? (
          <div
            className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center"
            data-testid="executions-empty"
          >
            <p className="text-sm font-medium text-gray-700">No workflow runs yet</p>
            <p className="mt-1 text-xs text-gray-500">
              Dispatch a workflow from the runtime console or POST to /api/executions.
            </p>
          </div>
        ) : (
          <ul className="space-y-3" data-testid="executions-list">
            {executions.map((execution) => {
              const href = `/execution/${encodeURIComponent(execution.id)}`;
              return (
                <li key={execution.id}>
                  <a
                    href={href}
                    className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4 transition-colors hover:border-gray-200 hover:bg-gray-50"
                    data-testid={`execution-list-item-${execution.id}`}
                  >
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${statusTone(execution.status)}`}
                        >
                          {formatStatusLabel(execution.status)}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                          {execution.workflowId}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-sm font-medium text-gray-900 group-hover:text-gray-800">
                        {execution.intent || 'Untitled execution'}
                      </p>

                      <p className="mt-1 font-mono text-xs text-gray-500">{execution.id}</p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs text-gray-500">{formatTimestamp(execution.updatedAt)}</p>
                      <p className="mt-1 text-xs font-medium text-gray-600 opacity-0 transition-opacity group-hover:opacity-100">
                        View run
                      </p>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
