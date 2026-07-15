'use client';

import React, { useEffect, useMemo, useState } from 'react';

import {
  listProjectFiles,
  projectRawFileUrl,
  resolveProjectPreviewSrcdoc,
  type DesignProjectFile,
} from '@/lib/design-api';
import { type DesignProjectSummary } from '@/lib/design-navigation';
import { designPathForView } from '@/lib/design-navigation';
import { navigateDesign } from '@/lib/design-shell-navigation';
import DesignOdIcon from './DesignOdIcon';

interface DesignRecentProjectsStripProps {
  projects: DesignProjectSummary[];
  loading?: boolean;
}

type CoverKind = 'html' | 'image' | 'video' | 'fallback';

interface ProjectCover {
  kind: CoverKind;
  filePath?: string;
  srcdoc?: string;
}

function projectKindClass(kind: string): string {
  const normalized = kind.toLowerCase();
  if (normalized.includes('deck') || normalized.includes('slide')) return 'slide';
  if (normalized.includes('image') || normalized.includes('media')) return 'media';
  if (normalized.includes('video') || normalized.includes('hyper')) return 'media';
  return 'prototype';
}

function projectThumbStyle(projectId: string): React.CSSProperties {
  let hash = 0;
  for (let index = 0; index < projectId.length; index += 1) {
    hash = (hash * 31 + projectId.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  const hue2 = (hue + 38) % 360;
  return {
    background: `radial-gradient(circle at 30% 28%, hsl(${hue} 70% 78% / 0.55), transparent 42%), linear-gradient(135deg, hsl(${hue} 65% 88%), hsl(${hue2} 70% 90%))`,
  };
}

function findCoverFile(files: DesignProjectFile[]): { kind: CoverKind; filePath: string } | null {
  const html =
    files.find((file) => file.path === 'index.html') ??
    files
      .filter((file) => file.kind === 'html')
      .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))[0];
  if (html) {
    return { kind: 'html', filePath: html.path };
  }

  const image = files
    .filter((file) => file.kind === 'image')
    .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))[0];
  if (image) {
    return { kind: 'image', filePath: image.path };
  }

  const video = files
    .filter((file) => file.kind === 'video')
    .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))[0];
  if (video) {
    return { kind: 'video', filePath: video.path };
  }

  return null;
}

function ProjectTag({ category }: { category: string }) {
  return (
    <span className={`design-card-tag design-card-tag--${projectKindClass(category)}`}>
      {category}
    </span>
  );
}

function ProjectCard({
  project,
  cover,
}: {
  project: DesignProjectSummary;
  cover: ProjectCover;
}) {
  const initial = project.name.trim().charAt(0).toUpperCase() || 'P';
  const thumbStyle = projectThumbStyle(project.id);

  return (
    <div role="listitem" className="recent-projects__card" data-project-id={project.id}>
      <button
        type="button"
        className="recent-projects__card-main"
        onClick={() => navigateDesign(designPathForView('studio', { projectId: project.id }))}
        title={project.name}
        data-testid="design-recent-project"
      >
        <div
          className={`recent-projects__card-thumb recent-projects__card-thumb-${cover.kind === 'fallback' ? 'html' : cover.kind}`}
          style={thumbStyle}
          aria-hidden
        >
          {cover.kind === 'image' && cover.filePath ? (
            <img
              className="recent-projects__thumb-media"
              src={projectRawFileUrl(project.id, cover.filePath)}
              alt=""
              loading="lazy"
            />
          ) : cover.kind === 'video' && cover.filePath ? (
            <video
              className="recent-projects__thumb-media"
              src={projectRawFileUrl(project.id, cover.filePath)}
              muted
              preload="metadata"
              playsInline
            />
          ) : cover.kind === 'html' && cover.srcdoc ? (
            <iframe
              className="recent-projects__thumb-iframe"
              title=""
              sandbox="allow-scripts allow-same-origin"
              srcDoc={cover.srcdoc}
            />
          ) : (
            <span className="recent-projects__card-glyph">{initial}</span>
          )}
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
  const recent = useMemo(() => projects.slice(0, 6), [projects]);
  const [coversByProject, setCoversByProject] = useState<Record<string, ProjectCover>>({});

  useEffect(() => {
    if (recent.length === 0) {
      setCoversByProject({});
      return;
    }

    let cancelled = false;

    void Promise.all(
      recent.map(async (project) => {
        try {
          const files = await listProjectFiles(project.id);
          const match = findCoverFile(files);
          if (!match) {
            return [project.id, { kind: 'fallback' as const }] as const;
          }
          if (match.kind === 'html') {
            const srcdoc = await resolveProjectPreviewSrcdoc(project.id, match.filePath, {
              projectKind: project.kind,
              fileKind: 'html',
            });
            return [
              project.id,
              { kind: 'html' as const, filePath: match.filePath, srcdoc: srcdoc ?? undefined },
            ] as const;
          }
          return [project.id, { kind: match.kind, filePath: match.filePath }] as const;
        } catch {
          return [project.id, { kind: 'fallback' as const }] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      setCoversByProject(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [recent]);

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
          <ProjectCard
            key={project.id}
            project={project}
            cover={coversByProject[project.id] ?? { kind: 'fallback' }}
          />
        ))}
      </div>
    </section>
  );
}
