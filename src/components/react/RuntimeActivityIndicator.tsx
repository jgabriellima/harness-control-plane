'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

import { resolveRunActivityLabel } from '@/lib/runtime-hub-store';
import type { RunActivityPhase } from '@/lib/runtime-hub-types';

interface RuntimeActivityIndicatorProps {
  activity: RunActivityPhase;
  toolActivity: string[];
  compact?: boolean;
}

function parseToolLine(line: string): { name: string; status: string } {
  const [name = 'tool', status = 'running'] = line.split(' · ');
  return { name: name.trim(), status: status.trim() };
}

function isRunningStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized === 'running' || normalized === 'pending' || normalized === 'in_progress';
}

export default function RuntimeActivityIndicator({
  activity,
  toolActivity,
  compact = false,
}: RuntimeActivityIndicatorProps) {
  const label = resolveRunActivityLabel(activity, toolActivity);

  return (
    <div
      className={
        compact
          ? 'flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2'
          : 'flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 shadow-sm'
      }
      data-testid="runtime-activity-indicator"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Loader2
        className={`shrink-0 animate-spin text-violet-600 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={`font-medium text-violet-900 ${compact ? 'text-xs' : 'text-sm'}`}>{label}</p>
        {!compact && toolActivity.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {toolActivity.slice(-4).map((line, index) => {
              const { name, status } = parseToolLine(line);
              const running = isRunningStatus(status);
              return (
                <li
                  key={`${index}-${line}`}
                  className="flex items-center gap-2 font-mono text-[11px] text-violet-800/80"
                >
                  {running ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-violet-500" aria-hidden />
                  ) : (
                    <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                  )}
                  <span className="truncate">{name}</span>
                  <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-violet-600/70">
                    {status}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function StreamingPlaceholder(): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-500" data-testid="streaming-placeholder">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" aria-hidden />
      <span className="animate-pulse">Working…</span>
    </span>
  );
}
