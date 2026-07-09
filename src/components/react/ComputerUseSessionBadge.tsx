import React from 'react';

import type { ComputerUseTargetMode } from '@/lib/runtime-computer-use-types';
import { computerUseTargetModeLabel } from '@/lib/runtime-computer-use-types';

interface ComputerUseSessionBadgeProps {
  mode: ComputerUseTargetMode;
  onOpenPreview?: () => void;
}

/** Shown when My computer or Sandbox is enabled for this chat (not global Settings). */
export default function ComputerUseSessionBadge({
  mode,
  onOpenPreview,
}: ComputerUseSessionBadgeProps) {
  const label = mode === 'sandbox' ? 'Sandbox' : 'CUA';

  if (onOpenPreview) {
    return (
      <button
        type="button"
        className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 hover:bg-emerald-100"
        data-testid="computer-use-session-badge"
        title={`${computerUseTargetModeLabel(mode)} — open preview`}
        onClick={onOpenPreview}
      >
        {label}
      </button>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
      data-testid="computer-use-session-badge"
      title={`${computerUseTargetModeLabel(mode)} enabled for this chat`}
    >
      {label}
    </span>
  );
}
