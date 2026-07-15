'use client';

import React, { useCallback, useEffect, useState } from 'react';

import type { RichUiMode } from '@/lib/presentation-types';

const RICH_UI_OPTIONS: Array<{ value: RichUiMode; label: string; description: string }> = [
  {
    value: 'off',
    label: 'Plain markdown',
    description: 'Always text responses. Lowest token usage.',
  },
  {
    value: 'adaptive',
    label: 'Adaptive rich UI',
    description: 'OpenUI components only when metrics, charts, tables, or rankings add clarity.',
  },
  {
    value: 'always',
    label: 'Always rich UI',
    description: 'Every response uses the full OpenUI contract. Highest visual density.',
  },
];

function resolveProjectIdFromLocation(): string {
  if (typeof window === 'undefined') {
    return 'default';
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('project')?.trim() || 'default';
}

export default function PresentationSettingsPanel() {
  const [projectId, setProjectId] = useState('default');
  const [richUi, setRichUi] = useState<RichUiMode>('adaptive');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async (activeProjectId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/settings/presentation?project_id=${encodeURIComponent(activeProjectId)}`,
      );
      const payload = (await response.json()) as { richUi?: RichUiMode; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load presentation settings');
      }
      if (payload.richUi) {
        setRichUi(payload.richUi);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load presentation settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const activeProjectId = resolveProjectIdFromLocation();
    setProjectId(activeProjectId);
    void load(activeProjectId);
  }, [load]);

  async function save(nextRichUi: RichUiMode): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/settings/presentation?project_id=${encodeURIComponent(projectId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ richUi: nextRichUi }),
        },
      );
      const payload = (await response.json()) as { richUi?: RichUiMode; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to save presentation settings');
      }
      if (payload.richUi) {
        setRichUi(payload.richUi);
      }
      setSavedAt(new Date().toLocaleTimeString());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save presentation settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading presentation settings…</p>;
  }

  return (
    <div className="space-y-4" data-testid="presentation-settings-panel">
      <p className="text-sm text-gray-600">
        Controls how assistant responses render for workspace <span className="font-mono">{projectId}</span>.
        No slash command required when adaptive or always is enabled. Use <span className="font-mono">/text</span>{' '}
        or <span className="font-mono">/openui</span> to override a single message.
      </p>

      <div className="space-y-2">
        {RICH_UI_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
              richUi === option.value
                ? 'border-brand-300 bg-brand-50/60'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <input
              type="radio"
              name="rich-ui-mode"
              value={option.value}
              checked={richUi === option.value}
              disabled={saving}
              className="mt-1"
              onChange={() => {
                setRichUi(option.value);
                void save(option.value);
              }}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">{option.label}</span>
              <span className="mt-0.5 block text-xs text-gray-500">{option.description}</span>
            </span>
          </label>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {savedAt ? <p className="text-xs text-gray-400">Saved at {savedAt}</p> : null}
    </div>
  );
}
