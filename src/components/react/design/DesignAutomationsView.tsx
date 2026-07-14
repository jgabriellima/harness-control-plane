'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Play, Plus } from 'lucide-react';

import {
  createDesignRoutine,
  formatRoutineSchedule,
  listRoutines,
  runRoutine,
  type DesignRoutineRecord,
} from '@/lib/design-api';

function routineStatusLabel(routine: DesignRoutineRecord): string {
  if (!routine.enabled) {
    return 'Disabled';
  }
  const lastStatus = routine.lastRun?.status;
  if (lastStatus) {
    return lastStatus.charAt(0).toUpperCase() + lastStatus.slice(1);
  }
  return 'Ready';
}

function RoutineCard({
  routine,
  onRun,
  running,
}: {
  routine: DesignRoutineRecord;
  onRun: (id: string) => void;
  running: boolean;
}) {
  return (
    <article
      className="flex flex-col rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]"
      data-testid="design-routine-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold text-[var(--text)]">{routine.name}</h3>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">{formatRoutineSchedule(routine.schedule)}</p>
        </div>
        <span className="rounded-full bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
          {routineStatusLabel(routine)}
        </span>
      </div>
      <p className="mt-3 flex-1 text-[14px] leading-6 text-[var(--text-muted)]">{routine.prompt}</p>
      <button
        type="button"
        onClick={() => onRun(routine.id)}
        disabled={running || !routine.enabled}
        className="mt-4 inline-flex items-center gap-2 self-start rounded-lg bg-[var(--accent)] px-3 py-2 text-[12px] font-medium text-[var(--bg-elevated)] disabled:opacity-40"
        data-testid="design-routine-run"
      >
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        Run now
      </button>
    </article>
  );
}

export default function DesignAutomationsView() {
  const [routines, setRoutines] = useState<DesignRoutineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');

  async function refresh() {
    try {
      const rows = await listRoutines();
      setRoutines(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load automations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleRun(routineId: string) {
    setRunningId(routineId);
    setError(null);
    try {
      await runRoutine(routineId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run automation');
    } finally {
      setRunningId(null);
    }
  }

  async function handleCreate() {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedName || !trimmedPrompt || creating) {
      return;
    }

    setCreating(true);
    setError(null);

    try {
      await createDesignRoutine({
        name: trimmedName,
        prompt: trimmedPrompt,
        scheduleTime,
      });
      setName('');
      setPrompt('');
      setShowCreate(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create automation');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-[var(--bg)] px-8 py-10" data-testid="design-automations-view">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">
            Scheduled agent sessions
          </p>
          <h1 className="mt-2 font-serif text-[36px] text-[var(--text)]">Automations</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-[var(--text-muted)]">
            Plan recurring conversations for project work, Orbit digests, and live artifacts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((current) => !current)}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--text-strong)] px-4 py-2 text-[12px] font-medium text-[var(--bg-elevated)]"
          data-testid="design-automation-create-toggle"
        >
          <Plus className="h-3.5 w-3.5" />
          New automation
        </button>
      </div>

      {showCreate ? (
        <div className="mt-6 max-w-2xl space-y-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Automation name"
            className="w-full rounded-xl border border-[var(--border-soft)] px-3 py-2 text-[14px]"
            data-testid="design-automation-create-name"
          />
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What should the agent do on each run?"
            className="min-h-[96px] w-full rounded-xl border border-[var(--border-soft)] px-3 py-2 text-[14px]"
            data-testid="design-automation-create-prompt"
          />
          <input
            type="time"
            value={scheduleTime}
            onChange={(event) => setScheduleTime(event.target.value)}
            className="rounded-xl border border-[var(--border-soft)] px-3 py-2 text-[14px]"
            data-testid="design-automation-create-time"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim() || !prompt.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-[12px] font-medium text-[var(--bg-elevated)] disabled:opacity-40"
            data-testid="design-automation-create-submit"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Create automation
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-[13px] text-[var(--red)]" data-testid="design-automations-error">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-8 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-6 py-12 text-[14px] text-[var(--text-muted)]">
          Loading automations...
        </div>
      ) : routines.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-12 text-[14px] text-[var(--text-muted)]">
          No automations configured yet.
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              onRun={(id) => void handleRun(id)}
              running={runningId === routine.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
