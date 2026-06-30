'use client';

import React from 'react';
import { Columns2, LayoutGrid, PanelRightClose, PanelRightOpen, Square } from 'lucide-react';

import { panelLayoutStore, usePanelCollapsed } from '../../lib/panel-layout-store';

import type { WorkspaceLayoutMode } from '@/lib/runtime-hub-types';
import { useRuntimeHub } from './RuntimeHubProvider';
import WorkspaceHeaderMenu from './WorkspaceHeaderMenu';

interface WorkspaceHeaderProps {
  projectName: string;
}

const LAYOUT_MODES: Array<{
  mode: WorkspaceLayoutMode;
  label: string;
  icon: typeof Square;
}> = [
  { mode: 'single', label: 'Single pane', icon: Square },
  { mode: 'split-2', label: 'Split two panes', icon: Columns2 },
  { mode: 'grid-4', label: 'Grid four panes', icon: LayoutGrid },
];

function layoutIconButtonClass(active: boolean): string {
  return active
    ? 'bg-gray-100 text-gray-800 ring-gray-200'
    : 'bg-white text-gray-500 ring-gray-200 hover:bg-gray-50 hover:text-gray-700';
}

export default function WorkspaceHeader({ projectName }: WorkspaceHeaderProps) {
  const hub = useRuntimeHub();
  const collapsed = usePanelCollapsed();
  const showProjectTitle = hub.layoutMode === 'single';

  function setMode(mode: WorkspaceLayoutMode): void {
    hub.setLayoutMode(mode);
    const foreground =
      hub.foregroundConversationId ??
      (() => {
        const match = window.location.pathname.match(/^\/conversation\/([^/]+)/);
        return match?.[1] ? decodeURIComponent(match[1]) : null;
      })();

    if (mode === 'single') {
      return;
    }

    const count = mode === 'grid-4' ? 4 : 2;
    const panes = hub.paneConversationIds.slice(0, count);
    while (panes.length < count) {
      panes.push(foreground ?? '');
    }
    hub.setPaneConversationIds(panes);
  }

  return (
    <header
      className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4"
      data-testid="workspace-header"
    >
      <div className="flex min-w-0 items-center gap-3">
        {showProjectTitle ? (
          <h1 className="truncate text-sm font-medium text-gray-700">{projectName}</h1>
        ) : null}
        {hub.activeRunCount > 0 ? (
          <span
            className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-800"
            data-testid="workspace-active-runs-badge"
          >
            {hub.activeRunCount} run{hub.activeRunCount === 1 ? '' : 's'} active
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-0.5"
          data-testid="workspace-layout-toggle"
          role="group"
          aria-label="Workspace layout mode"
        >
          {LAYOUT_MODES.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              data-testid={`workspace-layout-${mode}`}
              aria-label={label}
              aria-pressed={hub.layoutMode === mode}
              title={label}
              className={`rounded-md p-1.5 ring-1 ring-inset ${layoutIconButtonClass(hub.layoutMode === mode)}`}
              onClick={() => setMode(mode)}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <button
          type="button"
          data-testid="toggle-context-panel"
          className={`rounded-md p-1.5 ring-1 ring-inset ${
            collapsed
              ? 'bg-white text-gray-500 ring-gray-200 hover:bg-gray-50'
              : 'bg-gray-100 text-gray-800 ring-gray-200'
          }`}
          aria-label={collapsed ? 'Expand context panel' : 'Collapse context panel'}
          aria-pressed={!collapsed}
          title={collapsed ? 'Show context panel' : 'Hide context panel'}
          onClick={() => {
            void panelLayoutStore.persistManifest({ collapsed: !collapsed }).catch(() => {
              panelLayoutStore.setCollapsed(!collapsed);
            });
          }}
        >
          {collapsed ? (
            <PanelRightOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelRightClose className="h-3.5 w-3.5" />
          )}
        </button>

        <WorkspaceHeaderMenu />
      </div>
    </header>
  );
}
