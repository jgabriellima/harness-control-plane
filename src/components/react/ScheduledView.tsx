import {
  Activity,
  Briefcase,
  Calendar,
  Filter,
  Globe,
  Loader2,
  Mail,
  MoreHorizontal,
  Pause,
  Play,
  Sun,
  Trash2,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import ChatPane from './ChatPane';
import type { ScheduleRegistry, ScheduleRegistryEntry } from '../../lib/harness-types';
import { formatCronLabel } from '../../lib/schedule-intent';
import { SCHEDULE_INTERVIEW_CONVERSATION_ID } from '../../lib/schedule-tips';

type FilterMode = 'active' | 'all' | 'paused';

interface SchedulesResponse {
  registry: ScheduleRegistry | null;
  error?: string;
}

function ScheduleIcon({ name }: { name: string }) {
  const className = 'h-4 w-4 text-gray-500';
  switch (name) {
    case 'mail':
      return <Mail className={className} aria-hidden="true" />;
    case 'globe':
      return <Globe className={className} aria-hidden="true" />;
    case 'briefcase':
      return <Briefcase className={className} aria-hidden="true" />;
    case 'activity':
      return <Activity className={className} aria-hidden="true" />;
    case 'sun':
      return <Sun className={className} aria-hidden="true" />;
    default:
      return <Calendar className={className} aria-hidden="true" />;
  }
}

function entryTitle(entry: ScheduleRegistryEntry): string {
  if (entry.title?.trim()) {
    return entry.title.trim();
  }
  if (entry.description?.trim()) {
    return entry.description.trim().slice(0, 56);
  }
  return entry.workflowId;
}

function entryDescription(entry: ScheduleRegistryEntry): string {
  if (entry.description?.trim()) {
    return entry.description.trim();
  }
  const cron = entry.trigger.schedule;
  return cron ? formatCronLabel(cron) : 'Scheduled workflow';
}

function formatNextRun(iso: string | null): string {
  if (!iso) {
    return 'Not scheduled';
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ScheduleRowMenu({
  entry,
  onToggle,
  onRunNow,
  onDelete,
}: {
  entry: ScheduleRegistryEntry;
  onToggle: () => void;
  onRunNow: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-md p-1.5 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
        aria-label={`Actions for ${entryTitle(entry)}`}
        onClick={() => setOpen((current) => !current)}
        data-testid={`schedule-menu-${entry.id}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setOpen(false);
                onToggle();
              }}
            >
              {entry.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {entry.enabled ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setOpen(false);
                onRunNow();
              }}
            >
              <Play className="h-3.5 w-3.5" />
              Run now
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ScheduleRow({
  entry,
  onToggle,
  onRunNow,
  onDelete,
}: {
  entry: ScheduleRegistryEntry;
  onToggle: () => void;
  onRunNow: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className="group flex items-start gap-4 border-b border-gray-100 px-6 py-4 transition-colors hover:bg-gray-50"
      data-testid={`schedule-item-${entry.id}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50">
        <ScheduleIcon name={entry.icon ?? 'calendar'} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{entryTitle(entry)}</p>
            <p className="mt-0.5 text-sm text-gray-500">{entryDescription(entry)}</p>
          </div>
          <ScheduleRowMenu entry={entry} onToggle={onToggle} onRunNow={onRunNow} onDelete={onDelete} />
        </div>
        <p className="mt-2 text-xs text-gray-400">
          {entry.enabled ? 'Active' : 'Paused'}
          <span className="mx-1.5">·</span>
          Next run {formatNextRun(entry.nextRunAt)}
          {entry.trigger.schedule ? (
            <>
              <span className="mx-1.5">·</span>
              {formatCronLabel(entry.trigger.schedule)}
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

export default function ScheduledView() {
  const [entries, setEntries] = useState<ScheduleRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('active');
  const [filterOpen, setFilterOpen] = useState(false);
  const [interviewConversationId, setInterviewConversationId] = useState<string>(
    SCHEDULE_INTERVIEW_CONVERSATION_ID,
  );

  useEffect(() => {
    function onPersisted(event: Event): void {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (detail?.conversationId) {
        setInterviewConversationId(detail.conversationId);
      }
    }

    window.addEventListener('runtime:schedule-interview-persisted', onPersisted);
    return () => window.removeEventListener('runtime:schedule-interview-persisted', onPersisted);
  }, []);

  const loadSchedules = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const response = await fetch('/api/schedules');
      const payload = (await response.json()) as SchedulesResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load schedules');
      }
      const list = payload.registry?.spec.entries ?? [];
      setEntries(list.filter((entry) => entry.trigger.type === 'schedule'));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load schedules';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const filteredEntries = useMemo(() => {
    if (filter === 'active') {
      return entries.filter((entry) => entry.enabled);
    }
    if (filter === 'paused') {
      return entries.filter((entry) => !entry.enabled);
    }
    return entries;
  }, [entries, filter]);

  async function patchEntry(entryId: string, enabled: boolean): Promise<void> {
    try {
      const response = await fetch(`/api/schedules/${encodeURIComponent(entryId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to update schedule');
      }
      await loadSchedules();
    } catch (patchError) {
      const message = patchError instanceof Error ? patchError.message : 'Failed to update schedule';
      setError(message);
    }
  }

  async function removeEntry(entryId: string): Promise<void> {
    if (!window.confirm('Delete this scheduled task?')) {
      return;
    }
    try {
      const response = await fetch(`/api/schedules/${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to delete schedule');
      }
      await loadSchedules();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete schedule';
      setError(message);
    }
  }

  async function triggerRunNow(entryId: string): Promise<void> {
    try {
      const response = await fetch(`/api/schedules/${encodeURIComponent(entryId)}/run-now`, {
        method: 'POST',
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to run schedule');
      }
      await loadSchedules();
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : 'Failed to run schedule';
      setError(message);
    }
  }

  const filterLabel =
    filter === 'active' ? 'Active' : filter === 'paused' ? 'Paused' : 'All';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="scheduled-view">
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Scheduled</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Use the chat composer to describe a task. The agent interviews you about scope and
              timing, then registers a scheduled workflow in the list beside it.
            </p>
          </div>

          <div className="relative">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setFilterOpen((current) => !current)}
              data-testid="schedule-filter"
            >
              <Filter className="h-4 w-4" />
              {filterLabel}
            </button>
            {filterOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="Close filter"
                  onClick={() => setFilterOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {(['active', 'paused', 'all'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`block w-full px-3 py-2 text-left text-sm capitalize hover:bg-gray-50 ${
                        filter === mode ? 'font-medium text-gray-900' : 'text-gray-600'
                      }`}
                      onClick={() => {
                        setFilter(mode);
                        setFilterOpen(false);
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <p className="shrink-0 px-6 py-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2"
        data-testid="scheduled-workspace"
      >
        <div className="min-h-0 overflow-hidden" data-testid="schedule-interview-pane">
          <ChatPane
            conversationId={interviewConversationId}
            variant="schedule"
            compact
            onScheduleRegistered={() => {
              setInterviewConversationId(SCHEDULE_INTERVIEW_CONVERSATION_ID);
              void loadSchedules();
            }}
          />
        </div>

        <section
          className="flex min-h-0 flex-col overflow-hidden border-gray-200 bg-white md:border-l"
          aria-label="Registered schedules"
          data-testid="schedule-registry-list"
        >
          <div className="shrink-0 border-b border-gray-100 px-6 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Your schedules
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading schedules…
              </div>
            ) : filteredEntries.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-500">
                No scheduled tasks yet — start the interview on the left.
              </p>
            ) : (
              <ul>
                {filteredEntries.map((entry) => (
                  <ScheduleRow
                    key={entry.id}
                    entry={entry}
                    onToggle={() => void patchEntry(entry.id, !entry.enabled)}
                    onRunNow={() => void triggerRunNow(entry.id)}
                    onDelete={() => void removeEntry(entry.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
