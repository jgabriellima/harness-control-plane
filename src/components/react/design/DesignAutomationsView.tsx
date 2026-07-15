'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Play, Plus, Workflow } from 'lucide-react';

import {
  createDesignRoutine,
  formatRoutineSchedule,
  listRoutines,
  runRoutine,
  type DesignRoutineRecord,
} from '@/lib/design-api';

const TEMPLATE_CARDS = [
  {
    id: 'extract-ds',
    title: 'Extract design system',
    description: 'Pull tokens and components from a reference site into a new design system.',
  },
  {
    id: 'crystallize',
    title: 'Crystallize successful run into skill',
    description: 'Turn a completed project workflow into a reusable skill for the Home composer.',
  },
  {
    id: 'orbit-digest',
    title: 'Orbit digest',
    description: 'Summarize workspace activity on a recurring schedule.',
  },
] as const;

function routineStatusClass(routine: DesignRoutineRecord): string {
  if (!routine.enabled) return 'is-paused';
  const lastStatus = routine.lastRun?.status;
  if (lastStatus === 'running' || lastStatus === 'queued') return 'is-running';
  if (lastStatus === 'failed') return 'is-failed';
  if (lastStatus === 'succeeded') return 'is-succeeded';
  return '';
}

function routineStatusLabel(routine: DesignRoutineRecord): string {
  if (!routine.enabled) return 'Paused';
  const lastStatus = routine.lastRun?.status;
  if (lastStatus) return lastStatus.charAt(0).toUpperCase() + lastStatus.slice(1);
  return 'Ready';
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
  const [templateFilter, setTemplateFilter] = useState('all');

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
    if (!trimmedName || !trimmedPrompt || creating) return;

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

  const activeCount = routines.filter((routine) => routine.enabled).length;
  const pausedCount = routines.filter((routine) => !routine.enabled).length;

  return (
    <div className="automations-view" data-testid="design-automations-view">
      <header className="automations-hero">
        <div className="automations-hero__copy">
          <span className="automations-hero__eyebrow">Scheduled agent sessions</span>
          <h1 className="automations-hero__title">Automations</h1>
          <p className="automations-hero__lede">
            Plan recurring conversations for project work, Orbit digests, and live artifacts.
          </p>
        </div>
        <div className="automations-hero__actions">
          <div className="automations-metrics">
            <div className="automations-metric">
              <span className="automations-metric__value">{activeCount}</span>
              <span className="automations-metric__label">Active</span>
            </div>
            <div className="automations-metric">
              <span className="automations-metric__value">{pausedCount}</span>
              <span className="automations-metric__label">Paused</span>
            </div>
            <div className="automations-metric">
              <span className="automations-metric__value">{TEMPLATE_CARDS.length}</span>
              <span className="automations-metric__label">Templates</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((current) => !current)}
            className="automations-view__new"
            data-testid="design-automation-create-toggle"
          >
            <Plus className="h-3.5 w-3.5" />
            New automation
          </button>
        </div>
      </header>

      {showCreate ? (
        <div className="automations-create-panel">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Automation name"
            className="automations-create-input"
            data-testid="design-automation-create-name"
          />
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What should the agent do on each run?"
            className="automations-create-textarea"
            data-testid="design-automation-create-prompt"
          />
          <input
            type="time"
            value={scheduleTime}
            onChange={(event) => setScheduleTime(event.target.value)}
            className="automations-create-input"
            data-testid="design-automation-create-time"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim() || !prompt.trim()}
            className="automations-view__new"
            data-testid="design-automation-create-submit"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Create automation
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="automations-view__error" data-testid="design-automations-error">
          {error}
        </p>
      ) : null}

      <section className="automations-saved">
        <div className="automations-section-head">
          <h2 className="automations-section__label">Your automations</h2>
        </div>
        {loading ? (
          <div className="automations-templates__empty">
            <span className="automations-templates__empty-icon" aria-hidden>
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
            <div>
              <strong>Loading automations</strong>
              <p>Fetching your scheduled sessions…</p>
            </div>
          </div>
        ) : routines.length === 0 ? (
          <button type="button" className="automation-empty" onClick={() => setShowCreate(true)}>
            <span className="automation-empty__icon" aria-hidden>
              <Workflow className="h-4 w-4" />
            </span>
            <span className="automation-empty__body">
              <strong>No automations yet</strong>
              <span>Create your first scheduled agent session.</span>
            </span>
          </button>
        ) : (
          <ul className="automations-saved__list">
            {routines.map((routine) => (
              <li
                key={routine.id}
                className={`automation-row${!routine.enabled ? ' is-paused' : ''}`}
                data-testid="design-routine-card"
              >
                <div className="automation-row__main">
                  <span className="automation-row__icon" aria-hidden>
                    <Workflow className="h-4 w-4" />
                  </span>
                  <div className="automation-row__content">
                    <span className="automation-row__title">{routine.name}</span>
                    <span className="automation-row__meta">{formatRoutineSchedule(routine.schedule)}</span>
                    <p className="automation-row__prompt">{routine.prompt}</p>
                    <span className={`automation-status ${routineStatusClass(routine)}`}>
                      {routineStatusLabel(routine)}
                    </span>
                  </div>
                </div>
                <div className="automation-row__actions">
                  <button
                    type="button"
                    onClick={() => void handleRun(routine.id)}
                    disabled={runningId === routine.id || !routine.enabled}
                    className="automation-row__btn"
                    data-testid="design-routine-run"
                  >
                    {runningId === routine.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Run
                  </button>
                  <button type="button" className="automation-row__btn">
                    History
                  </button>
                  <button type="button" className="automation-row__btn">
                    Edit
                  </button>
                  <button type="button" className="automation-row__btn automation-row__btn--danger">
                    Pause
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="automations-templates">
        <div className="automations-templates__head">
          <div className="automations-templates__head-copy">
            <h2 className="automations-section__label">Templates</h2>
          </div>
        </div>
        <div className="automations-template-tabs" role="tablist">
          <button
            type="button"
            className={`automations-template-tab${templateFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setTemplateFilter('all')}
          >
            <span className="automations-template-tab__label">All</span>
            <span className="automations-template-tab__count">{TEMPLATE_CARDS.length}</span>
          </button>
          <button type="button" className="automations-template-tab">
            <span className="automations-template-tab__label">Orbit</span>
          </button>
          <button type="button" className="automations-template-tab">
            <span className="automations-template-tab__label">Design systems</span>
          </button>
        </div>
        <div className="automations-templates__grid">
          {TEMPLATE_CARDS.map((template) => (
            <button key={template.id} type="button" className="automation-template-card">
              <span className="automation-template-card__icon" aria-hidden>
                <Workflow className="h-4 w-4" />
              </span>
              <span className="automation-template-card__body">
                <span className="automation-template-card__kicker">Automation</span>
                <span className="automation-template-card__title">{template.title}</span>
                <span className="automation-template-card__desc">{template.description}</span>
                <span className="automation-template-card__cta">Use template</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
