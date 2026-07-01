import React from 'react';

import {
  formatElapsedTime,
  formatStatusLabel,
  type ExecutionViewModel,
} from '../../lib/execution-events';
import type { ExecutionStatus } from '../../lib/harness-types';

interface ExecutionHeaderProps {
  model: ExecutionViewModel;
  tick: number;
}

function statusTone(status: ExecutionStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    case 'failed':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    case 'blocked':
    case 'paused':
      return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    case 'running':
    case 'in_progress':
      return 'bg-gray-100 text-gray-700 ring-gray-200';
    default:
      return 'bg-gray-50 text-gray-600 ring-gray-500/20';
  }
}

export default function ExecutionHeader({ model, tick }: ExecutionHeaderProps) {
  void tick;

  const elapsed = formatElapsedTime(model.startedAt, model.updatedAt, model.status);

  return (
    <header
      className="shrink-0 border-b border-gray-200 bg-white px-6 py-4"
      data-testid="execution-header"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusTone(model.status)}`}
            >
              {formatStatusLabel(model.status)}
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              {model.workflowId}
            </span>
          </div>

          <h1 className="mt-2 line-clamp-2 text-lg font-semibold text-gray-900">
            {model.progress.objective}
          </h1>

          <p className="mt-1 truncate font-mono text-xs text-gray-500">{model.executionId}</p>
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 lg:gap-y-0">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Elapsed
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900">{elapsed}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Runtime
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900">{model.runtime}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Profile
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900">{model.profile}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Progress
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900">
              {model.progress.completedNodes}/{model.progress.totalNodes} nodes
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Execution progress</span>
          <span>{model.progress.percentComplete}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gray-900 transition-all duration-500"
            style={{ width: `${model.progress.percentComplete}%` }}
            role="progressbar"
            aria-valuenow={model.progress.percentComplete}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>
    </header>
  );
}
