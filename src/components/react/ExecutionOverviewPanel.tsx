import React from 'react';

import { formatStatusLabel, type ExecutionViewModel } from '../../lib/execution-events';
import type { ExecutionStatus } from '../../lib/harness-types';
import ArtifactPanel from './ArtifactPanel';

interface ExecutionOverviewPanelProps {
  model: ExecutionViewModel;
}

function statusTone(status: ExecutionStatus): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'failed':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'blocked':
    case 'paused':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    default:
      return 'border-violet-200 bg-violet-50 text-violet-800';
  }
}

function resolveFinalOutput(model: ExecutionViewModel): string {
  const completedNodes = [...model.nodes]
    .filter((node) => node.outputSummary && node.outputSummary.trim().length > 0)
    .reverse();

  if (completedNodes.length > 0) {
    return completedNodes[0]?.outputSummary ?? model.progress.objective;
  }

  const lastCompleted = [...model.nodes].reverse().find((node) => node.status === 'completed');
  if (lastCompleted?.objective) {
    return lastCompleted.objective;
  }

  return model.progress.objective;
}

export default function ExecutionOverviewPanel({ model }: ExecutionOverviewPanelProps) {
  const finalOutput = resolveFinalOutput(model);
  const gateNodes = model.nodes.filter((node) => node.validationResult);

  return (
    <div className="flex flex-col gap-4" data-testid="execution-overview-panel">
      <section className={`rounded-xl border p-5 ${statusTone(model.status)}`}>
        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Final result</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
            {formatStatusLabel(model.status)}
          </span>
          <span className="text-xs opacity-70">{model.workflowId}</span>
        </div>
        <p className="mt-3 text-sm font-medium">{finalOutput}</p>
        <p className="mt-2 font-mono text-xs opacity-60">{model.executionId}</p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Execution summary</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Nodes</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">
              {model.progress.completedNodes}/{model.progress.totalNodes} completed
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Artifacts</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">{model.artifacts.length} produced</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Runtime</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">{model.runtime}</dd>
          </div>
        </dl>
      </section>

      {gateNodes.length > 0 ? (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Gate outcomes</h2>
          <ul className="mt-3 divide-y divide-gray-100">
            {gateNodes.map((node) => (
              <li key={node.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{node.label}</p>
                  <p className="mt-0.5 font-mono text-xs text-gray-500">{node.id}</p>
                </div>
                <p className="shrink-0 text-xs font-medium text-emerald-700">{node.validationResult}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ArtifactPanel artifacts={model.artifacts} />
    </div>
  );
}
