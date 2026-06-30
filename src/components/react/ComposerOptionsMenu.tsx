'use client';

import { Check, Database, Paperclip, Plus, Sparkles } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface ComposerOptionsMenuProps {
  disabled?: boolean;
  deepResearch: boolean;
  integrationsOpen: boolean;
  onAttach: () => void;
  onToggleIntegrations: () => void;
  onToggleDeepResearch: () => void;
}

export default function ComposerOptionsMenu({
  disabled = false,
  deepResearch,
  integrationsOpen,
  onAttach,
  onToggleIntegrations,
  onToggleDeepResearch,
}: ComposerOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const hasActiveOption = deepResearch || integrationsOpen;

  return (
    <div ref={rootRef} className="relative shrink-0 self-end">
      <button
        type="button"
        data-testid="chat-composer-options-trigger"
        aria-label="Composer options"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50',
          open && 'bg-gray-100 text-gray-700',
        )}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <Plus className="h-5 w-5" />
        {hasActiveOption ? (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gray-900" aria-hidden />
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          data-testid="chat-composer-options-menu"
          className="absolute bottom-full left-0 z-20 mb-2 min-w-[12rem] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            data-testid="chat-composer-option-attach"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              onAttach();
            }}
          >
            <Paperclip className="h-4 w-4 shrink-0 text-gray-500" />
            Attach
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="chat-composer-option-integrations"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              onToggleIntegrations();
            }}
          >
            <Database className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="flex-1">Integrations</span>
            {integrationsOpen ? <Check className="h-4 w-4 shrink-0 text-gray-900" /> : null}
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="chat-composer-option-deep-research"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => {
              onToggleDeepResearch();
            }}
          >
            <Sparkles className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="flex-1">Deep research</span>
            {deepResearch ? <Check className="h-4 w-4 shrink-0 text-gray-900" /> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
