import { X } from 'lucide-react';
import React from 'react';

interface CommandCardProps {
  command: string;
  description: string;
  onSelect: (command: string) => void;
  onDismiss?: (command: string) => void;
}

export default function CommandCard({
  command,
  description,
  onSelect,
  onDismiss,
}: CommandCardProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        data-testid={`command-card-${command.slice(1).replace(/[:/]/g, '-')}`}
        className="flex w-full flex-col items-start rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-violet-200 hover:bg-violet-50/50"
        onClick={() => onSelect(command)}
      >
        <span className="mb-2 flex items-center gap-2 pr-6">
          <svg className="h-5 w-5 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M4 7h16M4 12h10M4 17h16" />
          </svg>
          <span className="font-mono text-xs font-semibold text-violet-600">{command}</span>
        </span>
        <span className="text-xs text-gray-500">{description || 'Harness command'}</span>
      </button>
      {onDismiss ? (
        <button
          type="button"
          className="absolute right-2 top-2 rounded-md p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100"
          aria-label={`Remove ${command} from suggestions`}
          data-testid={`command-card-dismiss-${command.slice(1).replace(/[:/]/g, '-')}`}
          onClick={(event) => {
            event.stopPropagation();
            onDismiss(command);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
