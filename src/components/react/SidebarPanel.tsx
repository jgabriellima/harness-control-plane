import React, { useEffect, useRef, useState } from 'react';

import type { ExecutionSummary } from '../../lib/harness-types';

import BrandLogo from './BrandLogo';
import {
  invalidateSidebarCache,
  readSidebarCache,
  readStaleSidebarCache,
  writeSidebarCache,
} from '../../lib/sidebar-cache';
import { DRAFT_CONVERSATION_ID } from '@/lib/draft-conversation';
import { navigateShell, useShellPathname } from '@/lib/shell-navigation';
import { sidebarLayoutStore, useSidebarExpanded } from '@/lib/sidebar-layout-store';
import { useConversationStreamingPhase } from '@/hooks/useRuntimeConversation';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';

interface ProjectItem {
  id: string;
  name: string;
  active?: boolean;
  sessionCount?: number;
}

interface ConversationItem {
  id: string;
  title: string;
  projectId: string;
  updatedAt: string;
  active?: boolean;
  agentId?: string;
}

interface ProjectsResponse {
  projects: ProjectItem[];
}

interface ConversationsResponse {
  conversations: ConversationItem[];
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </p>
  );
}

function conversationHref(conversationId: string): string {
  return `/conversation/${encodeURIComponent(conversationId)}`;
}

function projectsHref(): string {
  return '/projects';
}

function activeConversationFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/conversation\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function activeExecutionFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/execution\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isRunsSectionActive(pathname: string): boolean {
  return pathname === '/executions' || pathname.startsWith('/execution/');
}

function settingsHref(): string {
  return '/settings';
}

function isSettingsActive(pathname: string): boolean {
  return pathname === '/settings' || pathname.startsWith('/settings/');
}

function toggleSidebarExpanded(expanded: boolean): void {
  sidebarLayoutStore.setExpanded(expanded);
  void sidebarLayoutStore.persistExpanded(expanded).catch(() => undefined);
}

const EXECUTIONS_CACHE_KEY = 'executions-list';

function useDismissOnOutside(open: boolean, onClose: () => void, containerRef: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [containerRef, onClose, open]);
}

function SidebarRailFlyout({
  label,
  testId,
  active,
  menuTestId,
  onToggle,
  open,
  menu,
  children,
}: {
  label: string;
  testId: string;
  active?: boolean;
  menuTestId: string;
  open: boolean;
  onToggle: () => void;
  menu: React.ReactNode;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(open, () => {
    if (open) {
      onToggle();
    }
  }, containerRef);

  return (
    <div className="relative" ref={containerRef}>
      <SidebarIconButton label={label} active={active || open} testId={testId} onClick={onToggle}>
        {children}
      </SidebarIconButton>
      {open ? (
        <div
          role="menu"
          data-testid={menuTestId}
          className="absolute left-full top-0 z-50 ml-2 max-h-64 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {menu}
        </div>
      ) : null}
    </div>
  );
}

function runsHref(): string {
  return '/executions';
}

function SidebarIconButton({
  label,
  active,
  testId,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  testId?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-gray-100 text-gray-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function CollapsedSidebarRail({
  runsSectionActive,
  settingsActive,
  projects,
  executions,
  activeProjectId,
  onNewChat,
  onActivateProject,
}: {
  runsSectionActive: boolean;
  settingsActive: boolean;
  projects: ProjectItem[];
  executions: ExecutionSummary[];
  activeProjectId: string | null;
  onNewChat: () => void;
  onActivateProject: (projectId: string) => void;
}) {
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);

  return (
    <aside
      className="relative z-30 flex h-full min-h-0 w-full flex-col items-center isolate overflow-hidden border-r border-gray-200 bg-white py-3"
      data-testid="sidebar-panel-collapsed"
    >
      <BrandLogo variant="icon" className="mb-4 shrink-0" />

      <div className="flex flex-1 flex-col items-center gap-2">
        <SidebarIconButton label="New chat" testId="sidebar-rail-new-chat" onClick={onNewChat}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </SidebarIconButton>

        <SidebarRailFlyout
          label="Projects"
          testId="sidebar-rail-projects"
          menuTestId="sidebar-rail-projects-menu"
          open={projectsOpen}
          onToggle={() => {
            setRunsOpen(false);
            setProjectsOpen((current) => !current);
          }}
          menu={
            <>
              {projects.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-500">No projects</p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    role="menuitem"
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                      project.id === activeProjectId
                        ? 'bg-gray-100 font-medium text-gray-900'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setProjectsOpen(false);
                      onActivateProject(project.id);
                    }}
                  >
                    <span className="truncate">{project.name}</span>
                  </button>
                ))
              )}
              <a
                href={projectsHref()}
                role="menuitem"
                className="block border-t border-gray-100 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => setProjectsOpen(false)}
              >
                Manage projects
              </a>
            </>
          }
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7h18M3 12h18M3 17h18" />
          </svg>
        </SidebarRailFlyout>

        <SidebarRailFlyout
          label="Workflow runs"
          testId="sidebar-rail-runs"
          menuTestId="sidebar-rail-runs-menu"
          active={runsSectionActive}
          open={runsOpen}
          onToggle={() => {
            setProjectsOpen(false);
            setRunsOpen((current) => !current);
          }}
          menu={
            <>
              {executions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-500">No workflow runs</p>
              ) : (
                executions.slice(0, 8).map((execution) => (
                  <button
                    key={execution.id}
                    type="button"
                    role="menuitem"
                    className="flex w-full flex-col px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                    onClick={() => {
                      setRunsOpen(false);
                      navigateShell(`/execution/${encodeURIComponent(execution.id)}`);
                    }}
                  >
                    <span className="truncate font-medium">{execution.intent || execution.workflowId}</span>
                    <span className="truncate text-[10px] text-gray-400">{execution.status}</span>
                  </button>
                ))
              )}
              <button
                type="button"
                role="menuitem"
                className="block w-full border-t border-gray-100 px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => {
                  setRunsOpen(false);
                  navigateShell('/executions');
                }}
              >
                View all runs
              </button>
            </>
          }
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </SidebarRailFlyout>
      </div>

      <div className="mt-auto flex flex-col items-center gap-2 border-t border-gray-200 pt-3">
        <SidebarIconButton
          label="Harness settings"
          active={settingsActive}
          testId="sidebar-rail-settings"
          onClick={() => navigateShell(settingsHref())}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </SidebarIconButton>

        <SidebarIconButton
          label="Expand sidebar"
          testId="sidebar-rail-expand"
          onClick={() => toggleSidebarExpanded(true)}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
          </svg>
        </SidebarIconButton>
      </div>
    </aside>
  );
}

