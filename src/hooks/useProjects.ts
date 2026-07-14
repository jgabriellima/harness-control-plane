import { useEffect, useState } from 'react';

import { readStaleSidebarCache, writeSidebarCache } from '@/lib/sidebar-cache';

export interface ProjectOption {
  id: string;
  name: string;
}

interface ProjectsResponse {
  projects: ProjectOption[];
}

export function useProjects(): ProjectOption[] {
  const [projects, setProjects] = useState<ProjectOption[]>(() => {
    const cached = readStaleSidebarCache<ProjectOption[]>('projects');
    return cached ?? [];
  });

  useEffect(() => {
    let cancelled = false;

    function refreshFromCache(): void {
      const cached = readStaleSidebarCache<ProjectOption[]>('projects');
      if (cached) {
        setProjects(cached);
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
        setProjects(payload.projects);
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

  return projects;
}
