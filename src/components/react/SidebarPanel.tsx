import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  Folder,
  Library,
  MessageSquare,
  PanelLeftClose,
  Pin,
  Search,
  SquarePen,
  Zap,
} from 'lucide-react';

import type { ExecutionSummary } from '../../lib/harness-types';

import type { PresentationAssets } from '@/lib/ui-branding';
import { homeAriaLabel, runtimeSubtitle } from '@/lib/ui-branding';
import BrandLogo from './BrandLogo';
import ChatSearchModal from './ChatSearchModal';
import SidebarProfileMenu from './SidebarProfileMenu';
import {
  invalidateSidebarCache,
  readSidebarCache,
  readStaleSidebarCache,
  writeSidebarCache,
} from '../../lib/sidebar-cache';
import { DRAFT_CONVERSATION_ID } from '@/lib/draft-conversation';
import { navigateShell, useShellPathname } from '@/lib/shell-navigation';
import { SCHEDULE_INTERVIEW_CONVERSATION_ID } from '@/lib/schedule-tips';
import { sidebarLayoutStore, useSidebarExpanded } from '@/lib/sidebar-layout-store';
import { useConversationStreamingPhase } from '@/hooks/useRuntimeConversation';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import { readPinnedConversationIds } from '@/lib/pinned-conversations';

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

const EXECUTIONS_CACHE_KEY = 'executions-list';
const SIDEBAR_FLYOUT_WIDTH_PX = 224;
const SIDEBAR_FLYOUT_GAP_PX = 8;
const PROJECTS_PREVIEW_LIMIT = 5;
const CHATS_PREVIEW_LIMIT = 24;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 px-3 pt-3 text-[11px] font-medium text-gray-400">{children}</p>
  );
}

function conversationHref(conversationId: string): string {
  return `/conversation/${encodeURIComponent(conversationId)}`;
}

function projectsHref(): string {
  return '/projects';
}

function libraryHref(): string {
  return '/library';
}

function activeConversationFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/conversation\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isRunsSectionActive(pathname: string): boolean {
  return pathname === '/executions' || pathname.startsWith('/execution/');
}

function filterSidebarConversations(conversations: ConversationItem[]): ConversationItem[] {
  return conversations.filter((conversation) => conversation.id !== SCHEDULE_INTERVIEW_CONVERSATION_ID);
}

function isScheduledActive(pathname: string): boolean {
  return pathname === '/scheduled';
}

function isLibraryActive(pathname: string): boolean {
  return pathname === '/library' || pathname.startsWith('/library/');
}