function formatSessionTitle(conversation: ConversationItem): string {
  if (conversation.title !== 'New chat') {
    return conversation.title;
  }
  if (conversation.agentId) {
    return `Session ${conversation.agentId.slice(0, 8)}`;
  }
  return conversation.title;
}

function ConversationSidebarLink({
  conversation,
  isActive,
}: {
  conversation: ConversationItem;
  isActive: boolean;
}) {
  const hub = useRuntimeHub();
  const isStreaming = useConversationStreamingPhase(conversation.id);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();

    if (hub.layoutMode !== 'single') {
      const count = hub.layoutMode === 'grid-4' ? 4 : 2;
      const panes = hub.paneConversationIds;
      let emptyIndex: number | null = null;
      for (let index = 0; index < count; index += 1) {
        if (!panes[index]) {
          emptyIndex = index;
          break;
        }
      }

      hub.navigateToConversation(conversation.id, { paneIndex: emptyIndex ?? 0 });
      return;
    }

    hub.navigateToConversation(conversation.id);
  }

  return (
    <a
      href={conversationHref(conversation.id)}
      onClick={handleClick}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
        isActive
          ? 'bg-gray-100 font-medium text-gray-700'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span className="truncate">{formatSessionTitle(conversation)}</span>
      {isStreaming ? (
        <span
          className="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-gray-400"
          aria-label="Streaming"
          data-testid={`sidebar-streaming-${conversation.id}`}
        />
      ) : null}
    </a>
  );
}

