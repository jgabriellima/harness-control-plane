'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Monitor, MoreVertical } from 'lucide-react';

import { useRuntimeBrowser } from '@/components/react/RuntimeBrowserProvider';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import { conversationIdFromPath, useShellPathname } from '@/lib/shell-navigation';

export default function WorkspaceHeaderMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hub = useRuntimeHub();
  const pathname = useShellPathname();
  const { openBrowser } = useRuntimeBrowser();

  const conversationId =
    hub.foregroundConversationId ?? conversationIdFromPath(pathname);

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

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        data-testid="workspace-actions-menu"
        aria-label="Workspace actions"
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          data-testid="workspace-actions-dropdown"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              const url = window.prompt('Open runtime browser at URL:', 'https://');
              if (url?.trim()) {
                void openBrowser(url.trim(), conversationId);
              } else {
                void openBrowser('about:blank', conversationId);
              }
            }}
          >
            <Monitor className="h-3.5 w-3.5 shrink-0 text-gray-600" />
            <span>Open runtime browser</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
