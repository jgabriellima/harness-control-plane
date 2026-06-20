import React, { useEffect, useState } from 'react';

import { formatStatusLabel } from '../../lib/execution-events';
import type { ObservabilityMetrics } from '../../lib/observability-metrics';
import type { ExecutionStatus } from '../../lib/harness-types';

interface MetricsResponse extends ObservabilityMetrics {
  error?: string;
}

function statusTone(status: ExecutionStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'bg-red-50 text-red-700';
    case 'blocked':
    case 'paused':
      return 'bg-amber-50 text-amber-700';
    case 'running':
    case 'in_progress':
      return 'bg-violet-50 text-violet-700';
    default:
      return 'bg-gray-50 text-gray-600';
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) {
    return '—';
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white px-4 py-4" data-testid={`metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </article>
  );
}

export default function DashboardView() {
  const [metrics, setMetrics] = useState<ObservabilityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMetrics(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/observability/metrics');
        const payload = (await response.json()) as MetricsResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load metrics');
        }

        if (!cancelled) {
          setMetrics(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to load metrics';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMetrics();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8" data-testid="dashboard-view-loading">
        <p className="text-sm text-gray-500">Loading observability metrics…</p>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="flex flex-1 items-center justify-center p-8" data-testid="dashboard-view-error">
        <p className="text-sm text-red-600" role="alert">
          {error ?? 'Metrics unavailable'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6" data-testid="dashboard-view">
      <header className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Observability</p>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">Execution Dashboard</h1>
        <p className="mt-2 text-sm text-gray-500">
          Ledger-derived metrics — updated {new Date(metrics.generatedAt).toLocaleString()}
          {metrics.readinessOverall ? ` — readiness ${metrics.readinessOverall}` : ''}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Running" value={metrics.runningExecutions} />
        <MetricCard label="Queued" value={metrics.queuedExecutions} />
        <MetricCard label="Failed" value={metrics.failedExecutions} />
        <MetricCard label="Completed" value={metrics.completedExecutions} />
        <MetricCard label="Blocked" value={metrics.blockedExecutions} />
        <MetricCard label="Total Executions" value={metrics.totalExecutions} />
        <MetricCard label="Avg Duration" value={formatDuration(metrics.averageDurationMs)} />
        <MetricCard
          label="Artifact Rate"
          value={metrics.artifactGenerationRate}
          hint="artifacts per completed execution"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <header className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Recent executions</h2>
        </header>
        {metrics.recentExecutions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No executions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {metrics.recentExecutions.map((execution) => (
              <li key={execution.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <a
                    href={`/execution/${encodeURIComponent(execution.id)}`}
                    className="truncate text-sm font-medium text-gray-900 hover:text-violet-700"
                  >
                    {execution.objective || execution.id}
                  </a>
                  <p className="font-mono text-[10px] text-gray-400">{execution.id}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(execution.status)}`}>
                  {formatStatusLabel(execution.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
