import React from 'react';

import type { UserContextBadge, UserContextBadgeKind } from '@/lib/user-message-display';

const KIND_STYLES: Record<UserContextBadgeKind, string> = {
  slash_command: 'border-violet-200 bg-violet-50 text-violet-900',
  presentation: 'border-sky-200 bg-sky-50 text-sky-900',
  computer_use: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  mode: 'border-amber-200 bg-amber-50 text-amber-900',
  integration: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  attachment: 'border-gray-200 bg-gray-50 text-gray-800',
  schedule: 'border-orange-200 bg-orange-50 text-orange-900',
  skill: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900',
  internal: 'border-slate-200 bg-slate-50 text-slate-800',
  continue: 'border-teal-200 bg-teal-50 text-teal-900',
};

interface UserContextBadgeRowProps {
  badges: UserContextBadge[];
}

export default function UserContextBadgeRow({ badges }: UserContextBadgeRowProps) {
  if (badges.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-2 flex flex-wrap gap-1.5"
      data-testid="user-context-badges"
      aria-label="Message context"
    >
      {badges.map((badge) => (
        <span
          key={badge.id}
          className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight ${KIND_STYLES[badge.kind]}`}
          data-testid={`user-context-badge-${badge.kind}`}
          title={badge.detail}
        >
          <span className="truncate">{badge.label}</span>
        </span>
      ))}
    </div>
  );
}
