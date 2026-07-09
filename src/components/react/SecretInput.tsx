import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface SecretInputProps {
  envVar: string;
  label: string;
  present: boolean;
  required: boolean;
  hideEnvVar?: boolean;
  savedAt?: string | null;
  updatedAt?: string | null;
  onSave: (value: string) => Promise<void>;
}

function formatCredentialTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleString();
}

export default function SecretInput({
  envVar,
  label,
  present,
  required,
  hideEnvVar = false,
  savedAt = null,
  updatedAt = null,
  onSave,
}: SecretInputProps) {
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!revealed) {
      return undefined;
    }
    const timer = window.setTimeout(() => setRevealed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  async function handleSave(): Promise<void> {
    if (value.trim().length === 0) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(value.trim());
      setValue('');
      setRevealed(false);
      setSavedNotice('Credential saved. Runtime chat is now available.');
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Save failed';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-gray-50 py-4 last:border-b-0" data-testid={`secret-input-${envVar}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          {hideEnvVar ? null : <p className="font-mono text-xs text-gray-500">{envVar}</p>}
        </div>
        <span
          className={`text-xs font-semibold uppercase ${
            present ? 'text-emerald-600' : required ? 'text-amber-600' : 'text-gray-400'
          }`}
        >
          {present ? 'configured' : required ? 'missing' : 'optional'}
        </span>
      </div>
      {present ? (
        <p className="mt-1 text-xs text-emerald-700" data-testid={`secret-status-${envVar}`}>
          Key stored securely
          {formatCredentialTimestamp(updatedAt ?? savedAt)
            ? ` · last updated ${formatCredentialTimestamp(updatedAt ?? savedAt)}`
            : ''}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={revealed ? 'text' : 'password'}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={present ? 'Replace value…' : 'Enter value…'}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm text-gray-900"
            autoComplete="off"
            data-testid={`secret-field-${envVar}`}
          />
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={revealed ? 'Hide secret' : 'Show secret'}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || value.trim().length === 0}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {savedNotice ? (
        <p className="mt-2 text-xs text-emerald-700" role="status">
          {savedNotice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
