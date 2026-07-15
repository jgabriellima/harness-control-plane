'use client';

import React, { useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  useReaderPreferences,
  type ReaderFontSize,
  type ReaderLineHeight,
  type ReaderSpacing,
} from './ReaderPreferencesProvider';

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-center gap-4 border-b border-gray-50 px-3 py-3 last:border-b-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <Select value={value} disabled={disabled} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ReaderSettingsPanel() {
  const { preferences, loading, updatePreferences } = useReaderPreferences();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function savePatch(patch: Partial<typeof preferences>): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await updatePreferences(patch);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save reader preferences');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading reader preferences…</p>;
  }

  return (
    <div data-testid="reader-settings-panel">
      <p className="mb-4 text-sm text-gray-600">
        Customize markdown typography in chat responses. Changes apply immediately across the runtime console.
      </p>

      <div className="rounded-lg border border-gray-100">
        <SelectField<ReaderFontSize>
          label="Font size"
          value={preferences.fontSize}
          disabled={saving}
          options={[
            { value: 'sm', label: 'Small (13px)' },
            { value: 'base', label: 'Default (15px)' },
            { value: 'lg', label: 'Large (17px)' },
            { value: 'xl', label: 'Extra large (19px)' },
          ]}
          onChange={(fontSize) => {
            void savePatch({ fontSize });
          }}
        />
        <SelectField<ReaderLineHeight>
          label="Line height"
          value={preferences.lineHeight}
          disabled={saving}
          options={[
            { value: 'tight', label: 'Tight' },
            { value: 'normal', label: 'Normal' },
            { value: 'relaxed', label: 'Relaxed' },
            { value: 'loose', label: 'Loose' },
          ]}
          onChange={(lineHeight) => {
            void savePatch({ lineHeight });
          }}
        />
        <SelectField<ReaderSpacing>
          label="Paragraph spacing"
          value={preferences.spacing}
          disabled={saving}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'airy', label: 'Airy' },
          ]}
          onChange={(spacing) => {
            void savePatch({ spacing });
          }}
        />
      </div>

      <div
        className="chat-markdown mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        data-testid="reader-settings-preview"
      >
        <p>
          This is a preview of assistant markdown. Lists, headings, and paragraphs respect your reader
          preferences.
        </p>
        <ul>
          <li>Metrics and charts appear only when adaptive rich UI decides they help.</li>
          <li>Simple questions stay in readable prose like this block.</li>
        </ul>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {savedAt ? <p className="mt-2 text-xs text-gray-400">Saved at {savedAt}</p> : null}
    </div>
  );
}
