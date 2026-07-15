'use client';

import React, { useEffect, useState } from 'react';
import { ArrowUp, Loader2, Paperclip } from 'lucide-react';

import BrandLogo from '@/components/react/BrandLogo';
import type { PresentationAssets } from '@/lib/ui-branding';
import {
  createDesignProject,
  DESIGN_APPLIED_PLUGIN_QUERY_KEY,
  formatProjectUpdatedAt,
  listDesignProjects,
  listSkills,
  skillsToChips,
} from '@/lib/design-api';
import {
  buildOrchestratorProjectDefaults,
  fetchHarnessWorkspaceContext,
  storeDesignPendingPrompt,
} from '@/lib/design-harness-context';
import { type DesignProjectSummary, type DesignSkillChip, DESIGN_SKILL_CHIPS } from '@/lib/design-navigation';
import type { DesignDaemonHealth } from '@/lib/design-daemon-client';
import { navigateDesign } from '@/lib/design-shell-navigation';
import DesignRecentProjectsStrip from './DesignRecentProjectsStrip';

interface DesignHomeViewProps {
  presentationTitle: string;
  brandAssets?: PresentationAssets;
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
      className={`home-hero__rail-chip${selected ? ' is-active' : ''}`}
      onClick={() => onSelect(chip)}
      data-testid={`design-skill-chip-${chip.id}`}
    >
      <span className="home-hero__rail-chip-label">{chip.label}</span>
    </button>
  );
}

export default function DesignHomeView({ presentationTitle, brandAssets }: DesignHomeViewProps) {
  const [brief, setBrief] = useState('');
  const [skillChips, setSkillChips] = useState<DesignSkillChip[]>(DESIGN_SKILL_CHIPS);
  const [selectedSkill, setSelectedSkill] = useState<DesignSkillChip | null>(DESIGN_SKILL_CHIPS[0] ?? null);
  const [health, setHealth] = useState<DesignDaemonHealth | null>(null);
  const [projects, setProjects] = useState<DesignProjectSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [skillsLoading, setSkillsLoading] = useState(true);

  useEffect(() => {
    const appliedQuery = sessionStorage.getItem(DESIGN_APPLIED_PLUGIN_QUERY_KEY);
    if (appliedQuery) {
      sessionStorage.removeItem(DESIGN_APPLIED_PLUGIN_QUERY_KEY);
      setBrief(appliedQuery);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const healthResponse = await fetch('/api/design/health');
        const healthPayload = (await healthResponse.json()) as DesignDaemonHealth;
        if (!cancelled) {
          setHealth(healthPayload);
        }
      } catch {
        if (!cancelled) {
          setHealth({
            ok: false,
            port: 7456,
            vendorPresent: false,
            error: 'Failed to reach design daemon',
          });
        }
      }
    }

    void loadHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSkills() {
      try {
        const skills = await listSkills();
        if (cancelled) {
          return;
        }
        const chips = skills.length > 0 ? skillsToChips(skills) : DESIGN_SKILL_CHIPS;
        setSkillChips(chips.length > 0 ? chips : DESIGN_SKILL_CHIPS);
        setSelectedSkill((current) => current ?? chips[0] ?? DESIGN_SKILL_CHIPS[0] ?? null);
      } finally {
        if (!cancelled) {
          setSkillsLoading(false);
        }
      }
    }

    void loadSkills();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (health && !health.ok) {
      setProjectsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProjects() {
      try {
        const projectRows = await listDesignProjects();
        if (cancelled) {
          return;
        }
        setProjects(
          projectRows.slice(0, 12).map((project) => ({
            id: project.id,
            name: project.name,
            kind: project.metadata?.kind ?? 'Prototype',
            updatedAt: formatProjectUpdatedAt(project.updatedAt),
          })),
        );
      } catch {
        if (!cancelled) {
          setProjects([]);
        }
      } finally {
        if (!cancelled) {
          setProjectsLoading(false);
        }
      }
    }

    if (health?.ok) {
      void loadProjects();
    }

    return () => {
      cancelled = true;
    };
  }, [health?.ok]);

  async function handleSubmit() {
    const trimmed = brief.trim();
    if (!trimmed || !selectedSkill || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const harnessContext = await fetchHarnessWorkspaceContext();
      const orchestratorDefaults =
        harnessContext && harnessContext.workspaceRoot.length > 0
          ? buildOrchestratorProjectDefaults(harnessContext)
          : undefined;

      const result = await createDesignProject({
        skillId: selectedSkill.id,
        pendingPrompt: trimmed,
        skipDiscoveryBrief: true,
        ...(orchestratorDefaults ?? {}),
      });
      storeDesignPendingPrompt(result.project.id, trimmed);
      navigateDesign(`/design/projects/${encodeURIComponent(result.project.id)}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not create project');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="home-view" data-testid="design-home-view">
      {health && !health.ok ? (
        <div className="home-hero__error" data-testid="design-daemon-banner">
          Design daemon unavailable — {health.error}
        </div>
      ) : null}

      <section className="home-hero" data-testid="home-hero">
        <div className="home-hero__brand">
          <BrandLogo variant="icon" title={presentationTitle} assets={brandAssets} className="home-hero__brand-logo" />
          <span className="home-hero__brand-name">{presentationTitle}</span>
        </div>
        <p className="home-hero__eyebrow">SOFTWARE AS A RELATIONSHIP</p>
        <h1 className="home-hero__title">What do you want to design?</h1>
        <p className="home-hero__subtitle">
          The design studio inside {presentationTitle} — people-first product work, orchestrated by your runtime.
        </p>

        <div className="home-hero__input-card">
          <div className="home-hero__prompt-surface">
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
              className="home-hero__prompt-editor"
              data-testid="design-brief-input"
            />
            <div className="home-hero__input-foot">
              <div className="home-hero__foot-left">
                <button
                  type="button"
                  className="home-hero__attach-btn"
                  aria-label="Attach files"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              </div>
              <div className="home-hero__foot-right">
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  className="home-hero__send-btn"
                  disabled={!brief.trim() || !selectedSkill || submitting || !health?.ok}
                  aria-label="Send brief"
                  data-testid="design-brief-submit"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {submitError ? (
          <div role="alert" className="home-hero__error" data-testid="design-brief-error">
            {submitError}
          </div>
        ) : null}

        <div className="home-hero__rail-scroller" data-testid="design-skill-chips">
          <div className="home-hero__rail-chips" role="list">
            {skillsLoading ? (
              <span className="home-hero__rail-chip home-hero__rail-chip--loading">Loading skills…</span>
            ) : (
              skillChips.map((chip) => (
                <SkillChipButton
                  key={chip.id}
                  chip={chip}
                  selected={selectedSkill?.id === chip.id}
                  onSelect={setSelectedSkill}
                />
              ))
            )}
          </div>
        </div>
      </section>

      <DesignRecentProjectsStrip projects={projects} loading={projectsLoading} />
    </div>
  );
}
