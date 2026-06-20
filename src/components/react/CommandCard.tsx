import React from 'react';

interface CommandCardProps {
  command: string;
  description: string;
  onSelect: (command: string) => void;
}

export default function CommandCard({ command, description, onSelect }: CommandCardProps) {
  return (
    <button
      type="button"
      data-testid={`command-card-${command.slice(1).replace(/[:/]/g, '-')}`}
      className="flex flex-col items-start rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-violet-200 hover:bg-violet-50/50"
      onClick={() => onSelect(command)}
    >
      <span className="mb-2 flex items-center gap-2">
        <svg className="h-5 w-5 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M4 7h16M4 12h10M4 17h16" />
        </svg>
        <span className="font-mono text-xs font-semibold text-violet-600">{command}</span>
      </span>
      <span className="text-xs text-gray-500">{description || 'Harness command'}</span>
    </button>
  );
}
