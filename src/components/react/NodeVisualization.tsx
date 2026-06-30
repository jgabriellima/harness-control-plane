import React from 'react';

import type { ExecutionNodeView } from '../../lib/execution-events';

interface NodeVisualizationProps {
  workflowId: string;
  nodes: ExecutionNodeView[];
  gateRulesByNode?: Map<string, string[]>;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'completed':
    case 'skipped':
      return 'bg-emerald-100 text-emerald-700';
    case 'running':
    case 'in_progress':
      return 'bg-gray-100 text-gray-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'blocked':
    case 'paused':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return '—';
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

export default function NodeVisualization({
  workflowId,
  nodes,
  gateRulesByNode,
}: NodeVisualizationProps) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-gray-200 bg-white"
      data-testid="node-visualization"
    >
      <header className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Workflow Nodes</h2>
        <p className="text-xs text-gray-500">{workflowId}</p>
      </header>

      {nodes.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-500">No workflow nodes recorded yet.</p>
      ) : (
        <ol className="divide-y divide-gray-100">
          {nodes.map((node, index) => (
            <li key={node.id} className="px-4 py-4" data-testid={`workflow-node-${node.id}`}>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${statusBadgeClass(node.status)}`}
                  >
                    {index + 1}
                  </span>
                  {index < nodes.length - 1 ? (
                    <span className="mt-1 h-full w-px min-h-[24px] bg-gray-200" aria-hidden="true" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">{node.label}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(node.status)}`}
                    >
                      {node.status}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-gray-500">Objective: {node.objective}</p>

                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-gray-400">Duration</dt>
                      <dd className="text-gray-700">{formatDuration(node.durationMs)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-400">Validation</dt>
                      <dd className="text-gray-700">{node.validationResult ?? '—'}</dd>
                    </div>
                    {node.inputSummary ? (
                      <div className="sm:col-span-2">
                        <dt className="font-medium text-gray-400">Input</dt>
                        <dd className="line-clamp-2 text-gray-700">{node.inputSummary}</dd>
                      </div>
                    ) : null}
                    {node.outputSummary ? (
                      <div className="sm:col-span-2">
                        <dt className="font-medium text-gray-400">Output</dt>
                        <dd className="line-clamp-2 text-gray-700">{node.outputSummary}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {gateRulesByNode?.get(node.id)?.length ? (
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        Gate rules
                      </p>
                      <ul className="mt-1 space-y-1">
                        {gateRulesByNode.get(node.id)?.map((rule) => (
                          <li
                            key={rule}
                            className="rounded-md bg-amber-50 px-2 py-1 font-mono text-xs text-amber-800"
                          >
                            {rule}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {node.artifacts.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        Phase artifacts
                      </p>
                      <ul className="mt-1 space-y-1">
                        {node.artifacts.map((artifact) => (
                          <li key={artifact.id}>
                            <a
                              href={`/artifact/${encodeURIComponent(artifact.id)}`}
                              className="inline-flex max-w-full items-center gap-1 truncate font-mono text-xs text-gray-600 hover:text-gray-800"
                            >
                              {artifact.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
