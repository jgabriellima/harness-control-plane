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
  };
}

export function isBrowserToolName(tool: string): boolean {
  const normalized = tool.trim().toLowerCase();
  return normalized.startsWith('browser_') || normalized.startsWith('browser');
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
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('about:')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