function toggleSidebarExpanded(expanded: boolean): void {
  sidebarLayoutStore.setExpanded(expanded);
  void sidebarLayoutStore.persistExpanded(expanded).catch(() => undefined);
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

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'JM';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function usePinnedConversationIds(): Set<string> {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => readPinnedConversationIds());

  useEffect(() => {
    function refresh(): void {
      setPinnedIds(readPinnedConversationIds());
    }

    window.addEventListener('runtime:pinned-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('runtime:pinned-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return pinnedIds;
}

function SidebarToggleButton({
  expanded,
  testId,
}: {
  expanded: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      onClick={() => toggleSidebarExpanded(!expanded)}
    >
      <PanelLeftClose className={`h-4 w-4 ${expanded ? '' : 'rotate-180'}`} />
    </button>
  );
}

function computeSidebarFlyoutPosition(
  triggerRect: DOMRect,
  menuWidth: number,
  menuHeight: number,
): { left: number; top: number } {
  const viewportPadding = SIDEBAR_FLYOUT_GAP_PX;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = triggerRect.right + SIDEBAR_FLYOUT_GAP_PX;
  let top = triggerRect.top;

  if (left + menuWidth > viewportWidth - viewportPadding) {
    left = triggerRect.left - menuWidth - SIDEBAR_FLYOUT_GAP_PX;
  }

  left = Math.max(viewportPadding, Math.min(left, viewportWidth - menuWidth - viewportPadding));
  top = Math.max(viewportPadding, Math.min(top, viewportHeight - menuHeight - viewportPadding));

  return { left, top };
}

function useDismissOnOutside(
  open: boolean,
  onClose: () => void,
  containerRef: React.RefObject<HTMLElement | null>,
  menuRef: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      onClose();
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
  }, [containerRef, menuRef, onClose, open]);
}

function SidebarRailFlyout({
  label,
  testId,
  active,
  menuTestId,
  open,
  onOpen,
  onClose,
  triggerMode,
  menu,
  children,
}: {
  label: string;
  testId: string;
  active?: boolean;
  menuTestId: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  triggerMode: 'click' | 'hover' | 'both';
  menu: React.ReactNode;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);

  useDismissOnOutside(open, onClose, containerRef, menuRef);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPosition(null);
      return;
    }

    function updatePosition(): void {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth ?? SIDEBAR_FLYOUT_WIDTH_PX;
      const menuHeight = menuRef.current?.offsetHeight ?? 256;
      setMenuPosition(computeSidebarFlyoutPosition(triggerRect, menuWidth, menuHeight));
    }

    updatePosition();
    const frameId = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, menu]);

  const resolvedPosition =
    menuPosition ??
    (open && triggerRef.current
      ? computeSidebarFlyoutPosition(
          triggerRef.current.getBoundingClientRect(),
          SIDEBAR_FLYOUT_WIDTH_PX,
          256,
        )
      : null);

  function clearHoverTimer(): void {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }

  function scheduleHoverClose(): void {
    clearHoverTimer();
    hoverCloseTimerRef.current = setTimeout(() => onClose(), 120);
  }

  const flyoutMenu =
    open && resolvedPosition && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            data-testid={menuTestId}
            style={{
              position: 'fixed',
              left: resolvedPosition.left,
              top: resolvedPosition.top,
              zIndex: 100,
            }}
            className="max-h-72 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            onMouseEnter={triggerMode === 'hover' || triggerMode === 'both' ? clearHoverTimer : undefined}
            onMouseLeave={triggerMode === 'hover' || triggerMode === 'both' ? scheduleHoverClose : undefined}
          >
            <p className="border-b border-gray-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {label}
            </p>
            {menu}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className="relative"
      ref={containerRef}
      onMouseEnter={
        triggerMode === 'hover' || triggerMode === 'both'
          ? () => {
              clearHoverTimer();
              onOpen();
            }
          : undefined
      }
      onMouseLeave={
        triggerMode === 'hover' || triggerMode === 'both' ? scheduleHoverClose : undefined
      }
    >
      <SidebarIconButton
        ref={triggerRef}
        label={label}
        active={active || open}
        testId={testId}
        onClick={() => {
          if (triggerMode === 'hover') {
            return;
          }
          if (open) {
            onClose();
            return;
          }
          onOpen();
        }}
      >
        {children}
      </SidebarIconButton>
      {flyoutMenu}
    </div>
  );
}

const SidebarIconButton = React.forwardRef<
  HTMLButtonElement,
  {
    label: string;
    active?: boolean;
    testId?: string;
    onClick: () => void;
    children: React.ReactNode;
  }
