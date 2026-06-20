import React, { useEffect, useState } from 'react';

import type { ArtifactDetail } from '../../lib/artifacts';

interface ArtifactViewProps {
  artifactId: string;
}

interface ArtifactResponse extends ArtifactDetail {
  error?: string;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ArtifactView({ artifactId }: ArtifactViewProps) {
  const [artifact, setArtifact] = useState<ArtifactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadArtifact(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}`);
        const payload = (await response.json()) as ArtifactResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load artifact');
        }

        if (!cancelled) {
          setArtifact(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to load artifact';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadArtifact();

    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8" data-testid="artifact-view-loading">
        <p className="text-sm text-gray-500">Loading artifact…</p>
      </div>
    );
  }

  if (error || !artifact) {
    return (
      <div className="flex flex-1 items-center justify-center p-8" data-testid="artifact-view-error">
        <p className="text-sm text-red-600" role="alert">
          {error ?? 'Artifact not found'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6" data-testid="artifact-view">
      <header className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Artifact</p>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">{artifact.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase">{artifact.type}</span>
          <span>v{artifact.version}</span>
          <span>{formatTimestamp(artifact.createdAt)}</span>
          <a
            href={`/execution/${encodeURIComponent(artifact.executionId)}`}
            className="font-mono text-xs text-violet-600 hover:underline"
          >
            {artifact.executionId}
          </a>
          {artifact.nodeId ? (
            <span className="font-mono text-xs text-gray-400">{artifact.nodeId}</span>
          ) : null}
        </div>
      </header>

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <header className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Preview</h2>
            {artifact.uri ? <p className="font-mono text-xs text-gray-400">{artifact.uri}</p> : null}
          </header>
          <div className="max-h-[520px] overflow-auto p-4">
            {artifact.previewContent ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-gray-800">
                {artifact.previewContent}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">No preview content available for this artifact.</p>
            )}
          </div>
        </section>

        <aside className="rounded-xl border border-gray-200 bg-white">
          <header className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Version history</h2>
            <p className="text-xs text-gray-500">{artifact.versions.length} version(s)</p>
          </header>
          <ul className="divide-y divide-gray-100">
            {artifact.versions.map((version) => (
              <li key={version.artifactId} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">v{version.version}</span>
                  <span className="text-xs text-gray-500">{formatTimestamp(version.createdAt)}</span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-gray-400">{version.executionId}</p>
                {version.artifactId !== artifact.id ? (
                  <a
                    href={`/artifact/${encodeURIComponent(version.artifactId)}`}
                    className="mt-1 inline-block text-xs font-medium text-violet-600 hover:underline"
                  >
                    View version
                  </a>
                ) : (
                  <span className="mt-1 inline-block text-xs text-violet-600">Current</span>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