export default function SidebarPanel() {
  const pathname = useShellPathname();
  const hub = useRuntimeHub();
  const sidebarExpanded = useSidebarExpanded();
  const [harnessSpec, setHarnessSpec] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>(() => readStaleSidebarCache<ProjectItem[]>('projects') ?? []);
  const [conversations, setConversations] = useState<ConversationItem[]>(
    () => readStaleSidebarCache<ConversationItem[]>('conversations') ?? [],
  );
  const [executions, setExecutions] = useState<ExecutionSummary[]>(
    () => readStaleSidebarCache<ExecutionSummary[]>(EXECUTIONS_CACHE_KEY) ?? [],
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() =>
    activeConversationFromPath(pathname),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeExecutionId = activeExecutionFromPath(pathname);
  const runsSectionActive = isRunsSectionActive(pathname);
  const settingsActive = isSettingsActive(pathname);

  async function loadSidebarData(projectId?: string, options?: { background?: boolean }): Promise<void> {
    const background = options?.background ?? false;
    const conversationsUrl = projectId
      ? `/api/conversations?project_id=${encodeURIComponent(projectId)}`
      : '/api/conversations';

    if (!background) {
      setIsRefreshing(true);
    }

    try {
      const [projectsResponse, conversationsResponse] = await Promise.all([
        fetch('/api/projects'),
        fetch(conversationsUrl),
      ]);

      if (!projectsResponse.ok || !conversationsResponse.ok) {
        throw new Error('Failed to load sidebar data');
      }

      const projectsPayload = (await projectsResponse.json()) as ProjectsResponse;
      const conversationsPayload = (await conversationsResponse.json()) as ConversationsResponse;

      setProjects(projectsPayload.projects);
      setConversations(conversationsPayload.conversations);
      writeSidebarCache('projects', projectsPayload.projects);
      writeSidebarCache('conversations', conversationsPayload.conversations);

      const pathConversationId = activeConversationFromPath(pathname);
      if (pathConversationId) {
        setActiveConversationId(pathConversationId);
      } else {
        setActiveConversationId(conversationsPayload.conversations[0]?.id ?? null);
      }
      setLoadError(null);
    } finally {
      if (!background) {
        setIsRefreshing(false);
      }
    }
  }

  const activeProject = projects.find((project) => project.active) ?? projects[0];

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/executions')
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { executions: ExecutionSummary[] };
        if (!cancelled) {
          setExecutions(payload.executions);
          writeSidebarCache(EXECUTIONS_CACHE_KEY, payload.executions);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void fetch('/api/runtime/harness-spec')
      .then(async (response) => {
        const payload = (await response.json()) as { operatorNote?: string; indexExcerpt?: string };
        if (response.ok) {
          setHarnessSpec(payload.operatorNote ?? payload.indexExcerpt ?? null);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const cachedProjects = readSidebarCache<ProjectItem[]>('projects');
    const cachedConversations = readSidebarCache<ConversationItem[]>('conversations');
    if (cachedProjects) {
      setProjects(cachedProjects);
    }
    if (cachedConversations) {
      setConversations(cachedConversations);
    }

    void (async () => {
      try {
        const projectsResponse = await fetch('/api/projects');
        if (!projectsResponse.ok) {
          throw new Error('Failed to load sidebar data');
        }

        const projectsPayload = (await projectsResponse.json()) as ProjectsResponse;
        if (cancelled) {
          return;
        }

        setProjects(projectsPayload.projects);
        writeSidebarCache('projects', projectsPayload.projects);

        const project =
          projectsPayload.projects.find((entry) => entry.active) ?? projectsPayload.projects[0];
        if (!project?.id) {
          setConversations([]);
          setLoadError(null);
          return;
        }

        const hasFreshConversations = Boolean(cachedConversations);
        if (!hasFreshConversations) {
          setIsRefreshing(true);
        }

        const conversationsResponse = await fetch(
          `/api/conversations?project_id=${encodeURIComponent(project.id)}`,
        );
        if (!conversationsResponse.ok) {
          throw new Error('Failed to load profile chats');
        }

        const conversationsPayload =
          (await conversationsResponse.json()) as ConversationsResponse;
        if (cancelled) {
          return;
        }

        setConversations(conversationsPayload.conversations);
        writeSidebarCache('conversations', conversationsPayload.conversations);

        const pathConversationId = activeConversationFromPath(pathname);
        setActiveConversationId(
          pathConversationId ?? conversationsPayload.conversations[0]?.id ?? null,
        );
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load sidebar data';
          setLoadError(message);
        }
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setActiveConversationId(activeConversationFromPath(pathname));
  }, [pathname]);

  useEffect(() => {
    function refreshConversationsInBackground(): void {
      if (!activeProject?.id) {
        return;
      }

      invalidateSidebarCache('conversations');
      void loadSidebarData(activeProject.id, { background: true }).catch(() => undefined);
    }

    window.addEventListener('focus', refreshConversationsInBackground);
    window.addEventListener('runtime:conversations-changed', refreshConversationsInBackground);

    return () => {
      window.removeEventListener('focus', refreshConversationsInBackground);
      window.removeEventListener('runtime:conversations-changed', refreshConversationsInBackground);
    };
  }, [activeProject?.id]);

  async function handleNewChat(): Promise<void> {
    hub.navigateToConversation(DRAFT_CONVERSATION_ID);
  }

  async function handleActivateProject(projectId: string): Promise<void> {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to activate project');
      }
      invalidateSidebarCache('projects');
      invalidateSidebarCache('conversations');
      await loadSidebarData(projectId);
    } catch {
      setLoadError('Failed to activate project');
    }
  }

  if (!sidebarExpanded) {
    return (
      <CollapsedSidebarRail
        runsSectionActive={runsSectionActive}
        settingsActive={settingsActive}
        projects={projects}
        executions={executions}
        activeProjectId={activeProject?.id ?? null}
        onNewChat={() => {
          void handleNewChat();
        }}
        onActivateProject={(projectId) => {
          void handleActivateProject(projectId);
        }}
      />
    );
  }

  return (
    <aside
      className="relative z-30 flex h-full min-h-0 flex-col isolate overflow-hidden border-r border-gray-200 bg-white"
      data-testid="sidebar-panel"
    >
      <div className="flex h-9 items-center gap-2 border-b border-gray-200 px-4">
        <BrandLogo variant="full" className="min-w-0 flex-1" />
        <button
          type="button"
          data-testid="sidebar-collapse"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          onClick={() => toggleSidebarExpanded(false)}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {loadError ? (
          <p className="mb-4 px-4 text-xs text-red-600" role="alert">
            {loadError}
          </p>
        ) : null}

        <SectionLabel>Projects</SectionLabel>
        <ul className="mb-4 space-y-0.5 px-2">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors ${
                  project.active
                    ? 'bg-gray-100 text-gray-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                onClick={() => {
                  void (async () => {
                    try {
                      const response = await fetch(
                        `/api/projects/${encodeURIComponent(project.id)}`,
                        { method: 'POST' },
                      );
                      if (!response.ok) {
                        throw new Error('Failed to activate project');
                      }
                      invalidateSidebarCache('projects');
                      invalidateSidebarCache('conversations');
                      await loadSidebarData(project.id);
                    } catch {
                      setLoadError('Failed to activate project');
                    }
                  })();
                }}
              >
                <span className="truncate">{project.name}</span>
                {typeof project.sessionCount === 'number' ? (
                  <span className="ml-auto shrink-0 text-[10px] text-gray-400">
                    {project.sessionCount}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          <li>
            <a
              href={projectsHref()}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>New Project</span>
            </a>
          </li>
        </ul>

        <SectionLabel>Chats</SectionLabel>
        {isRefreshing && conversations.length === 0 ? (
          <p className="mb-2 px-5 text-xs text-gray-400">Loading chats…</p>
        ) : null}
        <div className="mb-2 px-2">
          <button
            type="button"
            data-testid="sidebar-new-chat"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            onClick={() => {
              void handleNewChat();
            }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>New Chat</span>
          </button>
        </div>
        <ul className="space-y-0.5 px-2">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            return (
              <li key={conversation.id}>
                <ConversationSidebarLink conversation={conversation} isActive={isActive} />
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <SectionLabel>Runs</SectionLabel>
          <ul className="space-y-0.5 px-2">
            <li>
              <a
                href={runsHref()}
                onClick={(event) => {
                  event.preventDefault();
                  navigateShell('/executions');
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  runsSectionActive
                    ? 'bg-gray-100 font-medium text-gray-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                aria-current={runsSectionActive ? 'page' : undefined}
                data-testid="sidebar-runs-link"
              >
                <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                <span className="truncate">Workflow Runs</span>
                {activeExecutionId ? (
                  <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-gray-400" aria-hidden="true" />
                ) : null}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-gray-200 p-2">
        <button
          type="button"
          data-testid="sidebar-operator-settings"
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
            settingsActive ? 'bg-gray-100' : 'hover:bg-gray-50'
          }`}
          onClick={() => navigateShell(settingsHref())}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-700">
            SG
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-900">Operator · Settings</p>
            {harnessSpec ? (
              <p className="mt-0.5 line-clamp-2 text-[10px] text-gray-500" data-testid="sidebar-harness-spec">
                {harnessSpec}
              </p>
            ) : (
              <p className="mt-0.5 text-[10px] text-gray-500">Configure harness from business.yaml</p>
            )}
          </div>
          <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
