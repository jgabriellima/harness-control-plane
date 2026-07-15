'use client';

import { MessageCircle, FileText, Sparkles } from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';

import type { ChatSessionMode } from '@/lib/chat-types';

interface ModeMeta {
  mode: ChatSessionMode;
  label: string;
  title: string;
  summary: string;
  icon: React.ReactNode;
}

const MODES: ModeMeta[] = [
  {
    mode: 'chat',
    label: 'Ask',
    title: 'Ask mode',
    summary: 'Lightweight Q&A without artifact-first delivery.',
    icon: <MessageCircle className="h-3.5 w-3.5" />,
  },
  {
    mode: 'plan',
    label: 'Plan',
    title: 'Plan mode',
    summary: 'Produce a markdown plan before generating artifacts.',
    icon: <FileText className="h-3.5 w-3.5" />,
  },
  {
    mode: 'design',
    label: 'Design',
    title: 'Design mode',
    summary: 'Artifact-first design sessions with delivery gate.',
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
];

export interface SessionModeToggleProps {
  mode: ChatSessionMode;
  onChange: (mode: ChatSessionMode) => void;
  disabled?: boolean;
}

export default function SessionModeToggle({ mode, onChange, disabled = false }: SessionModeToggleProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const active = MODES.find((entry) => entry.mode === mode) ?? MODES[0];

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div className="session-mode-toggle" ref={rootRef} data-testid="session-mode-toggle">
      <button
        type="button"
        className="session-mode-toggle__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="session-mode-toggle__icon">{active.icon}</span>
        <span className="session-mode-toggle__label">{active.label}</span>
      </button>
      {open ? (
        <div className="session-mode-toggle__menu" role="listbox" id={listboxId}>
          {MODES.map((entry) => (
            <button
              key={entry.mode}
              type="button"
              role="option"
              aria-selected={entry.mode === mode}
              className={`session-mode-toggle__option${entry.mode === mode ? ' is-active' : ''}`}
              onClick={() => {
                onChange(entry.mode);
                setOpen(false);
              }}
            >
              <span className="session-mode-toggle__option-icon">{entry.icon}</span>
              <span className="session-mode-toggle__option-copy">
                <span className="session-mode-toggle__option-title">{entry.title}</span>
                <span className="session-mode-toggle__option-summary">{entry.summary}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
