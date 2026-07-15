import { Paperclip, X } from 'lucide-react';
import React from 'react';

interface ComposerAttachmentBadgeProps {
  name: string;
  onRemove: () => void;
  disabled?: boolean;
}

export default function ComposerAttachmentBadge({
  name,
  onRemove,
  disabled = false,
}: ComposerAttachmentBadgeProps) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200 bg-gray-100 py-0.5 pl-2 pr-1 text-xs text-gray-700"
      data-testid="composer-attachment-badge"
      data-attachment-name={name}
    >
      <span className="inline-flex min-w-0 max-w-[16rem] items-center gap-1 truncate font-medium">
        <Paperclip className="h-3 w-3 shrink-0 text-gray-500" aria-hidden="true" />
        <span className="truncate">{name}</span>
      </span>
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        aria-label={`Remove ${name}`}
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
