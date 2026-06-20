import React, { useEffect, useRef, useState } from 'react';
import { Archive, FolderInput, MoreHorizontal, Trash2 } from 'lucide-react';

import { clientNavigate } from '../../lib/client-nav';
import { isPlaceholderSessionTitle } from '../../lib/session-title';

export interface SessionListItemData {
  id: string;
  title: string;
  projectId: string;
  agentId?: string;
}

interface SessionListItemProps {
  session: SessionListItemData;
  isActive: boolean;
  projects: Array<{ id: string; name: string }>;
  activeProjectId?: string;
  onSessionChanged: () => void;
}

function sessionHref(sessionId: string): string {
  return `/conversation/${encodeURIComponent(sessionId)}`;
}

function formatSessionTitle(session: SessionListItemData): string {
  if (!isPlaceholderSessionTitle(session.title)) {
    return session.title;
  }
  if (session.agentId) {
    return `Session ${session.agentId.slice(0, 8)}`;
  }
  return session.title;
}

export default function SessionListItem({
  session,
  isActive,
  projects,
  activeProjectId,
  onSessionChanged,
}: SessionListItemProps) {
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

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [menuOpen]);

  async function patchSession(body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`/api/conversations/${encodeURIComponent(session.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? 'Failed to update session');
    }
  }

  async function handleArchive(): Promise<void> {
    try {
      await patchSession({ archived: true });
      setMenuOpen(false);
      onSessionChanged();
      if (isActive) {
        await clientNavigate('/');
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function handleMove(targetProjectId: string): Promise<void> {
    if (targetProjectId === session.projectId) {
      setMenuOpen(false);
      setMoveOpen(false);
      return;
    }

    try {
      await patchSession({ project_id: targetProjectId });
      setMenuOpen(false);
      setMoveOpen(false);
      onSessionChanged();
      if (isActive && activeProjectId && targetProjectId !== activeProjectId) {
        await clientNavigate('/');
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function handleRemove(): Promise<void> {
    const confirmed = window.confirm('Remove this session from the project? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(session.id)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Failed to remove session');
      }

      setMenuOpen(false);
      onSessionChanged();
      if (isActive) {
        await clientNavigate('/');
      }
    } catch (error) {
      console.error(error);
    }
  }

  const moveTargets = projects.filter((project) => project.id !== session.projectId);

  return (
    <li className="group relative" data-testid={`sidebar-session-${session.id}`}>
      <div
        className={`flex items-center gap-1 rounded-lg pr-1 ${
          isActive ? 'bg-violet-50' : 'hover:bg-gray-50'
        }`}
      >
        <a
          href={sessionHref(session.id)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
            isActive
              ? 'font-medium text-violet-700'
              : 'text-gray-600 group-hover:text-gray-900'
          }`}
          aria-current={isActive ? 'page' : undefined}
        >
          <svg
            className="h-4 w-4 shrink-0 text-gray-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="truncate">{formatSessionTitle(session)}</span>
        </a>

        <button
          type="button"
          className="rounded-md p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100 focus:opacity-100"
          aria-label="Session actions"
          aria-expanded={menuOpen}
          data-testid={`sidebar-session-menu-${session.id}`}
          onClick={() => {
            setMoveOpen(false);
            setMenuOpen((current) => !current);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {menuOpen ? (
        <div
          ref={menuRef}
          className="absolute right-2 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          data-testid={`sidebar-session-menu-panel-${session.id}`}
        >
          <button
            type="button"
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
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setMoveOpen((current) => !current);
            }}
          >
            <FolderInput className="h-3.5 w-3.5" />
            <span>Move to project</span>
          </button>

          {moveOpen ? (
            <div className="border-t border-gray-100 py-1">
              {moveTargets.length === 0 ? (
                <p className="px-3 py-1 text-[10px] text-gray-500">No other projects</p>
              ) : (
                moveTargets.map((project) => (
                  <button
                    key={project.id}
                    type="button"
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
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
            onClick={() => {
              void handleRemove();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Remove</span>
          </button>
        </div>
      ) : null}
    </li>
  );
}
