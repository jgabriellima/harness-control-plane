'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  listDesignProjects,
  type DesignProjectRecord,
} from '@/lib/design-api';
import {
  designPathForView,
  parseDesignRoute,
  type ParsedDesignRoute,
} from '@/lib/design-navigation';
import {
  navigateDesign,
  useDesignPathname,
} from '@/lib/design-shell-navigation';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import DesignOdIcon, { type DesignOdIconName } from './DesignOdIcon';

type EntryView =
  | 'home'
  | 'projects'
  | 'tasks'
  | 'plugins'
  | 'design-systems'
  | 'integrations';

type WorkspaceChromeTab =
  | {
      id: string;
      kind: 'entry';
      view: EntryView;
      createdAt: number;
      lastActiveAt: number;
    }
  | {
      id: string;
      kind: 'project';
      projectId: string;
      createdAt: number;
      lastActiveAt: number;
    };

interface WorkspaceTabsState {
  tabs: WorkspaceChromeTab[];
  activeTabId: string;
}

interface DisplayTab {
  id: string;
  title: string;
  meta: string;
  icon: DesignOdIconName;
  tab: WorkspaceChromeTab;
}

const STORAGE_KEY = 'hcp:workspace-tabs:v1';

function nowId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function entryViewFromRoute(route: ParsedDesignRoute): EntryView {
  switch (route.view) {
    case 'home':
      return 'home';
    case 'projects':
      return 'projects';
    case 'automations':
      return 'tasks';
    case 'plugins':
    case 'plugin-detail':
      return 'plugins';
    case 'design-systems':
    case 'design-system-create':
    case 'design-system-detail':
      return 'design-systems';
    case 'integrations':
      return 'integrations';
    case 'conversations':
    case 'library':
    case 'executions':
    case 'scheduled':
      return 'home';
    case 'studio':
    default:
      return 'home';
  }
}

function pathForEntryView(view: EntryView): string {
  switch (view) {
    case 'home':
      return designPathForView('home');
    case 'projects':
      return designPathForView('projects');
    case 'tasks':
      return designPathForView('automations');
    case 'plugins':
      return designPathForView('plugins');
    case 'design-systems':
      return designPathForView('design-systems');
    case 'integrations':
      return designPathForView('integrations');
    default:
      return designPathForView('home');
  }
}

function tabFromRoute(route: ParsedDesignRoute, timestamp = Date.now()): WorkspaceChromeTab {
  if (route.view === 'studio' && route.projectId) {
    return {
      id: `project:${route.projectId}:${nowId()}`,
      kind: 'project',
      projectId: route.projectId,
      createdAt: timestamp,
      lastActiveAt: timestamp,
    };
  }
  return {
    id: `entry:${entryViewFromRoute(route)}:${nowId()}`,
    kind: 'entry',
    view: entryViewFromRoute(route),
    createdAt: timestamp,
    lastActiveAt: timestamp,
  };
}

function pathForTab(tab: WorkspaceChromeTab): string {
  if (tab.kind === 'project') {
    return designPathForView('studio', { projectId: tab.projectId });
  }
  return pathForEntryView(tab.view);
}

function createEntryTab(view: EntryView, timestamp = Date.now()): WorkspaceChromeTab {
  return {
    id: `entry:${view}:${nowId()}`,
    kind: 'entry',
    view,
    createdAt: timestamp,
    lastActiveAt: timestamp,
  };
}

