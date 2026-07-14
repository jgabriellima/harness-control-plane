'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Archive, FolderInput, MoreVertical, Trash2 } from 'lucide-react';

import { clientNavigate } from '@/lib/client-nav';
import { useProjects } from '@/hooks/useProjects';
import { invalidateSidebarCache } from '@/lib/sidebar-cache';

interface ConversationActionsMenuProps {
  conversationId: string;
  projectId: string;
  activeProjectId?: string;
  compact?: boolean;
  menuTestId?: string;
  onChanged?: () => void;
}

function notifyConversationsChanged(): void {
  invalidateSidebarCache('conversations');
  window.dispatchEvent(new CustomEvent('runtime:conversations-changed'));
}

export default function ConversationActionsMenu({
  conversationId,
  projectId,
  activeProjectId,
  compact = false,
  menuTestId = 'conversation-actions-menu',
  onChanged,
}: ConversationActionsMenuProps) {
  const projects = useProjects();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setMoveOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setMoveOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  async function patchConversation(body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? 'Failed to update conversation');
    }
  }

  function handleChanged(navigateHome = false): void {
    notifyConversationsChanged();
    onChanged?.();
    if (navigateHome) {
      void clientNavigate('/');
    }
  }

  async function handleArchive(): Promise<void> {
    try {
      await patchConversation({ archived: true });
      setMenuOpen(false);
      handleChanged(true);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleMove(targetProjectId: string): Promise<void> {
    if (targetProjectId === projectId) {
      setMenuOpen(false);
      setMoveOpen(false);
      return;
    }

    try {
      await patchConversation({ project_id: targetProjectId });
      setMenuOpen(false);
      setMoveOpen(false);
      const movedAwayFromActiveProject =
        Boolean(activeProjectId) && targetProjectId !== activeProjectId;
      handleChanged(movedAwayFromActiveProject);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleDelete(): Promise<void> {
    const confirmed = window.confirm(
      'Delete this conversation? This cannot be undone.',
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Failed to delete conversation');
      }

      setMenuOpen(false);
      handleChanged(true);
    } catch (error) {
      console.error(error);
    }
  }

  const moveTargets = projects.filter((project) => project.id !== projectId);

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        data-testid={menuTestId}
        aria-label="Conversation actions"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className={`rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 ${
          compact ? '' : ''
        }`}
        onClick={() => {
          setMoveOpen(false);
          setMenuOpen((current) => !current);
        }}
      >
        <MoreVertical className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          data-testid={`${menuTestId}-panel`}
        >
          <button
            type="button"
            role="menuitem"
            data-testid={`${menuTestId}-archive`}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
            onClick={() => {
              void handleArchive();
            }}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>Archive</span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-testid={`${menuTestId}-move`}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setMoveOpen((current) => !current);
            }}
          >
            <FolderInput className="h-3.5 w-3.5" />
            <span>Move to project</span>
          </button>

          {moveOpen ? (
            <div className="border-t border-gray-100 py-1" data-testid={`${menuTestId}-move-targets`}>
              {moveTargets.length === 0 ? (
                <p className="px-3 py-1 text-[10px] text-gray-500">No other projects</p>
              ) : (
                moveTargets.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    role="menuitem"
                    data-testid={`${menuTestId}-move-${project.id}`}
                    className="block w-full truncate px-3 py-1 text-left text-xs text-gray-600 hover:bg-gray-50"
                    onClick={() => {
                      void handleMove(project.id);
                    }}
                  >
                    {project.name}
                  </button>
                ))
              )}
            </div>
          ) : null}

          <button
            type="button"
            role="menuitem"
            data-testid={`${menuTestId}-delete`}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
            onClick={() => {
              void handleDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
