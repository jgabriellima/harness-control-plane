import React, { useMemo, useState } from 'react';

import {
  RUNTIME_EVENT_LABELS,
  type RuntimeEvent,
  type RuntimeEventType,
} from '../../lib/execution-events';

interface RuntimeActivityStreamProps {
  events: RuntimeEvent[];
}

const EVENT_TYPES: RuntimeEventType[] = [
  'execution_started',
  'node_started',
  'node_completed',
  'tool_call',
  'tool_result',
  'artifact_created',
  'gate_validation',
  'execution_completed',
  'execution_failed',
];

function eventTone(type: RuntimeEventType): string {
  switch (type) {
    case 'execution_started':
    case 'execution_completed':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'execution_failed':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'node_started':
    case 'node_completed':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'tool_call':
    case 'tool_result':
      return 'border-cyan-200 bg-cyan-50 text-cyan-700';
    case 'artifact_created':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'gate_validation':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700';
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function RuntimeActivityStream({ events }: RuntimeActivityStreamProps) {
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<RuntimeEventType>>(new Set(EVENT_TYPES));
  const [collapsed, setCollapsed] = useState(false);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return events.filter((event) => {
      if (!activeFilters.has(event.type)) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        event.label,
        event.detail ?? '',
        event.nodeId ?? '',
        event.source,
        RUNTIME_EVENT_LABELS[event.type],
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [activeFilters, events, search]);

  function toggleFilter(type: RuntimeEventType): void {
    setActiveFilters((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
      data-testid="runtime-activity-stream"
    >
      <header className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Runtime Activity</h2>
            <p className="text-xs text-gray-500">
              {filteredEvents.length} of {events.length} events
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>

        {!collapsed ? (
          <div className="mt-3 space-y-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />

            <div className="flex flex-wrap gap-1.5">
              {EVENT_TYPES.map((type) => {
                const active = activeFilters.has(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleFilter(type)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {RUNTIME_EVENT_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </header>

      {!collapsed ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {filteredEvents.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No runtime events match the current filters.</p>
          ) : (
            <ol className="space-y-2">
              {filteredEvents.map((event) => (
                <li
                  key={event.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                  data-testid={`runtime-event-${event.type}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${eventTone(event.type)}`}
                        >
                          {RUNTIME_EVENT_LABELS[event.type]}
                        </span>
                        {event.nodeId ? (
                          <span className="font-mono text-[10px] text-gray-400">{event.nodeId}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-medium text-gray-900">{event.label}</p>
                      {event.detail ? (
                        <p className="mt-0.5 text-sm text-gray-600">{event.detail}</p>
                      ) : null}
                    </div>
                    <time className="shrink-0 font-mono text-[11px] text-gray-400">
                      {formatTimestamp(event.timestamp)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
