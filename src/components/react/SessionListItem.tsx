import React from 'react';

import ConversationActionsMenu from '@/components/react/ConversationActionsMenu';
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

import { appConversationPath } from '@/lib/shell-paths';

function sessionHref(sessionId: string): string {
  return appConversationPath(sessionId);
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
  activeProjectId,
  onSessionChanged,
}: SessionListItemProps) {
  return (
    <li className="group relative" data-testid={`sidebar-session-${session.id}`}>
      <div
        className={`flex items-center gap-1 rounded-lg pr-1 ${
          isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
        }`}
      >
        <a
          href={sessionHref(session.id)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
            isActive
              ? 'font-medium text-gray-700'
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

        <ConversationActionsMenu
          conversationId={session.id}
          projectId={session.projectId}
          activeProjectId={activeProjectId}
          menuTestId={`sidebar-session-menu-${session.id}`}
          onChanged={onSessionChanged}
        />
      </div>
    </li>
  );
}