>(function SidebarIconButton({ label, active, testId, onClick, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-gray-100 text-gray-800'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
});

function SidebarNavRow({
  label,
  active,
  testId,
  onClick,
  icon,
}: {
  label: string;
  active?: boolean;
  testId?: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-gray-100 font-medium text-gray-900'
          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
      }`}
      onClick={onClick}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-gray-500">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
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
      className={`block w-full truncate rounded-lg px-3 py-1.5 text-sm transition-colors ${
        isActive
          ? 'bg-gray-100 font-medium text-gray-800'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className="flex items-center gap-2">
        <span className="truncate">{formatSessionTitle(conversation)}</span>
        {isStreaming ? (
          <span
            className="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-gray-400"
            aria-label="Streaming"
            data-testid={`sidebar-streaming-${conversation.id}`}
          />
        ) : null}
      </span>
    </a>
  );
}

function CollapsedSidebarRail({
  runsSectionActive,
  libraryActive,
  scheduledActive,
  pinnedConversations,
  conversations,
  projects,
  executions,
  activeConversationId,
  activeProjectId,
  activeProjectName,
  onOpenSearchModal,
  onNewChat,
  onOpenConversation,
  onActivateProject,
  displayName,
  subtitle,
  initials,
  harnessSpec,
  presentationTitle,
  brandAssets,
}: {
  runsSectionActive: boolean;
  libraryActive: boolean;
  scheduledActive: boolean;
  pinnedConversations: ConversationItem[];
  conversations: ConversationItem[];
  projects: ProjectItem[];
  executions: ExecutionSummary[];
  activeConversationId: string | null;
  activeProjectId: string | null;
  activeProjectName: string | null;
  onOpenSearchModal: () => void;
  onNewChat: () => void;
  onOpenConversation: (conversationId: string) => void;
  onActivateProject: (projectId: string) => void;
  displayName: string;
  subtitle: string;
  initials: string;
  harnessSpec: string | null;
  presentationTitle: string;
  brandAssets?: PresentationAssets;
}) {
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);

  function closeFlyouts(): void {
    setPinnedOpen(false);
    setChatsOpen(false);
    setProjectsOpen(false);
    setRunsOpen(false);
  }

  const recentConversations = conversations.slice(0, CHATS_PREVIEW_LIMIT);

  return (
    <aside
      className="relative flex h-full min-h-0 w-full flex-col items-center overflow-x-visible overflow-y-auto border-r border-gray-200 bg-white py-3"
      data-testid="sidebar-panel-collapsed"
    >
      <div className="mb-4 flex w-full items-center justify-center px-2">
        <button
          type="button"
          className="rounded-lg p-1 hover:bg-gray-50"
          aria-label="Expand sidebar"
          onClick={() => toggleSidebarExpanded(true)}
        >
          <BrandLogo variant="icon" className="shrink-0" title={presentationTitle} assets={brandAssets} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center gap-1.5">
        <SidebarIconButton label="New chat" testId="sidebar-rail-new-chat" onClick={onNewChat}>
          <SquarePen className="h-4 w-4" />
        </SidebarIconButton>

        <SidebarIconButton
          label="Search chats"
          testId="sidebar-rail-search"
          onClick={onOpenSearchModal}
        >
          <Search className="h-4 w-4" />
        </SidebarIconButton>

        <SidebarRailFlyout
          label="Recent chats"
          testId="sidebar-rail-chats"
          menuTestId="sidebar-rail-chats-menu"
          active={Boolean(activeConversationId)}
          open={chatsOpen}
          onOpen={() => {
            closeFlyouts();
            setChatsOpen(true);
          }}
          onClose={() => setChatsOpen(false)}
          triggerMode="both"
          menu={
            <>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  closeFlyouts();
                  onNewChat();
                }}
              >
                <SquarePen className="h-3.5 w-3.5" />
                New chat
              </button>
              {recentConversations.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-500">No recent chats</p>
              ) : (
                recentConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    role="menuitem"
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                      conversation.id === activeConversationId
                        ? 'bg-gray-100 font-medium text-gray-900'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      closeFlyouts();
                      onOpenConversation(conversation.id);
                    }}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="truncate">{formatSessionTitle(conversation)}</span>
                  </button>
                ))
              )}
            </>
          }
        >
          <MessageSquare className="h-4 w-4" />
        </SidebarRailFlyout>

        <SidebarRailFlyout
          label="Pinned"
          testId="sidebar-rail-pinned"
          menuTestId="sidebar-rail-pinned-menu"
          active={pinnedConversations.some((entry) => entry.id === activeConversationId)}
          open={pinnedOpen}
          onOpen={() => {
            closeFlyouts();
            setPinnedOpen(true);
          }}
          onClose={() => setPinnedOpen(false)}
          triggerMode="both"
          menu={
            pinnedConversations.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-500">No pinned chats</p>
            ) : (
              pinnedConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  role="menuitem"
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                    conversation.id === activeConversationId
                      ? 'bg-gray-100 font-medium text-gray-900'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    closeFlyouts();
                    onOpenConversation(conversation.id);
                  }}
                >
                  <span className="truncate">{formatSessionTitle(conversation)}</span>
                </button>
              ))
            )
          }
        >
          <Pin className="h-4 w-4" />
        </SidebarRailFlyout>

        <SidebarRailFlyout
          label={activeProjectName ? `Project: ${activeProjectName}` : 'Projects'}
          testId="sidebar-rail-projects"
          menuTestId="sidebar-rail-projects-menu"
          active={Boolean(activeProjectId)}
          open={projectsOpen}
          onOpen={() => {
            closeFlyouts();
            setProjectsOpen(true);
          }}
          onClose={() => setProjectsOpen(false)}
          triggerMode="both"
          menu={
            <>
              {activeProjectName ? (
                <p className="border-b border-gray-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Active · {activeProjectName}
                </p>
              ) : null}
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
                      closeFlyouts();
                      onActivateProject(project.id);
                    }}
                  >
                    <Folder className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))
              )}
              <a
                href={projectsHref()}
                role="menuitem"
                className="block border-t border-gray-100 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                onClick={closeFlyouts}
              >
                Manage projects
              </a>
            </>
          }
        >
          <Folder className="h-4 w-4" />
        </SidebarRailFlyout>

        <SidebarIconButton
          label="Library"
          testId="sidebar-rail-library"
          active={libraryActive}
          onClick={() => navigateShell(libraryHref())}
        >
          <Library className="h-4 w-4" />
        </SidebarIconButton>

        <SidebarIconButton
          label="Scheduled"
          testId="sidebar-rail-scheduled"
          active={scheduledActive}
          onClick={() => navigateShell('/scheduled')}
        >
          <Calendar className="h-4 w-4" />
        </SidebarIconButton>

        <SidebarRailFlyout
          label="Workflow runs"
          testId="sidebar-rail-runs"
          menuTestId="sidebar-rail-runs-menu"
          active={runsSectionActive}
          open={runsOpen}
          onOpen={() => {
            closeFlyouts();
            setRunsOpen(true);
          }}
          onClose={() => setRunsOpen(false)}
          triggerMode="both"
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
                      closeFlyouts();
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
                  closeFlyouts();
                  navigateShell('/executions');
                }}
              >
                View all runs
              </button>
            </>
          }
        >
          <Zap className="h-4 w-4" />
        </SidebarRailFlyout>
      </div>

      <div className="mt-auto flex flex-col items-center gap-2 border-t border-gray-200 px-2 pt-3">
        <SidebarProfileMenu
          displayName={displayName}
          subtitle={subtitle}
          initials={initials}
          harnessSpec={harnessSpec}
          expanded={false}
          testId="sidebar-rail-profile"
        />
        <SidebarToggleButton expanded={false} testId="sidebar-rail-expand" />
      </div>
    </aside>
  );
}

