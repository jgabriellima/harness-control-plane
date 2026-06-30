'use client';

import React, { useEffect, useState } from 'react';

import type { RunDiagnostics } from '@/lib/runtime-diagnostics';

interface RunDiagnosticsPanelProps {
  runId: string | null;
  projectId: string;
  requestId?: string | null;
  errorMessage?: string | null;
}

export default function RunDiagnosticsPanel({
  runId,
  projectId,
  requestId,
  errorMessage,
}: RunDiagnosticsPanelProps) {
  const [diagnostics, setDiagnostics] = useState<RunDiagnostics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!runId) {
      setDiagnostics(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void (async () => {
      try {
        const params = new URLSearchParams({ project_id: projectId });
        const response = await fetch(
          `/api/runtime/runs/${encodeURIComponent(runId)}/diagnostics?${params.toString()}`,
        );
        const body = (await response.json()) as RunDiagnostics & { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? 'Failed to load diagnostics');
        }
        if (!cancelled) {
          setDiagnostics(body);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load diagnostics');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, projectId]);

  if (!runId && !requestId && !errorMessage) {
    return null;
  }

  return (
    <div
      className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
      data-testid="run-diagnostics-panel"
      role="alert"
    >
      <p className="font-medium">Runtime dispatch failed</p>
      {errorMessage ? <p className="mt-1 whitespace-pre-wrap">{errorMessage}</p> : null}
      {requestId ? <p className="mt-1 font-mono text-[11px]">request_id: {requestId}</p> : null}
      {runId ? <p className="font-mono text-[11px]">run_id: {runId}</p> : null}

      {loading ? <p className="mt-2 text-red-700">Loading diagnostics…</p> : null}
      {loadError ? <p className="mt-2 text-red-700">{loadError}</p> : null}

      {diagnostics?.last_error ? (
        <div className="mt-2 space-y-1 font-mono text-[11px]">
          {diagnostics.last_error.phase ? <p>phase: {diagnostics.last_error.phase}</p> : null}
          {diagnostics.last_error.message ? <p>detail: {diagnostics.last_error.message}</p> : null}
        </div>
      ) : null}

      {diagnostics && diagnostics.dispatch_events.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-red-800">Dispatch trace ({diagnostics.dispatch_events.length})</summary>
          <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto font-mono text-[10px]">
            {diagnostics.dispatch_events.map((entry) => (
              <li key={`${entry.ts}-${entry.event}`}>
                {entry.ts} {entry.event}
                {entry.phase ? ` [${entry.phase}]` : ''}
                {entry.error_message ? ` — ${entry.error_message}` : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
