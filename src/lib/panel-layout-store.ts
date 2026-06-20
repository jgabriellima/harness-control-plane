import { useSyncExternalStore } from 'react';

import type { RightPanelManifest } from './ui-panel-manifest';

type Listener = () => void;

interface PanelLayoutState {
  collapsed: boolean;
  manifest: RightPanelManifest | null;
}

let state: PanelLayoutState = {
  collapsed: false,
  manifest: null,
};

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export const panelLayoutStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): PanelLayoutState {
    return state;
  },

  setCollapsed(collapsed: boolean): void {
    if (state.collapsed === collapsed) {
      return;
    }
    state = { ...state, collapsed };
    emit();
  },

  setManifest(manifest: RightPanelManifest): void {
    state = {
      collapsed: manifest.collapsed,
      manifest,
    };
    emit();
  },

  async loadManifest(): Promise<RightPanelManifest> {
    const response = await fetch('/api/ui/right-panel');
    if (!response.ok) {
      throw new Error('Failed to load right panel manifest');
    }
    const manifest = (await response.json()) as RightPanelManifest;
    panelLayoutStore.setManifest(manifest);
    return manifest;
  },

  async persistManifest(patch: {
    collapsed?: boolean;
    widgets?: RightPanelManifest['widgets'];
  }): Promise<RightPanelManifest> {
    const response = await fetch('/api/ui/right-panel', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      throw new Error('Failed to save right panel manifest');
    }

    const manifest = (await response.json()) as RightPanelManifest;
    panelLayoutStore.setManifest(manifest);
    return manifest;
  },
};

export function usePanelLayout(): PanelLayoutState {
  return useSyncExternalStore(
    panelLayoutStore.subscribe,
    panelLayoutStore.getSnapshot,
    panelLayoutStore.getSnapshot,
  );
}

export function usePanelCollapsed(): boolean {
  return usePanelLayout().collapsed;
}
