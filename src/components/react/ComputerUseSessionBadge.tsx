import React from 'react';

interface ComputerUseSessionBadgeProps {
  enabled: boolean;
}

/** Shown only when Computer Use is enabled for this chat session (not global Settings). */
export default function ComputerUseSessionBadge({ enabled }: ComputerUseSessionBadgeProps) {
  if (!enabled) {
    return null;
  }

  return (
    <span
      className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
      data-testid="computer-use-session-badge"
      title="Computer Use is enabled for this chat — desktop control tools are loaded"
    >
      CUA
    </span>
  );
}
