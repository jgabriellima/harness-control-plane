'use client';

import React from 'react';

import { type DesignProjectSummary } from '@/lib/design-navigation';
import { designPathForView } from '@/lib/design-navigation';
import { navigateDesign } from '@/lib/design-shell-navigation';
import DesignOdIcon from './DesignOdIcon';

interface DesignRecentProjectsStripProps {
  projects: DesignProjectSummary[];
  loading?: boolean;
}

function projectKindClass(kind: string): string {
  const normalized = kind.toLowerCase();
  if (normalized.includes('deck') || normalized.includes('slide')) return 'slide';
  if (normalized.includes('image') || normalized.includes('media')) return 'media';
  if (normalized.includes('video') || normalized.includes('hyper')) return 'media';
  return 'prototype';
}

function ProjectTag({ category }: { category: string }) {
  return (
    <span className={`design-card-tag design-card-tag--${projectKindClass(category)}`}>
      {category}
    </span>
  );
}

function ProjectCard({ project }: { project: DesignProjectSummary }) {
  const initial = project.name.trim().charAt(0).toUpperCase() || 'P';
  return (
    <div role="listitem" className="recent-projects__card" data-project-id={project.id}>
      <button
        type="button"
        className="recent-projects__card-main"
        onClick={() => navigateDesign(designPathForView('studio', { projectId: project.id }))}
        title={project.name}
        data-testid="design-recent-project"
      >
        <div className="recent-projects__card-thumb recent-projects__card-thumb-html" aria-hidden>
          <span className="recent-projects__card-glyph">{initial}</span>
        </div>
        <div className="recent-projects__card-meta">
          <div className="design-card-tag-row">
            <ProjectTag category={project.kind} />
          </div>
          <div className="recent-projects__card-name">{project.name}</div>
          <div className="recent-projects__card-time">
            <span className="recent-projects__card-status recent-projects__card-status-succeeded">
              Updated {project.updatedAt}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

export default function DesignRecentProjectsStrip({
  projects,
  loading = false,
}: DesignRecentProjectsStripProps) {
  const recent = projects.slice(0, 6);

  if (loading) {
    return (
      <section className="recent-projects" data-testid="design-recent-projects">
        <header className="recent-projects__head">
          <h2 className="recent-projects__title">Recent projects</h2>
        </header>
        <div className="recent-projects__empty">Loading projects...</div>
      </section>
    );
  }

  if (recent.length === 0) {
    return (
      <section className="recent-projects" data-testid="design-recent-projects">
        <header className="recent-projects__head">
          <h2 className="recent-projects__title">Recent projects</h2>
        </header>
        <div className="recent-projects__empty">
          No projects yet. Submit a brief to create your first design artifact.
        </div>
      </section>
    );
  }

  return (
    <section className="recent-projects" data-testid="design-recent-projects">
      <header className="recent-projects__head">
        <h2 className="recent-projects__title">Recent projects</h2>
        <button
          type="button"
          className="recent-projects__view-all"
          onClick={() => navigateDesign(designPathForView('projects'))}
          data-testid="recent-projects-view-all"
        >
          <span>View all</span>
          <DesignOdIcon name="chevron-right" size={12} />
        </button>
      </header>
      <div className="recent-projects__row" role="list">
        {recent.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}
