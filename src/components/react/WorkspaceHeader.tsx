'use client';

import React from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

import { panelLayoutStore, usePanelCollapsed } from '../../lib/panel-layout-store';

import type { WorkspaceLayoutMode } from '@/lib/runtime-hub-types';
import { useRuntimeHub } from './RuntimeHubProvider';
import WorkspaceHeaderMenu from './WorkspaceHeaderMenu';

interface WorkspaceHeaderProps {
  projectName: string;
}

function layoutButtonClass(active: boolean): string {
  return active
    ? 'bg-violet-100 text-violet-800 ring-violet-300'
    : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50';
}

export default function WorkspaceHeader({ projectName }: WorkspaceHeaderProps) {
  const hub = useRuntimeHub();
  const collapsed = usePanelCollapsed();

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
        <h1 className="truncate text-sm font-medium text-gray-700">{projectName}</h1>
        {hub.activeRunCount > 0 ? (
          <span
            className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800"
            data-testid="workspace-active-runs-badge"
          >
            {hub.activeRunCount} run{hub.activeRunCount === 1 ? '' : 's'} active
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div
          className="hidden items-center gap-1 lg:flex"
          data-testid="workspace-layout-toggle"
          aria-label="Workspace layout mode"
        >
          <button
            type="button"
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${layoutButtonClass(hub.layoutMode === 'single')}`}
            onClick={() => setMode('single')}
          >
            Single
          </button>
          <button
            type="button"
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${layoutButtonClass(hub.layoutMode === 'split-2')}`}
            onClick={() => setMode('split-2')}
          >
            Split 2
          </button>
          <button
            type="button"
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${layoutButtonClass(hub.layoutMode === 'grid-4')}`}
            onClick={() => setMode('grid-4')}
          >
            Grid 4
          </button>
        </div>

        <button
          type="button"
          data-testid="toggle-context-panel"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label={collapsed ? 'Expand context panel' : 'Collapse context panel'}
          aria-pressed={collapsed}
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
          <span>Context</span>
        </button>

        <WorkspaceHeaderMenu />
      </div>
    </header>
  );
}