function normalizeTabsState(state: WorkspaceTabsState): WorkspaceTabsState {
  let sourceTabs = state.tabs.length > 0 ? state.tabs : [createEntryTab('home')];
  const entryTabs = sourceTabs.filter((tab) => tab.kind === 'entry');
  if (entryTabs.length > 1) {
    let canonical = entryTabs.find((tab) => tab.id === state.activeTabId);
    if (!canonical) {
      canonical = entryTabs.reduce((newest, current) =>
        current.lastActiveAt > newest.lastActiveAt ? current : newest,
      entryTabs[0]!);
    }
    sourceTabs = sourceTabs.filter((tab) => tab.kind !== 'entry' || tab.id === canonical!.id);
  }
  const entryIndex = sourceTabs.findIndex((tab) => tab.kind === 'entry');
  if (entryIndex < 0) {
    sourceTabs = [createEntryTab('home'), ...sourceTabs];
  } else if (entryIndex > 0) {
    const [entryTab] = sourceTabs.splice(entryIndex, 1);
    sourceTabs = [entryTab!, ...sourceTabs];
  }
  const activeTabId = sourceTabs.some((tab) => tab.id === state.activeTabId)
    ? state.activeTabId
    : sourceTabs[0]!.id;
  return { tabs: sourceTabs, activeTabId };
}

function syncStateToRoute(state: WorkspaceTabsState, route: ParsedDesignRoute): WorkspaceTabsState {
  const timestamp = Date.now();
  const current = normalizeTabsState(state);
  const currentActive = current.tabs.find((tab) => tab.id === current.activeTabId) ?? null;

  if (route.view !== 'studio') {
    const view = entryViewFromRoute(route);
    const existingEntry = current.tabs.find((tab) => tab.kind === 'entry');
    if (existingEntry) {
      return normalizeTabsState({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === existingEntry.id ? { ...tab, view, lastActiveAt: timestamp } : tab,
        ),
        activeTabId: existingEntry.id,
      });
    }
    const nextTab = tabFromRoute(route, timestamp);
    return normalizeTabsState({ tabs: [...current.tabs, nextTab], activeTabId: nextTab.id });
  }

  if (route.projectId) {
    const existingProject = current.tabs.find(
      (tab) => tab.kind === 'project' && tab.projectId === route.projectId,
    );
    if (existingProject) {
      return normalizeTabsState({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === existingProject.id ? { ...tab, lastActiveAt: timestamp } : tab,
        ),
        activeTabId: existingProject.id,
      });
    }
    if (currentActive?.kind === 'entry') {
      const nextTab = tabFromRoute(route, timestamp);
      return normalizeTabsState({
        tabs: [...current.tabs, nextTab],
        activeTabId: nextTab.id,
      });
    }
  }

  if (!currentActive) {
    const nextTab = tabFromRoute(route, timestamp);
    return normalizeTabsState({ tabs: [...current.tabs, nextTab], activeTabId: nextTab.id });
  }

  const replacement = {
    ...tabFromRoute(route, currentActive.createdAt),
    id: currentActive.id,
    lastActiveAt: timestamp,
  };
  return normalizeTabsState({
    tabs: current.tabs.map((tab) => (tab.id === currentActive.id ? replacement : tab)),
    activeTabId: replacement.id,
  });
}

function initialTabsState(route: ParsedDesignRoute): WorkspaceTabsState {
  const fallback = tabFromRoute(route);
  if (typeof window === 'undefined') {
    return syncStateToRoute({ tabs: [fallback], activeTabId: fallback.id }, route);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return syncStateToRoute({ tabs: [fallback], activeTabId: fallback.id }, route);
    const parsed = JSON.parse(raw) as { tabs?: unknown[]; activeTabId?: string };
    const tabs = (parsed.tabs ?? [])
      .map((value) => {
        if (!value || typeof value !== 'object') return null;
        const record = value as Record<string, unknown>;
        if (record.kind === 'entry' && typeof record.view === 'string') {
          return {
            id: String(record.id),
            kind: 'entry' as const,
            view: record.view as EntryView,
            createdAt: Number(record.createdAt) || Date.now(),
            lastActiveAt: Number(record.lastActiveAt) || Date.now(),
          };
        }
        if (record.kind === 'project' && typeof record.projectId === 'string') {
          return {
            id: String(record.id),
            kind: 'project' as const,
            projectId: record.projectId,
            createdAt: Number(record.createdAt) || Date.now(),
            lastActiveAt: Number(record.lastActiveAt) || Date.now(),
          };
        }
        return null;
      })
      .filter((tab): tab is WorkspaceChromeTab => tab !== null);
    if (tabs.length === 0) {
      return syncStateToRoute({ tabs: [fallback], activeTabId: fallback.id }, route);
    }
    return syncStateToRoute({ tabs, activeTabId: parsed.activeTabId ?? tabs[0]!.id }, route);
  } catch {
    return syncStateToRoute({ tabs: [fallback], activeTabId: fallback.id }, route);
  }
}

