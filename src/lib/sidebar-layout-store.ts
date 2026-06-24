import { useSyncExternalStore } from 'react';

import type { ShellLayoutManifest } from './ui-shell-layout';

type Listener = () => void;

interface SidebarLayoutState {
  expanded: boolean;
  manifest: ShellLayoutManifest | null;
}

let state: SidebarLayoutState = {
  expanded: false,
  manifest: null,
};

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export const sidebarLayoutStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): SidebarLayoutState {
    return state;
  },

  setExpanded(expanded: boolean): void {
    if (state.expanded === expanded) {
      return;
    }
    state = { ...state, expanded };
    emit();
  },

  setManifest(manifest: ShellLayoutManifest): void {
    state = {
      expanded: manifest.sidebarExpanded,
      manifest,
    };
    emit();
  },

  async loadManifest(): Promise<ShellLayoutManifest> {
    const response = await fetch('/api/ui/shell-layout');
    if (!response.ok) {
      throw new Error('Failed to load shell layout');
    }
    const manifest = (await response.json()) as ShellLayoutManifest;
    sidebarLayoutStore.setManifest(manifest);
    return manifest;
  },

  async persistExpanded(expanded: boolean): Promise<ShellLayoutManifest> {
    const response = await fetch('/api/ui/shell-layout', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sidebarExpanded: expanded }),
    });

    if (!response.ok) {
      throw new Error('Failed to save shell layout');
    }

    const manifest = (await response.json()) as ShellLayoutManifest;
    sidebarLayoutStore.setManifest(manifest);
    return manifest;
  },
};

export function useSidebarLayout(): SidebarLayoutState {
  return useSyncExternalStore(
    sidebarLayoutStore.subscribe,
    sidebarLayoutStore.getSnapshot,
    sidebarLayoutStore.getSnapshot,
  );
}

export function useSidebarExpanded(): boolean {
  return useSidebarLayout().expanded;
}
