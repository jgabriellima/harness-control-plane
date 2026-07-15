'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import {
  getDesignSystem,
  type DesignSystemDetailRecord,
  type DesignTokenSpecimen,
} from '@/lib/design-api';
import { designPathForView } from '@/lib/design-navigation';
import { navigateDesign } from '@/lib/design-shell-navigation';

interface DesignSystemDetailViewProps {
  designSystemId: string;
}

function isColorToken(token: DesignTokenSpecimen): boolean {
  if (token.type === 'color' || token.type === 'css-variable') {
    return /^#|^rgb|^hsl|^oklch|color-mix/i.test(token.value);
  }
  return /^#|^rgb|^hsl|^oklch/i.test(token.value);
}

function TokenSpecimenRow({ token }: { token: DesignTokenSpecimen }) {
  const showSwatch = isColorToken(token);

  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--border-soft)] px-4 py-3 last:border-b-0"
      data-testid="design-token-specimen"
    >
      <div className="min-w-0">
        <p className="truncate font-mono text-[13px] text-[var(--text-strong)]">{token.name}</p>
        <p className="mt-1 truncate font-mono text-[12px] text-[var(--text-muted)]">{token.value}</p>
        {token.layer ? (
          <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-soft)]">
            {token.layer}
          </p>
        ) : null}
      </div>
      {showSwatch ? (
        <span
          className="h-10 w-10 shrink-0 rounded-[var(--radius)] border border-[var(--border-soft)]"
          style={{ backgroundColor: token.value }}
          aria-hidden
        />
      ) : (
        <span className="rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
          {token.type ?? 'token'}
        </span>
      )}
    </li>
  );
}

export default function DesignSystemDetailView({ designSystemId }: DesignSystemDetailViewProps) {
  const [system, setSystem] = useState<DesignSystemDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const detail = await getDesignSystem(designSystemId);
        if (cancelled) {
          return;
        }
        if (!detail) {
          setError('Design system not found');
          setSystem(null);
          return;
        }
        setSystem(detail);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load design system');
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
  }, [designSystemId]);

  const tokenContract = system?.packageInfo?.sourceEvidence?.tokenContract;

  return (
    <div
      className="h-full overflow-auto bg-[var(--bg)] px-8 py-10"
      data-testid={`design-system-detail-${designSystemId}`}
    >
      <button
        type="button"
        className="mb-6 inline-flex items-center gap-2 text-[13px] text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
        onClick={() => navigateDesign(designPathForView('design-systems'))}
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Design systems
      </button>

      {loading ? (
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-6 py-12 text-[14px] text-[var(--text-muted)]">
          Loading design system...
        </div>
      ) : error ? (
        <div
          className="rounded-2xl border border-[var(--red-border)] bg-[var(--red-bg)] px-6 py-12 text-[14px] text-[var(--text)]"
          role="alert"
        >
          {error}
        </div>
      ) : system ? (
        <>
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">
            Design system
          </p>
          <h1 className="mt-2 font-serif text-[36px] text-[var(--text)]">{system.title}</h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[var(--text-muted)]">{system.summary}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {system.category ? (
              <span className="rounded-full bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                {system.category}
              </span>
            ) : null}
            {system.source ? (
              <span className="rounded-full bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                {system.source}
              </span>
            ) : null}
            {tokenContract?.grade ? (
              <span className="rounded-full bg-[var(--accent-tint)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
                Token contract: {tokenContract.grade}
                {typeof tokenContract.score === 'number' ? ` (${tokenContract.score})` : ''}
              </span>
            ) : null}
          </div>

          <section className="mt-10">
            <h2 className="text-[18px] font-semibold text-[var(--text)]">Token specimens</h2>
            <p className="mt-1 text-[14px] text-[var(--text-muted)]">
              Declared tokens from the design system package.
            </p>

            {system.tokens && system.tokens.length > 0 ? (
              <ul className="mt-4 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
                {system.tokens.map((token) => (
                  <TokenSpecimenRow key={`${token.name}-${token.value}`} token={token} />
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-10 text-[14px] text-[var(--text-muted)]">
                No token specimens available for this design system.
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
