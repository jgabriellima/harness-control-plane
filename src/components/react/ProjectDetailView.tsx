import React, { useEffect, useState } from 'react';

import type { ProjectDetail } from '../../lib/harness-types';

interface ProjectDetailViewProps {
  projectId: string;
}

interface ProjectDetailResponse extends ProjectDetail {
  error?: string;
}

const STUB_CONVERSATION_COUNT = 0;

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'operational':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    case 'draft':
      return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    default:
      return 'bg-gray-100 text-gray-600 ring-gray-500/10';
  }
}

export default function ProjectDetailView({ projectId }: ProjectDetailViewProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadProject(): Promise<void> {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? 'Failed to load project');
        }

        const payload = (await response.json()) as ProjectDetailResponse;

        if (cancelled) {
          return;
        }

        setProject(payload);
        setLoadError(null);
        setLoading(false);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load project';
          setLoadError(message);
          setLoading(false);
        }
      }
    }

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-16" data-testid="project-loading">
        <p className="text-sm text-gray-500">Loading project...</p>
      </div>
    );
  }

  if (loadError || !project) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-16" data-testid="project-error">
        <div className="max-w-md text-center">
          <p className="text-sm font-medium text-red-600">{loadError ?? 'Project not found'}</p>
          <p className="mt-2 font-mono text-xs text-gray-500">{projectId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8" data-testid="project-detail-view">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{project.name}</h1>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${statusBadgeClass(project.status)}`}
            >
              {project.status}
            </span>
          </div>
          <p className="text-sm text-gray-500">{project.description || 'No description'}</p>
          <p className="mt-1 font-mono text-xs text-gray-400">{project.id}</p>
        </div>

        <a
          href={`/settings?project=${encodeURIComponent(project.id)}`}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-200 hover:bg-gray-100 hover:text-gray-700"
          data-testid="project-settings-link"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          Project Settings
        </a>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Conversations</h2>
          <p className="mt-2 text-3xl font-semibold text-gray-900" data-testid="conversation-count-stub">
            {STUB_CONVERSATION_COUNT}
          </p>
          <p className="mt-1 text-sm text-gray-500">Active conversation threads</p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Runtime</h2>
          <p className="mt-2 text-lg font-semibold text-gray-900">{project.runtime_profile.runtime}</p>
          <p className="mt-1 text-sm text-gray-500">
            Baseline {project.runtime_profile.baseline}
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Members</h2>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{project.members.length}</p>
          <ul className="mt-2 space-y-1">
            {project.members.map((member) => (
              <li key={member.id} className="text-sm text-gray-500">
                {member.name}
                <span className="ml-1 text-xs text-gray-400">({member.role})</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
