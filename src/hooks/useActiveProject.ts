import { useEffect, useState } from 'react';

import { readStaleSidebarCache, writeSidebarCache } from '@/lib/sidebar-cache';

interface ProjectItem {
  id: string;
  name: string;
  active?: boolean;
}

interface ProjectsResponse {
  projects: ProjectItem[];
}

export interface ActiveProject {
  id: string;
  name: string;
}

export function resolveActiveProject(projects: ProjectItem[]): ActiveProject | null {
  const active = projects.find((project) => project.active) ?? projects[0];
  if (!active?.id) {
    return null;
  }
  return { id: active.id, name: active.name };
}

export function useActiveProject(): ActiveProject | null {
  const [activeProject, setActiveProject] = useState<ActiveProject | null>(() => {
    const cached = readStaleSidebarCache<ProjectItem[]>('projects');
    return cached ? resolveActiveProject(cached) : null;
  });

  useEffect(() => {
    let cancelled = false;

    function refreshFromCache(): void {
      const cached = readStaleSidebarCache<ProjectItem[]>('projects');
      if (cached) {
        setActiveProject(resolveActiveProject(cached));
      }
    }

    void fetch('/api/projects')
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as ProjectsResponse;
        if (cancelled) {
          return;
        }
        writeSidebarCache('projects', payload.projects);
        setActiveProject(resolveActiveProject(payload.projects));
      })
      .catch(() => undefined);

    window.addEventListener('runtime:conversations-changed', refreshFromCache);
    window.addEventListener('focus', refreshFromCache);

    return () => {
      cancelled = true;
      window.removeEventListener('runtime:conversations-changed', refreshFromCache);
      window.removeEventListener('focus', refreshFromCache);
    };
  }, []);

  return activeProject;
}
