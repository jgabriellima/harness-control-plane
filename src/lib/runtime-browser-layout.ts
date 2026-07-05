/** Percentage layout for chat ↔ runtime browser split inside the main workspace column. */

export const RUNTIME_BROWSER_LAYOUT_GROUP_ID = 'runtime-browser-split';

export const RUNTIME_BROWSER_PANEL_IDS = {
  main: 'main',
  browser: 'browser',
} as const;

/** Matches prior fixed grid ratio 1.15fr : 0.85fr (~57.5% : 42.5%). */
export const RUNTIME_BROWSER_LAYOUT_DEFAULTS = {
  main: 58,
  browser: 42,
} as const;

export const RUNTIME_BROWSER_LAYOUT_MIN = {
  main: 28,
  browser: 24,
} as const;

export function sanitizeRuntimeBrowserLayout(
  layout: Record<string, number> | undefined,
): Record<string, number> {
  const mainRaw = layout?.[RUNTIME_BROWSER_PANEL_IDS.main] ?? RUNTIME_BROWSER_LAYOUT_DEFAULTS.main;
  const browserRaw =
    layout?.[RUNTIME_BROWSER_PANEL_IDS.browser] ?? RUNTIME_BROWSER_LAYOUT_DEFAULTS.browser;

  const main = clampSize(mainRaw, RUNTIME_BROWSER_LAYOUT_DEFAULTS.main, RUNTIME_BROWSER_LAYOUT_MIN.main);
  const browser = clampSize(
    browserRaw,
    RUNTIME_BROWSER_LAYOUT_DEFAULTS.browser,
    RUNTIME_BROWSER_LAYOUT_MIN.browser,
  );

  const total = main + browser;
  if (Math.abs(total - 100) > 0.5) {
    const normalizedMain = Math.round((main / total) * 100);
    return {
      [RUNTIME_BROWSER_PANEL_IDS.main]: normalizedMain,
      [RUNTIME_BROWSER_PANEL_IDS.browser]: 100 - normalizedMain,
    };
  }

  return {
    [RUNTIME_BROWSER_PANEL_IDS.main]: main,
    [RUNTIME_BROWSER_PANEL_IDS.browser]: browser,
  };
}

function clampSize(value: number, fallback: number, minimum: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(72, Math.max(minimum, value));
}
