import React, { useEffect, useState } from 'react';

import { clientNavigate } from '../../lib/client-nav';
import type { ProjectSummary } from '../../lib/harness-types';

interface ProjectsResponse {
  projects: ProjectSummary[];
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'operational':
      return 'bg-emerald-50 text-emerald-700';
    case 'draft':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export default function ProjectsListView() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  async function loadProjects(): Promise<void> {
    const response = await fetch('/api/projects');

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? 'Failed to load projects');
    }

    const payload = (await response.json()) as ProjectsResponse;
    setProjects(payload.projects);
    setLoadError(null);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await loadProjects();
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load projects';
          setLoadError(message);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateProject(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const name = newProjectName.trim();
    if (name.length === 0 || creating) {
      return;
    }

    setCreating(true);
    setLoadError(null);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Failed to create project');
      }

      const payload = (await response.json()) as { project: ProjectSummary };
      setNewProjectName('');
      await clientNavigate('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create project';
      setLoadError(message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-16" data-testid="projects-loading">
        <p className="text-sm text-gray-500">Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-8" data-testid="projects-list-view">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
        <p className="mt-1 text-sm text-gray-500">
          Each project is an isolated workspace with its own harness and runtime context.
        </p>
      </header>

      {loadError ? (
        <p className="mb-4 text-sm font-medium text-red-600" role="alert">
          {loadError}
        </p>
      ) : null}

      <form
        className="mb-8 flex max-w-lg gap-2"
        onSubmit={(event) => {
          void handleCreateProject(event);
        }}
      >
        <input
          type="text"
          value={newProjectName}
          onChange={(event) => setNewProjectName(event.target.value)}
          placeholder="BASA_Project"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
          data-testid="new-project-name"
        />
        <button
          type="submit"
          disabled={creating || newProjectName.trim().length === 0}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          data-testid="create-project-button"
        >
          {creating ? 'Creating...' : 'Create Project'}
        </button>
      </form>

      {projects.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center"
          data-testid="projects-empty"
        >
          <p className="text-sm text-gray-600">No workspaces yet. Create your first project above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <a
              key={project.id}
              href={`/project/${encodeURIComponent(project.id)}`}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:border-gray-200 hover:shadow-md"
              data-testid={`project-card-${project.id}`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="truncate text-base font-semibold text-gray-900 group-hover:text-gray-700">
                  {project.name}
                </h2>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(project.status)}`}
                >
                  {project.status}
                </span>
              </div>

              <p className="mb-4 line-clamp-2 flex-1 text-sm text-gray-500">
                {project.description || 'No description'}
              </p>

              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="font-mono truncate">{project.path ?? project.id}</span>
                {project.active ? (
                  <span className="flex items-center gap-1.5 font-medium text-gray-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-1000" aria-hidden="true" />
                    Active
                  </span>
                ) : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