function displayTabFor(
  tab: WorkspaceChromeTab,
  projectById: Map<string, DesignProjectRecord>,
): DisplayTab {
  if (tab.kind === 'project') {
    const project = projectById.get(tab.projectId);
    return {
      id: tab.id,
      title: project?.name?.trim() || 'Untitled',
      meta: 'Project',
      icon: 'folder',
      tab,
    };
  }
  const entryTitle: Record<EntryView, string> = {
    home: 'Home',
    projects: 'Projects',
    tasks: 'Automations',
    plugins: 'Plugins',
    'design-systems': 'Design systems',
    integrations: 'Integrations',
  };
  const entryIcon: Record<EntryView, DesignOdIconName> = {
    home: 'home',
    projects: 'folder',
    tasks: 'kanban',
    plugins: 'grid',
    'design-systems': 'palette',
    integrations: 'link',
  };
  return {
    id: tab.id,
    title: entryTitle[tab.view],
    meta: entryTitle[tab.view],
    icon: entryIcon[tab.view],
    tab,
  };
}

export default function DesignWorkspaceChrome() {
  const hub = useRuntimeHub();
  const pathname = useDesignPathname();
  const route = parseDesignRoute(pathname);
  const [state, setState] = useState<WorkspaceTabsState>(() => initialTabsState(route));
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<DesignProjectRecord[]>([]);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setState((current) => syncStateToRoute(current, route));
  }, [pathname, route.projectId, route.view]);

  useEffect(() => {
    let cancelled = false;
    void listDesignProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Best-effort persistence.
    }
  }, [state]);

  useEffect(() => {
    if (!tabsMenuOpen) return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [tabsMenuOpen]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const filteredTabs = useMemo(() => {
    const displayTabs = state.tabs.map((tab) => displayTabFor(tab, projectById));
    const needle = query.trim().toLowerCase();
    const source = needle
      ? displayTabs.filter((tab) => `${tab.title} ${tab.meta}`.toLowerCase().includes(needle))
      : displayTabs;
    return source.slice().sort((a, b) => b.tab.lastActiveAt - a.tab.lastActiveAt);
  }, [state.tabs, projectById, query]);

  function activateTab(tab: WorkspaceChromeTab) {
    setState((current) => ({
      tabs: normalizeTabsState(current).tabs.map((item) =>
        item.id === tab.id ? { ...item, lastActiveAt: Date.now() } : item,
      ),
      activeTabId: tab.id,
    }));
    setTabsMenuOpen(false);
    navigateDesign(pathForTab(tab));
  }

  function closeTab(tabId: string) {
    setState((current) => {
      const normalized = normalizeTabsState(current);
      const closing = normalized.tabs.find((tab) => tab.id === tabId);
      if (!closing || closing.kind === 'entry') return normalized;
      const nextTabs = normalized.tabs.filter((tab) => tab.id !== tabId);
      if (nextTabs.length === 0) {
        const home = createEntryTab('home');
        return { tabs: [home], activeTabId: home.id };
      }
      const nextActive =
        normalized.activeTabId === tabId
          ? nextTabs[nextTabs.length - 1]!
          : normalized.tabs.find((tab) => tab.id === normalized.activeTabId) ?? nextTabs[0]!;
      const resolved = { tabs: nextTabs, activeTabId: nextActive.id };
      navigateDesign(pathForTab(nextActive));
      return resolved;
    });
  }

  function createNewTab() {
    const next = createEntryTab('home');
    setState((current) =>
      normalizeTabsState({ tabs: [...normalizeTabsState(current).tabs, next], activeTabId: next.id }),
    );
    navigateDesign(pathForTab(next));
  }

  return (
    <header
      className="app-chrome-header workspace-tabs-chrome"
      aria-label="Workspace tabs"
      data-testid="design-workspace-chrome"
    >
      <div className="app-chrome-traffic-space workspace-tabs-traffic" aria-hidden />
      <div className="workspace-tabs-strip" role="tablist" aria-label="Open workspaces" ref={stripRef}>
        {state.tabs.map((tab) => {
          const display = displayTabFor(tab, projectById);
          const active = tab.id === state.activeTabId;
          const isPinned = tab.kind === 'entry';
          return (
            <div
              key={tab.id}
              className={`workspace-tab${active ? ' is-active' : ''}${isPinned ? ' is-pinned' : ''}`}
              role="tab"
              aria-selected={active}
            >
              <button type="button" className="workspace-tab__main" onClick={() => activateTab(tab)}>
                <span className="workspace-tab__icon" aria-hidden>
                  <DesignOdIcon name={display.icon} size={14} />
                </span>
                <span className="workspace-tab__label">{display.title}</span>
              </button>
              {isPinned ? null : (
                <button
                  type="button"
                  className="workspace-tab__close od-tooltip"
                  aria-label="Close tab"
                  data-tooltip="Close"
                  onClick={() => closeTab(tab.id)}
                >
                  <DesignOdIcon name="close" size={10} />
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="workspace-tabs-new-btn od-tooltip"
          onClick={createNewTab}
          aria-label="New tab"
          data-testid="workspace-tabs-new-tab"
          data-tooltip="New tab"
        >
          <DesignOdIcon name="plus" size={14} />
        </button>
      </div>
      <div className="workspace-tabs-actions" ref={menuRef}>
        {hub.activeRunCount > 0 ? (
          <span
            className="workspace-active-runs-badge mr-2 shrink-0 rounded-full bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]"
            data-testid="design-active-runs-badge"
          >
            {hub.activeRunCount} active
          </span>
        ) : null}
        <button
          type="button"
          className={`workspace-tabs-icon-btn od-tooltip${tabsMenuOpen ? ' is-active' : ''}`}
          onClick={() => setTabsMenuOpen((open) => !open)}
          aria-label="Search tabs"
          aria-haspopup="dialog"
          aria-expanded={tabsMenuOpen}
          data-tooltip="Search tabs"
        >
          <DesignOdIcon name="search" size={15} />
        </button>
        {tabsMenuOpen && typeof document !== 'undefined'
          ? createPortal(
              <div
                className="workspace-tabs-popover"
                role="dialog"
                aria-label="Search tabs"
                ref={popoverRef}
              >
                <div className="workspace-tabs-search">
                  <DesignOdIcon name="search" size={14} />
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tabs"
                    aria-label="Search tabs"
                  />
                </div>
                <div className="workspace-tabs-popover__section">
                  <span>Open tabs</span>
                  <span>{state.tabs.length}</span>
                </div>
                <div className="workspace-tabs-list" role="listbox" aria-label="Open tabs">
                  {filteredTabs.map((display) => {
                    const active = display.id === state.activeTabId;
                    return (
                      <div
                        key={display.id}
                        className={`workspace-tabs-list__item${active ? ' is-active' : ''}`}
                        role="option"
                        aria-selected={active}
                      >
                        <button
                          type="button"
                          className="workspace-tabs-list__main"
                          onClick={() => activateTab(display.tab)}
                        >
                          <span className="workspace-tabs-list__icon" aria-hidden>
                            <DesignOdIcon name={display.icon} size={15} />
                          </span>
                          <span className="workspace-tabs-list__text">
                            <span className="workspace-tabs-list__title">{display.title}</span>
                            <span className="workspace-tabs-list__meta">{display.meta}</span>
                          </span>
                        </button>
                        {display.tab.kind === 'entry' ? null : (
                          <button
                            type="button"
                            className="workspace-tabs-list__close"
                            aria-label="Close tab"
                            onClick={() => closeTab(display.id)}
                          >
                            <DesignOdIcon name="close" size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </header>
  );
}
