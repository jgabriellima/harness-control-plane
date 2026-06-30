'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  useGroupRef,
  usePanelRef,
  type PanelImperativeHandle,
} from 'react-resizable-panels';

import { usePanelCollapsed } from '@/lib/panel-layout-store';
import { sidebarLayoutStore, useSidebarExpanded } from '@/lib/sidebar-layout-store';
import {
  SHELL_LAYOUT_DEFAULTS,
  SHELL_LAYOUT_GROUP_ID,
  SHELL_LAYOUT_MIN,
  SHELL_PANEL_IDS,
  layoutNeedsRepair,
  sanitizePanelLayout,
  shellManifestToLayout,
  type ShellLayoutSizes,
} from '@/lib/shell-layout';

interface ResizableOrchestrationShellProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  context: React.ReactNode;
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function FixedOrchestrationShell({
  sidebar,
  main,
  context,
}: ResizableOrchestrationShellProps) {
  return (
    <div
      className="grid h-screen grid-cols-[56px_minmax(0,1fr)_320px] overflow-hidden [&>*]:min-h-0"
      data-testid="orchestration-layout"
    >
      {sidebar}
      {main}
      {context}
    </div>
  );
}

function ResizableOrchestrationShellInner({
  sidebar,
  main,
  context,
}: ResizableOrchestrationShellProps) {
  const groupRef = useGroupRef();
  const sidebarPanelRef = usePanelRef();
  const contextPanelRef = usePanelRef();
  const contextCollapsed = usePanelCollapsed();
  const sidebarExpanded = useSidebarExpanded();
  const [manifestLayout, setManifestLayout] = useState<ShellLayoutSizes | null>(null);
  const repairedRef = useRef(false);

  const persistRef = useRef(
    debounce(async (layout: Record<string, number>) => {
      const sanitized = sanitizePanelLayout(layout, manifestLayout ?? undefined);
      try {
        await fetch('/api/ui/shell-layout', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sidebarSize: sanitized[SHELL_PANEL_IDS.sidebar],
            contextSize: sanitized[SHELL_PANEL_IDS.context],
          }),
        });
      } catch {
        // Best-effort persistence.
      }
    }, 400),
  );

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    groupId: SHELL_LAYOUT_GROUP_ID,
    panelIds: [
      SHELL_PANEL_IDS.sidebar,
      SHELL_PANEL_IDS.main,
      SHELL_PANEL_IDS.context,
    ],
  });

  const resolvedDefaultLayout = sanitizePanelLayout(defaultLayout, manifestLayout ?? undefined);

  useEffect(() => {
    let cancelled = false;

    void sidebarLayoutStore.loadManifest().catch(() => undefined);

    void fetch('/api/ui/shell-layout')
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as ShellLayoutSizes;
        if (!cancelled) {
          setManifestLayout(payload);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (repairedRef.current) {
      return;
    }

    const needsRepair = layoutNeedsRepair(defaultLayout);
    const group = groupRef.current;
    if (!needsRepair && !manifestLayout) {
      return;
    }

    const target = sanitizePanelLayout(defaultLayout, manifestLayout ?? undefined);
    if (!needsRepair && manifestLayout && !layoutNeedsRepair(target)) {
      repairedRef.current = true;
      return;
    }

    group?.setLayout?.(target);
    onLayoutChanged(target);
    persistRef.current(target);
    repairedRef.current = true;
  }, [defaultLayout, groupRef, manifestLayout, onLayoutChanged]);

  useEffect(() => {
    const panel = contextPanelRef.current as PanelImperativeHandle | null;
    if (!panel) {
      return;
    }

    if (contextCollapsed) {
      if (!panel.isCollapsed()) {
        panel.collapse();
      }
      return;
    }

    if (panel.isCollapsed()) {
      panel.expand();
    }
  }, [contextCollapsed, contextPanelRef]);

  useEffect(() => {
    const panel = sidebarPanelRef.current as PanelImperativeHandle | null;
    if (!panel) {
      return;
    }

    if (sidebarExpanded) {
      if (panel.isCollapsed()) {
        panel.expand();
      }
      return;
    }

    if (!panel.isCollapsed()) {
      panel.collapse();
    }
  }, [sidebarExpanded, sidebarPanelRef]);

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      const sanitized = sanitizePanelLayout(layout, manifestLayout ?? undefined);
      onLayoutChanged(sanitized);
      persistRef.current(sanitized);
    },
    [manifestLayout, onLayoutChanged],
  );

  const initialLayout =
    manifestLayout !== null
      ? shellManifestToLayout(manifestLayout)
      : resolvedDefaultLayout;

  return (
    <Group
      id={SHELL_LAYOUT_GROUP_ID}
      groupRef={groupRef}
      orientation="horizontal"
      className="h-screen overflow-hidden"
      defaultLayout={initialLayout}
      onLayoutChanged={handleLayoutChanged}
      data-testid="orchestration-layout"
    >
      <Panel
        id={SHELL_PANEL_IDS.sidebar}
        panelRef={sidebarPanelRef}
        minSize="56px"
        collapsible
        collapsedSize="56px"
        defaultSize={initialLayout[SHELL_PANEL_IDS.sidebar] ?? SHELL_LAYOUT_DEFAULTS.sidebar}
        className="relative min-h-0 overflow-hidden bg-white [&>*]:min-h-0"
      >
        {sidebar}
      </Panel>
      <Separator className="w-1 shrink-0 bg-gray-200 transition-colors hover:bg-gray-300" />
      <Panel
        id={SHELL_PANEL_IDS.main}
        minSize={SHELL_LAYOUT_MIN.main}
        className="relative z-0 min-h-0 min-w-0 [&>*]:min-h-0"
      >
        {main}
      </Panel>
      <Separator className="w-1 shrink-0 bg-gray-200 transition-colors hover:bg-gray-300" />
      <Panel
        id={SHELL_PANEL_IDS.context}
        panelRef={contextPanelRef}
        minSize={SHELL_LAYOUT_MIN.context}
        collapsible
        collapsedSize={0}
        defaultSize={initialLayout[SHELL_PANEL_IDS.context] ?? SHELL_LAYOUT_DEFAULTS.context}
        className="min-h-0 min-w-[240px] [&>*]:min-h-0"
      >
        {context}
      </Panel>
    </Group>
  );
}

export default function ResizableOrchestrationShell(props: ResizableOrchestrationShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <FixedOrchestrationShell {...props} />;
  }

  return <ResizableOrchestrationShellInner {...props} />;
}