export default function SidebarPanel({
  presentationTitle,
  brandAssets,
}: {
  presentationTitle: string;
  brandAssets?: PresentationAssets;
}) {
  const pathname = useShellPathname();
  const hub = useRuntimeHub();
  const sidebarExpanded = useSidebarExpanded();
  const pinnedIds = usePinnedConversationIds();
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
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(false);

  const runsSectionActive = isRunsSectionActive(pathname);
  const scheduledActive = isScheduledActive(pathname);
  const libraryActive = isLibraryActive(pathname);

  const activeProject = projects.find((project) => project.active) ?? projects[0];
  const displayName = activeProject?.name ?? 'Operator';
  const subtitle = runtimeSubtitle(presentationTitle);
  const initials = initialsFromName(displayName);

  const pinnedConversations = useMemo(
    () => conversations.filter((conversation) => pinnedIds.has(conversation.id)),
    [conversations, pinnedIds],
  );

  const visibleProjects = projectsExpanded ? projects : projects.slice(0, PROJECTS_PREVIEW_LIMIT);

  const chatSearchModal = (
    <ChatSearchModal
      open={searchModalOpen}
      onOpenChange={setSearchModalOpen}
      conversations={conversations}
      activeConversationId={activeConversationId}
      onSelectConversation={(conversationId) => {
        hub.navigateToConversation(conversationId);
      }}
      onNewChat={() => {
        void handleNewChat();
      }}
      formatTitle={formatSessionTitle}
    />
  );

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
      setConversations(filterSidebarConversations(conversationsPayload.conversations));
      writeSidebarCache('projects', projectsPayload.projects);
      writeSidebarCache('conversations', filterSidebarConversations(conversationsPayload.conversations));

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
      <>
        <CollapsedSidebarRail
          runsSectionActive={runsSectionActive}
          libraryActive={libraryActive}
          scheduledActive={scheduledActive}
          pinnedConversations={pinnedConversations}
          conversations={conversations}
          projects={projects}
          executions={executions}
          activeConversationId={activeConversationId}
          activeProjectId={activeProject?.id ?? null}
          activeProjectName={activeProject?.name ?? null}
          onOpenSearchModal={() => setSearchModalOpen(true)}
          onNewChat={() => {
            void handleNewChat();
          }}
          onOpenConversation={(conversationId) => {
            hub.navigateToConversation(conversationId);
          }}
          onActivateProject={(projectId) => {
            void handleActivateProject(projectId);
          }}
          displayName={displayName}
          subtitle={subtitle}
          initials={initials}
          harnessSpec={harnessSpec}
          presentationTitle={presentationTitle}
          brandAssets={brandAssets}
        />
        {chatSearchModal}
      </>
    );
  }

  return (
    <>
      <aside
        className="relative flex h-full min-h-0 flex-col overflow-hidden border-r border-gray-200 bg-white"
        data-testid="sidebar-panel"
      >
      <div className="flex h-12 items-center justify-between gap-2 px-3">
        <button
          type="button"
          className="truncate text-sm font-semibold tracking-tight text-gray-900"
          aria-label={homeAriaLabel(presentationTitle)}
          onClick={() => navigateShell('/')}
        >
          {presentationTitle}
        </button>
        <SidebarToggleButton expanded testId="sidebar-collapse" />
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        {loadError ? (
          <p className="mb-2 px-4 text-xs text-red-600" role="alert">
            {loadError}
          </p>
        ) : null}

        <div className="space-y-0.5 px-1">
          <SidebarNavRow
            label="New chat"
            testId="sidebar-new-chat"
            onClick={() => {
              void handleNewChat();
            }}
            icon={<SquarePen className="h-4 w-4" />}
          />
          <SidebarNavRow
            label="Search chats"
            testId="sidebar-search-toggle"
            active={searchModalOpen}
            onClick={() => setSearchModalOpen(true)}
            icon={<Search className="h-4 w-4" />}
          />
          <SidebarNavRow
            label="Library"
            testId="sidebar-library"
            active={libraryActive}
            onClick={() => navigateShell(libraryHref())}
            icon={<Library className="h-4 w-4" />}
          />
          <SidebarNavRow
            label="Scheduled"
            testId="sidebar-scheduled"
            active={scheduledActive}
            onClick={() => navigateShell('/scheduled')}
            icon={<Calendar className="h-4 w-4" />}
          />
        </div>

        {pinnedConversations.length > 0 ? (
          <div>
            <SectionLabel>Pinned</SectionLabel>
            <ul className="space-y-0.5 px-2">
              {pinnedConversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                return (
                  <li key={conversation.id}>
                    <ConversationSidebarLink conversation={conversation} isActive={isActive} />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div>
          <SectionLabel>Projects</SectionLabel>
          <ul className="space-y-0.5 px-2">
            {visibleProjects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                    project.active
                      ? 'bg-gray-100 font-medium text-gray-800'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  onClick={() => {
                    void handleActivateProject(project.id);
                  }}
                >
                  <Folder className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate">{project.name}</span>
                  {typeof project.sessionCount === 'number' ? (
                    <span className="ml-auto shrink-0 text-[10px] text-gray-400">
                      {project.sessionCount}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
            {projects.length > PROJECTS_PREVIEW_LIMIT ? (
              <li>
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  onClick={() => setProjectsExpanded((current) => !current)}
                >
                  {projectsExpanded ? 'Show less' : 'Show more'}
                </button>
              </li>
            ) : null}
            <li>
              <a
                href={projectsHref()}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              >
                <span className="pl-6">New project</span>
              </a>
            </li>
          </ul>
        </div>

        <div>
          <SectionLabel>Chats</SectionLabel>
          {isRefreshing && conversations.length === 0 ? (
            <p className="mb-2 px-5 text-xs text-gray-400">Loading chats…</p>
          ) : null}
          <ul className="space-y-0.5 px-2">
            {conversations.slice(0, CHATS_PREVIEW_LIMIT).map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              return (
                <li key={conversation.id}>
                  <ConversationSidebarLink conversation={conversation} isActive={isActive} />
                </li>
              );
            })}
          </ul>
          {conversations.length === 0 && !isRefreshing ? (
            <p className="px-5 text-xs text-gray-400">No chats</p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-gray-200 p-2">
        <SidebarProfileMenu
          displayName={displayName}
          subtitle={subtitle}
          initials={initials}
          harnessSpec={harnessSpec}
          expanded
          testId="sidebar-operator-settings"
        />
      </div>
      </aside>
      {chatSearchModal}
    </>
  );
}
