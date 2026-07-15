'use client';

import React, { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { startBrandExtraction } from '@/lib/design-api';
import { designPathForView } from '@/lib/design-navigation';
import { navigateDesign } from '@/lib/design-shell-navigation';

export default function DesignSystemCreateView() {
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [designMd, setDesignMd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    const trimmedUrl = url.trim();
    const trimmedMd = designMd.trim();
    const trimmedDescription = description.trim();

    if (!trimmedUrl && !trimmedMd && !trimmedDescription) {
      setError('Provide a website URL, DESIGN.md content, or a short brand description.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await startBrandExtraction({
        url: trimmedUrl || undefined,
        description: trimmedDescription || undefined,
        designMd: trimmedMd || undefined,
      });

      if (result.designSystemId) {
        navigateDesign(
          designPathForView('design-system-detail', { designSystemId: result.designSystemId }),
        );
        return;
      }

      navigateDesign(designPathForView('studio', { projectId: result.projectId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start design system extraction');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-[var(--bg)] px-8 py-10" data-testid="design-system-create-view">
      <button
        type="button"
        className="mb-6 inline-flex items-center gap-2 text-[13px] text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
        onClick={() => navigateDesign(designPathForView('design-systems'))}
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Design systems
      </button>

      <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">
        New design system
      </p>
      <h1 className="mt-2 font-serif text-[36px] text-[var(--text)]">Create a design system</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[var(--text-muted)]">
        Paste a brand URL, DESIGN.md contract, or a short description. The daemon extracts tokens and
        opens a studio project for refinement.
      </p>

      <div className="mt-8 max-w-2xl space-y-4 rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-md)]">
        <label className="block">
          <span className="text-[13px] font-medium text-[var(--text)]">Brand website URL</span>
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--text)] outline-none focus:border-[var(--border)]"
            data-testid="design-system-create-url"
          />
        </label>

        <label className="block">
          <span className="text-[13px] font-medium text-[var(--text)]">Short description</span>
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="B2B analytics brand with navy primary and geometric sans"
            className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--text)] outline-none focus:border-[var(--border)]"
            data-testid="design-system-create-description"
          />
        </label>

        <label className="block">
          <span className="text-[13px] font-medium text-[var(--text)]">DESIGN.md (optional)</span>
          <textarea
            value={designMd}
            onChange={(event) => setDesignMd(event.target.value)}
            placeholder="# Brand contract&#10;Primary: #0B1F3A&#10;Font: Inter"
            className="mt-2 min-h-[140px] w-full resize-y rounded-xl border border-[var(--border-soft)] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--text)] outline-none focus:border-[var(--border)]"
            data-testid="design-system-create-design-md"
          />
        </label>

        {error ? (
          <p className="text-[13px] text-[var(--red)]" data-testid="design-system-create-error">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--text-strong)] px-5 py-2.5 text-[13px] font-medium text-[var(--bg-elevated)] disabled:opacity-40"
          data-testid="design-system-create-submit"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Generate design system
        </button>
      </div>
    </div>
  );
}
