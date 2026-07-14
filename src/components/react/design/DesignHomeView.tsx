'use client';

import React, { useEffect, useState } from 'react';
import { ArrowUp, Loader2, Paperclip } from 'lucide-react';

import {
  createDesignProject,
  DESIGN_APPLIED_PLUGIN_QUERY_KEY,
  formatProjectUpdatedAt,
  listDesignProjects,
  listSkills,
  skillsToChips,
} from '@/lib/design-api';
import {
  type DesignProjectSummary,
  type DesignSkillChip,
} from '@/lib/design-navigation';
import type { DesignDaemonHealth } from '@/lib/design-daemon-client';
import { navigateDesign } from '@/lib/design-shell-navigation';

interface DesignHomeViewProps {
  presentationTitle: string;
}

function SkillChipButton({
  chip,
  selected,
  onSelect,
}: {
  chip: DesignSkillChip;
  selected: boolean;
  onSelect: (chip: DesignSkillChip) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(chip)}
      className={[
        'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition',
        selected
          ? 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-[var(--shadow-xs)]'
          : 'border-transparent bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]',
      ].join(' ')}
      data-testid={`design-skill-chip-${chip.id}`}
    >
      {chip.label}
    </button>
  );
}

function ProjectCard({ project }: { project: DesignProjectSummary }) {
  return (
    <a
      href={`/design/projects/${encodeURIComponent(project.id)}`}
      className="group flex min-w-[220px] flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] transition hover:border-[var(--border)]"
      data-testid="design-recent-project"
    >
      <div className="aspect-[4/3] bg-gradient-to-br from-[var(--accent-tint)] via-[var(--bg-subtle)] to-[var(--bg-muted)]" />
      <div className="flex flex-col gap-1 px-4 py-3">
        <span className="inline-flex w-fit rounded-full bg-[var(--accent-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
          {project.kind}
        </span>
        <p className="truncate text-[14px] font-semibold text-[var(--text)]">{project.name}</p>
        <p className="text-[12px] text-[var(--text-muted)]">Updated {project.updatedAt}</p>
      </div>
    </a>
  );
}

export default function DesignHomeView({ presentationTitle }: DesignHomeViewProps) {
  const [brief, setBrief] = useState('');
  const [skillChips, setSkillChips] = useState<DesignSkillChip[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<DesignSkillChip | null>(null);
  const [health, setHealth] = useState<DesignDaemonHealth | null>(null);
  const [projects, setProjects] = useState<DesignProjectSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const appliedQuery = sessionStorage.getItem(DESIGN_APPLIED_PLUGIN_QUERY_KEY);
    if (appliedQuery) {
      sessionStorage.removeItem(DESIGN_APPLIED_PLUGIN_QUERY_KEY);
      setBrief(appliedQuery);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const healthResponse = await fetch('/api/design/health');
        const healthPayload = (await healthResponse.json()) as DesignDaemonHealth;
        if (!cancelled) {
          setHealth(healthPayload);
        }

        const [skills, projectRows] = await Promise.all([
          listSkills(),
          healthPayload.ok ? listDesignProjects() : Promise.resolve([]),
        ]);

        if (cancelled) {
          return;
        }

        const chips = skillsToChips(skills);
        setSkillChips(chips);
        setSelectedSkill((current) => current ?? chips[0] ?? null);
        setProjects(
          projectRows.slice(0, 6).map((project) => ({
            id: project.id,
            name: project.name,
            kind: project.metadata?.kind ?? 'Prototype',
            updatedAt: formatProjectUpdatedAt(project.updatedAt),
          })),
        );
      } catch {
        if (!cancelled) {
          setHealth({
            ok: false,
            port: 7456,
            vendorPresent: false,
            error: 'Failed to reach design daemon',
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    const trimmed = brief.trim();
    if (!trimmed || !selectedSkill || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await createDesignProject({
        skillId: selectedSkill.id,
        pendingPrompt: trimmed,
        skipDiscoveryBrief: true,
      });
      navigateDesign(`/design/projects/${encodeURIComponent(result.project.id)}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not create project');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[var(--bg)]" data-testid="design-home-view">
      <div className="mx-auto flex w-full max-w-[980px] flex-col px-8 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">
              Open Design
            </p>
            <h1 className="mt-2 font-serif text-[40px] leading-[1.1] text-[var(--text)]">
              What do you want to design?
            </h1>
            <p className="mt-2 text-[15px] text-[var(--text-muted)]">
              The open-source design studio inside {presentationTitle}.
            </p>
          </div>
          {health && !health.ok ? (
            <div
              className="rounded-xl border border-[var(--amber)]/30 bg-[var(--amber-bg)] px-4 py-3 text-[13px] text-[var(--text)]"
              data-testid="design-daemon-banner"
            >
              <p className="font-medium">Design daemon unavailable</p>
              <p className="mt-1 text-[12px] text-[var(--text-muted)]">{health.error}</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow-md)]">
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Describe what you want to generate..."
            className="min-h-[120px] w-full resize-none border-0 bg-transparent text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-soft)]"
            data-testid="design-brief-input"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              aria-label="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--text-strong)] text-[var(--bg-elevated)] transition hover:bg-[var(--text)] disabled:opacity-40"
              disabled={!brief.trim() || !selectedSkill || submitting || !health?.ok}
              aria-label="Send brief"
              data-testid="design-brief-submit"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {submitError ? (
          <p className="mt-3 text-[13px] text-[var(--red)]" data-testid="design-brief-error">
            {submitError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2" data-testid="design-skill-chips">
          {skillChips.map((chip) => (
            <SkillChipButton
              key={chip.id}
              chip={chip}
              selected={selectedSkill?.id === chip.id}
              onSelect={setSelectedSkill}
            />
          ))}
        </div>

        <div className="mt-12" data-testid="design-recent-projects">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold text-[var(--text)]">Recent projects</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {loading ? (
              <div className="rounded-2xl border border-[var(--border-soft)] px-6 py-10 text-[14px] text-[var(--text-muted)]">
                Loading projects...
              </div>
            ) : projects.length > 0 ? (
              projects.map((project) => <ProjectCard key={project.id} project={project} />)
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-10 text-[14px] text-[var(--text-muted)]">
                No projects yet. Submit a brief to create your first design artifact.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
