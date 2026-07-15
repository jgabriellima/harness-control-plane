import { Terminal, X } from 'lucide-react';
import React from 'react';

interface ComposerSlashCommandBadgeProps {
  command: string;
  onRemove: () => void;
  disabled?: boolean;
}

export default function ComposerSlashCommandBadge({
  command,
  onRemove,
  disabled = false,
}: ComposerSlashCommandBadgeProps) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-violet-200 bg-violet-50 py-0.5 pl-2 pr-1 text-xs text-violet-900"
      data-testid="composer-slash-command-badge"
      data-slash-command={command}
    >
      <span className="inline-flex min-w-0 max-w-[16rem] items-center gap-1 truncate font-mono font-medium">
        <Terminal className="h-3 w-3 shrink-0 text-violet-600" aria-hidden="true" />
        <span className="truncate">{command}</span>
      </span>
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-violet-600 hover:bg-violet-100 hover:text-violet-900 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        aria-label={`Remove ${command}`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}
