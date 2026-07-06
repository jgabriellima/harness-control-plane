'use client';

import React from 'react';

export interface VoiceTranscriptionSetupBannerProps {
  phase: string | null;
  progress: number;
  message: string | null;
}

function phaseLabel(phase: string | null): string {
  switch (phase) {
    case 'python':
      return 'Checking Python runtime';
    case 'venv':
      return 'Creating local environment';
    case 'packages':
      return 'Installing speech dependencies';
    case 'model':
      return 'Downloading speech model';
    case 'ready':
      return 'Voice input ready';
    default:
      return 'Setting up voice input';
  }
}

export default function VoiceTranscriptionSetupBanner({
  phase,
  progress,
  message,
}: VoiceTranscriptionSetupBannerProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const label = message?.trim() || phaseLabel(phase);

  return (
    <div
      className="mb-2 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5"
      data-testid="voice-transcription-setup-banner"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-amber-950">{label}</p>
        <span className="shrink-0 text-[11px] tabular-nums text-amber-800">{clampedProgress}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-100">
        <div
          className="h-full rounded-full bg-amber-500 transition-[width] duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
          data-testid="voice-transcription-setup-progress"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-amber-800/90">
        One-time setup runs at install. Voice input unlocks when this completes.
      </p>
    </div>
  );
}
