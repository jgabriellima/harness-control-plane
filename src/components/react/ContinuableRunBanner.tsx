'use client';

import React from 'react';

import { Button } from '@/components/ui/button';

interface ContinuableRunBannerProps {
  message: string;
  resumable: boolean;
  onContinue: () => void;
  onDismiss: () => void;
  busy?: boolean;
}

export default function ContinuableRunBanner({
  message,
  resumable,
  onContinue,
  onDismiss,
  busy = false,
}: ContinuableRunBannerProps) {
  if (!resumable) {
    return (
      <div
        className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        role="status"
        data-testid="continuable-run-banner"
      >
        {message}
      </div>
    );
  }

  return (
    <div
      className="mt-2 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
      role="status"
      data-testid="continuable-run-banner"
    >
      <p className="min-w-0 flex-1">{message}</p>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDismiss} disabled={busy}>
          Dismiss
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="continuable-run-continue"
          onClick={onContinue}
          disabled={busy}
        >
          {busy ? 'Resuming…' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
