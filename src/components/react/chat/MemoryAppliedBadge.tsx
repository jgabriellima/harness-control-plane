'use client';

import { Brain } from 'lucide-react';
import React, { useState } from 'react';

export interface MemoryAppliedBadgeProps {
  briefTitle?: string;
  briefContent?: string;
}

export default function MemoryAppliedBadge({
  briefTitle = 'Memory applied',
  briefContent,
}: MemoryAppliedBadgeProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="memory-applied" data-testid="memory-applied-badge">
      <button
        type="button"
        className="memory-applied__pill"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Brain className="memory-applied__icon" aria-hidden="true" />
        <span>{briefTitle}</span>
        <span className="memory-applied__link">View brief</span>
      </button>
      {open && briefContent ? (
        <div className="memory-applied__brief">
          <pre>{briefContent}</pre>
        </div>
      ) : null}
    </div>
  );
}
