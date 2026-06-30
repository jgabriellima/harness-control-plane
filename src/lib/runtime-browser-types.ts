export type BrowserRenderMode = 'screencast' | 'iframe';

export type BrowserControlMode = 'user' | 'agent';

export interface RuntimeBrowserSelection {
  url: string;
  sessionId: string | null;
  loading: boolean;
  error: string | null;
  renderMode: BrowserRenderMode;
  streamUrl: string | null;
  controlMode: BrowserControlMode;
  viewportWidth: number;
  viewportHeight: number;
  interactive: boolean;
}

export function emptyBrowserSelection(url: string): RuntimeBrowserSelection {
  return {
    url,
    sessionId: null,
    loading: true,
    error: null,
    renderMode: 'screencast',
    streamUrl: null,
    controlMode: 'agent',
    viewportWidth: 1280,
    viewportHeight: 720,
    interactive: false,
  };
}

export function isBrowserToolName(tool: string): boolean {
  const normalized = tool.trim().toLowerCase();
  return normalized.startsWith('browser_') || normalized.startsWith('browser');
}

export function normalizeBrowserUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'about:blank';
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('about:')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export interface BrowserPanelTargetResolution {
  url: string;
  interactive: boolean;
  /** Input URL targets the control plane shell — must not load inside Playwright. */
  harnessSelf: boolean;
  /** Open the embedded panel in-app only; never navigate the shell or spawn an external tab. */
  panelOnly: boolean;
}

function isLocalControlPlaneHost(parsed: URL): boolean {
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    return false;
  }
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  return port >= 4320 && port <= 4349;
}

export function resolveBrowserPanelTarget(
  raw: string,
  currentOrigin?: string,
): BrowserPanelTargetResolution {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { url: 'about:blank', interactive: false, harnessSelf: false, panelOnly: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, currentOrigin ?? 'http://127.0.0.1');
  } catch {
    return { url: normalizeBrowserUrl(trimmed), interactive: false, harnessSelf: false, panelOnly: false };
  }

  const harnessSelf =
    Boolean(currentOrigin && parsed.origin === currentOrigin) || isLocalControlPlaneHost(parsed);

  if (!harnessSelf) {
    return { url: normalizeBrowserUrl(trimmed), interactive: false, harnessSelf: false, panelOnly: false };
  }

  const nested = parsed.searchParams.get('browser-open');
  const interactive = parsed.searchParams.get('browser-interactive') === '1';
  if (nested) {
    return {
      url: normalizeBrowserUrl(nested),
      interactive,
      harnessSelf: true,
      panelOnly: true,
    };
  }

  return { url: 'about:blank', interactive: false, harnessSelf: true, panelOnly: true };
}

/** HTTP(S) links in chat that should open in the embedded runtime browser panel. */
export function isChatBrowserLink(href: string, currentOrigin?: string): boolean {
  const trimmed = href.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }

  const resolved = resolveBrowserPanelTarget(trimmed, currentOrigin);
  if (resolved.harnessSelf) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    if (!isLocal) {
      return true;
    }

    const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
    const isRoot = !parsed.pathname || parsed.pathname === '/';
    // CDP and other debug endpoints on localhost — keep as external links.
    if (isRoot && !isLocalControlPlaneHost(parsed) && port !== 80 && port !== 443) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export function extractBrowserNavigateUrl(args: unknown): string | null {
  if (typeof args !== 'object' || args === null) {
    return null;
  }
  const record = args as Record<string, unknown>;
  const url = record.url ?? record.href ?? record.link;
  if (typeof url !== 'string' || url.trim().length === 0) {
    return null;
  }
  return normalizeBrowserUrl(url.trim());
}
