'use client';

import { MoreVertical } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

export interface ArtifactMenuAction {
  id: string;
  label: string;
  onSelect: () => void;
  testId?: string;
}

interface ArtifactActionsMenuProps {
  actions: ArtifactMenuAction[];
}

export default function ArtifactActionsMenu({ actions }: ArtifactActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        data-testid="chat-artifact-actions-menu"
        aria-label="Artifact actions"
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          data-testid="chat-artifact-actions-dropdown"
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              data-testid={action.testId}
              className="flex w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
