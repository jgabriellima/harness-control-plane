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
  Plus,
  Sun,
  Trash2,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import type { ScheduleRegistry, ScheduleRegistryEntry } from '../../lib/harness-types';
import {
  SCHEDULE_PRESETS,
  formatCronLabel,
  parseScheduleIntent,
} from '../../lib/schedule-intent';

type FilterMode = 'active' | 'all' | 'paused';

interface SchedulesResponse {
  registry: ScheduleRegistry | null;
  error?: string;
}

interface CreateScheduleResponse {
  needsSchedule?: boolean;
  draft?: {
    title: string;
    description: string;
    icon: string;
  };
  entry?: ScheduleRegistryEntry;
  error?: string;
}

interface PendingDraft {
  title: string;
  description: string;
  icon: string;
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
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('active');
  const [filterOpen, setFilterOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);
  const [customCron, setCustomCron] = useState('');

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

  async function createSchedule(description: string, cron: string): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, cron }),
      });
      const payload = (await response.json()) as CreateScheduleResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to create schedule');
      }
      if (payload.needsSchedule && payload.draft) {
        setPendingDraft(payload.draft);
        return;
      }
      setInput('');
      setPendingDraft(null);
      setCustomCron('');
      await loadSchedules();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to create schedule';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || submitting) {
      return;
    }
    const parsed = parseScheduleIntent(trimmed);
    if (parsed.cron) {
      await createSchedule(trimmed, parsed.cron);
      return;
    }
    await createSchedule(trimmed, '');
  }

  async function confirmPendingSchedule(cron: string): Promise<void> {
    if (!pendingDraft || !cron.trim()) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: pendingDraft.title,
          description: pendingDraft.description,
          icon: pendingDraft.icon,
          cron: cron.trim(),
        }),
      });
      const payload = (await response.json()) as CreateScheduleResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to create schedule');
      }
      setInput('');
      setPendingDraft(null);
      setCustomCron('');
      await loadSchedules();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to create schedule';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

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
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Scheduled</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Describe a task to create a scheduled workflow. If you do not specify when it should
              run, you will be asked to choose a schedule.
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

      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <form onSubmit={(event) => void handleSubmit(event)} className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 focus-within:border-gray-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-gray-200">
            <Plus className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Schedule a task"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              data-testid="schedule-composer-input"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={submitting || input.trim().length === 0}
              className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
              data-testid="schedule-composer-submit"
            >
              {submitting ? 'Saving…' : 'Schedule'}
            </button>
          </div>
        </form>

        {pendingDraft ? (
          <div
            className="mx-auto mt-4 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-4"
            data-testid="schedule-timing-prompt"
          >
            <p className="text-sm font-medium text-gray-900">When should this run?</p>
            <p className="mt-1 text-sm text-gray-600">{pendingDraft.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SCHEDULE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={submitting}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => void confirmPendingSchedule(preset.cron)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={customCron}
                onChange={(event) => setCustomCron(event.target.value)}
                placeholder="Custom cron (e.g. 0 9 * * 1-5)"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
                data-testid="schedule-custom-cron"
              />
              <button
                type="button"
                disabled={submitting || customCron.trim().length === 0}
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                onClick={() => void confirmPendingSchedule(customCron)}
              >
                Confirm
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                onClick={() => setPendingDraft(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="px-6 py-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading schedules…
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <Calendar className="h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="mt-4 text-sm font-medium text-gray-900">No scheduled tasks yet</p>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Describe what you want automated — email monitoring, research digests, recurring
              reports — and pick when it should run.
            </p>
          </div>
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
    </div>
  );
}
