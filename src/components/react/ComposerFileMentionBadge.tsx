import { FileText, X } from 'lucide-react';
import React from 'react';

import type { FileMentionSuggestion } from '@/lib/composer-mention';

interface ComposerFileMentionBadgeProps {
  file: FileMentionSuggestion;
  onOpen: (path: string) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export default function ComposerFileMentionBadge({
  file,
  onOpen,
  onRemove,
  disabled = false,
}: ComposerFileMentionBadgeProps) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200 bg-gray-50 py-0.5 pl-2 pr-1 text-xs text-gray-800"
      data-testid="composer-file-mention-badge"
      data-file-path={file.path}
    >
      <button
        type="button"
        className="inline-flex min-w-0 max-w-[14rem] items-center gap-1 truncate font-medium text-gray-800 hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        aria-label={`Open ${file.name} in preview`}
        onClick={(event) => {
          event.stopPropagation();
          onOpen(file.path);
        }}
      >
        <FileText className="h-3 w-3 shrink-0 text-gray-500" aria-hidden="true" />
        <span className="truncate">{file.name}</span>
      </button>
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        aria-label={`Remove ${file.name}`}
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
