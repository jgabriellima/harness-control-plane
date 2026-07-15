'use client';

import React, { useEffect, useState } from 'react';

import { listDesignSystems, type DesignSystemRecord } from '@/lib/design-api';
import { designPathForView } from '@/lib/design-navigation';
import { navigateDesign } from '@/lib/design-shell-navigation';

function SwatchRow({ swatches }: { swatches: string[] }) {
  if (swatches.length === 0) {
    return (
      <div className="flex h-8 items-center rounded-lg border border-dashed border-[var(--border-soft)] px-3 text-[11px] text-[var(--text-soft)]">
        No swatches
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {swatches.slice(0, 5).map((color) => (
        <span
          key={color}
          className="h-8 w-8 rounded-lg border border-[var(--border-soft)]"
          style={{ backgroundColor: color }}
          title={color}
        />
      ))}
    </div>
  );
}

function DesignSystemCard({ system }: { system: DesignSystemRecord }) {
  return (
    <article
      className="flex cursor-pointer flex-col rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)] transition hover:border-[var(--border)]"
      data-testid="design-system-card"
      onClick={() =>
        navigateDesign(designPathForView('design-system-detail', { designSystemId: system.id }))
      }
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigateDesign(designPathForView('design-system-detail', { designSystemId: system.id }));
        }
      }}
      role="link"
      tabIndex={0}
    >
      <SwatchRow swatches={system.swatches ?? []} />
      <h3 className="mt-4 text-[16px] font-semibold text-[var(--text)]">{system.title}</h3>
      <p className="mt-2 flex-1 text-[14px] leading-6 text-[var(--text-muted)]">{system.summary}</p>
      {system.category ? (
        <span className="mt-4 inline-flex w-fit rounded-full bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
          {system.category}
        </span>
      ) : null}
    </article>
  );
}

export default function DesignSystemsView() {
  const [systems, setSystems] = useState<DesignSystemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const rows = await listDesignSystems();
        if (!cancelled) {
          setSystems(rows);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load design systems');
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

  return (
    <div data-testid="design-systems-view">
      <p className="entry-kicker">Design systems</p>
      <h1 className="entry-page-title">Design systems</h1>
      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="max-w-2xl text-[15px] text-[var(--text-muted)]">
          Distill your team&apos;s DESIGN.md into a brand contract that shapes every output.
        </p>
        <button
          type="button"
          onClick={() => navigateDesign(designPathForView('design-system-create'))}
          className="shrink-0 rounded-full bg-[var(--text-strong)] px-4 py-2 text-[12px] font-medium text-[var(--bg-elevated)]"
          data-testid="design-system-create-cta"
        >
          Create design system
        </button>
      </div>

      {loading ? (
        <div className="mt-8 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-6 py-12 text-[14px] text-[var(--text-muted)]">
          Loading design systems...
        </div>
      ) : error ? (
        <div className="mt-8 rounded-2xl border border-[var(--red-border)] bg-[var(--red-bg)] px-6 py-12 text-[14px] text-[var(--text)]">
          {error}
        </div>
      ) : systems.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-12 text-[14px] text-[var(--text-muted)]">
          No design systems available yet.
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {systems.map((system) => (
            <DesignSystemCard key={system.id} system={system} />
          ))}
        </div>
      )}
    </div>
  );
}
