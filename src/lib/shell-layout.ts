/** Percentage layout for orchestration-shell — mirrors ~280px / ~320px on typical viewports. */

export const SHELL_LAYOUT_GROUP_ID = 'orchestration-shell';

export const SHELL_PANEL_IDS = {
  sidebar: 'sidebar',
  main: 'main',
  context: 'context',
} as const;

export const SHELL_LAYOUT_DEFAULTS = {
  sidebar: 20,
  main: 58,
  context: 22,
} as const;

export const SHELL_LAYOUT_MIN = {
  sidebar: 16,
  main: 34,
  context: 16,
} as const;

export interface ShellLayoutSizes {
  sidebarSize: number;
  contextSize: number;
}

export function shellManifestToLayout(manifest: ShellLayoutSizes): Record<string, number> {
  const sidebar = clampPanelSize(manifest.sidebarSize, SHELL_LAYOUT_DEFAULTS.sidebar, SHELL_LAYOUT_MIN.sidebar);
  const context = clampPanelSize(manifest.contextSize, SHELL_LAYOUT_DEFAULTS.context, SHELL_LAYOUT_MIN.context);
  const main = Math.max(SHELL_LAYOUT_MIN.main, 100 - sidebar - context);
  return {
    [SHELL_PANEL_IDS.sidebar]: sidebar,
    [SHELL_PANEL_IDS.main]: main,
    [SHELL_PANEL_IDS.context]: context,
  };
}

export function clampPanelSize(value: number, fallback: number, minimum: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(40, Math.max(minimum, value));
}

export function sanitizePanelLayout(
  layout: Record<string, number> | undefined,
  manifest?: Partial<ShellLayoutSizes>,
): Record<string, number> {
  const sidebarRaw =
    layout?.[SHELL_PANEL_IDS.sidebar] ?? manifest?.sidebarSize ?? SHELL_LAYOUT_DEFAULTS.sidebar;
  const contextRaw =
    layout?.[SHELL_PANEL_IDS.context] ?? manifest?.contextSize ?? SHELL_LAYOUT_DEFAULTS.context;

  const sidebar = clampPanelSize(sidebarRaw, SHELL_LAYOUT_DEFAULTS.sidebar, SHELL_LAYOUT_MIN.sidebar);
  const context = clampPanelSize(contextRaw, SHELL_LAYOUT_DEFAULTS.context, SHELL_LAYOUT_MIN.context);
  let main = layout?.[SHELL_PANEL_IDS.main] ?? 100 - sidebar - context;

  if (!Number.isFinite(main) || main < SHELL_LAYOUT_MIN.main) {
    main = Math.max(SHELL_LAYOUT_MIN.main, 100 - sidebar - context);
  }

  const total = sidebar + main + context;
  if (Math.abs(total - 100) > 0.5) {
    main = Math.max(SHELL_LAYOUT_MIN.main, 100 - sidebar - context);
  }

  return {
    [SHELL_PANEL_IDS.sidebar]: sidebar,
    [SHELL_PANEL_IDS.main]: main,
    [SHELL_PANEL_IDS.context]: context,
  };
}

export function layoutNeedsRepair(layout: Record<string, number> | undefined): boolean {
  if (!layout) {
    return true;
  }
  const sidebar = layout[SHELL_PANEL_IDS.sidebar];
  const context = layout[SHELL_PANEL_IDS.context];
  return (
    !Number.isFinite(sidebar) ||
    sidebar < SHELL_LAYOUT_MIN.sidebar ||
    !Number.isFinite(context) ||
    context < SHELL_LAYOUT_MIN.context
  );
}
