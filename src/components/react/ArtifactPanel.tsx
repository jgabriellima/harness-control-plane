import React from 'react';

import type { ExecutionArtifact } from '../../lib/execution-events';

interface ArtifactPanelProps {
  artifacts: ExecutionArtifact[];
}

function artifactIcon(type: string): string {
  switch (type) {
    case 'markdown':
      return 'MD';
    case 'json':
      return '{}';
    case 'image':
      return 'IMG';
    case 'spreadsheet':
      return 'XLS';
    case 'code':
      return '</>';
    case 'report':
      return 'RPT';
    case 'dashboard':
      return 'DSH';
    default:
      return 'DOC';
  }
}

function formatCreatedAt(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ArtifactPanel({ artifacts }: ArtifactPanelProps) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-gray-200 bg-white"
      data-testid="artifact-panel"
    >
      <header className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Produced Artifacts</h2>
        <p className="text-xs text-gray-500">{artifacts.length} artifact{artifacts.length === 1 ? '' : 's'}</p>
      </header>

      {artifacts.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-500">No artifacts produced yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {artifacts.map((artifact) => (
            <li key={artifact.id} className="px-4 py-3" data-testid={`artifact-${artifact.id}`}>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-[10px] font-bold text-violet-700">
                  {artifactIcon(artifact.type)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{artifact.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium uppercase tracking-wide">
                      {artifact.type}
                    </span>
                    <span>v{artifact.version}</span>
                    <span>{formatCreatedAt(artifact.createdAt)}</span>
                    {artifact.nodeId ? (
                      <span className="font-mono text-[10px] text-gray-400">{artifact.nodeId}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 gap-1">
                  <a
                    href={`/artifact/${encodeURIComponent(artifact.id)}`}
                    className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    aria-label={`Preview ${artifact.name}`}
                  >
                    Preview
                  </a>
                  {artifact.uri ? (
                    <a
                      href={artifact.uri}
                      className="rounded-md px-2 py-1 text-xs font-medium text-violet-600 hover:bg-violet-50"
                      aria-label={`Open ${artifact.name}`}
                      download
                    >
                      Download
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
