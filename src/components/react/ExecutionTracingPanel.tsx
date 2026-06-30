import React, { useMemo } from 'react';

import {
  RUNTIME_EVENT_LABELS,
  type RuntimeEvent,
  type RuntimeEventType,
} from '../../lib/execution-events';
import RuntimeActivityStream from './RuntimeActivityStream';

interface ExecutionTracingPanelProps {
  events: RuntimeEvent[];
  startedAt: string;
  updatedAt: string;
}

interface EventTypeCount {
  type: RuntimeEventType;
  count: number;
}

function computeDurationMs(startedAt: string, updatedAt: string): number | null {
  const start = Date.parse(startedAt);
  const end = Date.parse(updatedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return Math.max(0, end - start);
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return '—';
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

export default function ExecutionTracingPanel({
  events,
  startedAt,
  updatedAt,
}: ExecutionTracingPanelProps) {
  const durationMs = computeDurationMs(startedAt, updatedAt);

  const analytics = useMemo(() => {
    const byType = new Map<RuntimeEventType, number>();
    const nodeIds = new Set<string>();
    let gateEvents = 0;
    let artifactEvents = 0;

    for (const event of events) {
      byType.set(event.type, (byType.get(event.type) ?? 0) + 1);
      if (event.nodeId) {
        nodeIds.add(event.nodeId);
      }
      if (event.type === 'gate_validation') {
        gateEvents += 1;
      }
      if (event.type === 'artifact_created') {
        artifactEvents += 1;
      }
    }

    const typeCounts: EventTypeCount[] = [...byType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count);

    return {
      totalEvents: events.length,
      uniqueNodes: nodeIds.size,
      gateEvents,
      artifactEvents,
      typeCounts,
    };
  }, [events]);

  return (
    <div className="flex flex-col gap-4" data-testid="execution-tracing-panel">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Trace Analytics</h2>
        <p className="mt-1 text-xs text-gray-500">Objective metrics derived from the execution event stream.</p>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total events</dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">{analytics.totalEvents}</dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Nodes touched</dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">{analytics.uniqueNodes}</dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Gate validations</dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">{analytics.gateEvents}</dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Wall duration</dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">{formatDuration(durationMs)}</dd>
          </div>
        </dl>

        {analytics.typeCounts.length > 0 ? (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Events by type</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {analytics.typeCounts.map(({ type, count }) => (
                <li
                  key={type}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800"
                >
                  <span>{RUNTIME_EVENT_LABELS[type]}</span>
                  <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <RuntimeActivityStream events={events} />
    </div>
  );
}
