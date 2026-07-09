/**
 * Runtime UI bridge — programmatic control of harness UI surfaces from agents,
 * E2E tests, and external automation (Playwright evaluate, MCP hints).
 *
 * Contract: window.__hcpUi + CustomEvent 'hcp:ui-command'
 */

export type UiCommandAction =
  | 'artifact.open'
  | 'artifact.close'
  | 'browser.open'
  | 'browser.close';

export interface UiCommandPayload {
  action: UiCommandAction;
  path?: string;
  projectId?: string;
  url?: string;
  conversationId?: string;
}

export interface HcpUiBridge {
  openArtifact: (path: string, projectId?: string) => void;
  closeArtifact: () => void;
  openBrowser: (url: string, conversationId?: string) => void;
  closeBrowser: () => void;
  version: number;
}

export const HCP_UI_COMMAND_EVENT = 'hcp:ui-command';
export const HCP_UI_BRIDGE_VERSION = 2;

type UiCommandHandler = (command: UiCommandPayload) => void;

export type HcpUiHandlers = {
  openArtifact?: (path: string, projectId?: string) => void;
  closeArtifact?: () => void;
  openBrowser?: (url: string, conversationId?: string) => void;
  closeBrowser?: () => void;
};

const registeredHandlers: HcpUiHandlers = {};

let commandHandler: UiCommandHandler | null = null;
let globalCommandListenerAttached = false;

function noop(): void {
  return undefined;
}

export function registerUiCommandHandler(handler: UiCommandHandler): () => void {
  commandHandler = handler;
  return () => {
    if (commandHandler === handler) {
      commandHandler = null;
    }
  };
}

export function dispatchUiCommand(command: UiCommandPayload): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HCP_UI_COMMAND_EVENT, { detail: command }));
  }
  commandHandler?.(command);
}

function applyUiCommand(command: UiCommandPayload): void {
  if (!command?.action) {
    return;
  }
  if (command.action === 'artifact.open' && command.path) {
    registeredHandlers.openArtifact?.(command.path, command.projectId);
    return;
  }
  if (command.action === 'artifact.close') {
    registeredHandlers.closeArtifact?.();
    return;
  }
  if (command.action === 'browser.open' && command.url) {
    registeredHandlers.openBrowser?.(command.url, command.conversationId);
    return;
  }
  if (command.action === 'browser.close') {
    registeredHandlers.closeBrowser?.();
  }
}

function ensureGlobalCommandListener(): void {
  if (typeof window === 'undefined' || globalCommandListenerAttached) {
    return;
  }

  const onCommand = (event: Event): void => {
    const detail = (event as CustomEvent<UiCommandPayload>).detail;
    if (!detail?.action) {
      return;
    }
    applyUiCommand(detail);
  };

  window.addEventListener(HCP_UI_COMMAND_EVENT, onCommand);
  globalCommandListenerAttached = true;
}

function syncWindowBridge(): void {
  if (typeof window === 'undefined') {
    return;
  }

  ensureGlobalCommandListener();

  const bridge: HcpUiBridge = {
    version: HCP_UI_BRIDGE_VERSION,
    openArtifact: (path, projectId) => {
      registeredHandlers.openArtifact?.(path, projectId);
      dispatchUiCommand({ action: 'artifact.open', path, projectId });
    },
    closeArtifact: () => {
      registeredHandlers.closeArtifact?.();
      dispatchUiCommand({ action: 'artifact.close' });
    },
    openBrowser: (url, conversationId) => {
      registeredHandlers.openBrowser?.(url, conversationId);
      dispatchUiCommand({ action: 'browser.open', url, conversationId });
    },
    closeBrowser: () => {
      registeredHandlers.closeBrowser?.();
      dispatchUiCommand({ action: 'browser.close' });
    },
  };

  (window as Window & { __hcpUi?: HcpUiBridge }).__hcpUi = bridge;
}

export function registerHcpUiHandlers(handlers: HcpUiHandlers): () => void {
  if (handlers.openArtifact) {
    registeredHandlers.openArtifact = handlers.openArtifact;
  }
  if (handlers.closeArtifact) {
    registeredHandlers.closeArtifact = handlers.closeArtifact;
  }
  if (handlers.openBrowser) {
    registeredHandlers.openBrowser = handlers.openBrowser;
  }
  if (handlers.closeBrowser) {
    registeredHandlers.closeBrowser = handlers.closeBrowser;
  }

  syncWindowBridge();

  return () => {
    if (handlers.openArtifact && registeredHandlers.openArtifact === handlers.openArtifact) {
      delete registeredHandlers.openArtifact;
    }
    if (handlers.closeArtifact && registeredHandlers.closeArtifact === handlers.closeArtifact) {
      delete registeredHandlers.closeArtifact;
    }
    if (handlers.openBrowser && registeredHandlers.openBrowser === handlers.openBrowser) {
      delete registeredHandlers.openBrowser;
    }
    if (handlers.closeBrowser && registeredHandlers.closeBrowser === handlers.closeBrowser) {
      delete registeredHandlers.closeBrowser;
    }

    if (
      !registeredHandlers.openArtifact &&
      !registeredHandlers.closeArtifact &&
      !registeredHandlers.openBrowser &&
      !registeredHandlers.closeBrowser
    ) {
      delete (window as Window & { __hcpUi?: HcpUiBridge }).__hcpUi;
      return;
    }

    syncWindowBridge();
  };
}

/** @deprecated Use registerHcpUiHandlers — kept for ChatArtifactProvider call sites. */
export function installHcpUiBridge(handlers: {
  openArtifact: (path: string, projectId?: string) => void;
  closeArtifact: () => void;
}): () => void {
  return registerHcpUiHandlers(handlers);
}

export function buildUiControlManifest(baseUrl: string): Record<string, unknown> {
  return {
    version: HCP_UI_BRIDGE_VERSION,
    updatedAt: new Date().toISOString(),
    routing: {
      workspaceFile:
        'Paths under .business/ or known file extensions → artifactPanel.open (not browserPanel)',
      externalUrl: 'http(s):// URLs → browserPanel.open (not artifactPanel)',
    },
    surfaces: {
      artifactPanel: {
        open: {
          methods: [
            {
              type: 'browser-eval',
              expression: 'window.__hcpUi?.openArtifact(path, projectId)',
              params: { path: 'string', projectId: 'string?' },
            },
            {
              type: 'url-query',
              pattern: `${baseUrl}?artifact-open={path}`,
            },
            {
              type: 'custom-event',
              event: HCP_UI_COMMAND_EVENT,
              detail: { action: 'artifact.open', path: '{path}', projectId: '{projectId?}' },
            },
          ],
        },
        close: {
          methods: [
            {
              type: 'browser-eval',
              expression: 'window.__hcpUi?.closeArtifact()',
            },
            {
              type: 'custom-event',
              event: HCP_UI_COMMAND_EVENT,
              detail: { action: 'artifact.close' },
            },
          ],
        },
      },
      browserPanel: {
        open: {
          methods: [
            {
              type: 'browser-eval',
              expression: 'window.__hcpUi?.openBrowser(url, conversationId)',
              params: { url: 'string', conversationId: 'string?' },
            },
            {
              type: 'custom-event',
              event: 'runtime:open-browser',
              detail: { url: '{url}', conversationId: '{conversationId?}' },
            },
            {
              type: 'custom-event',
              event: HCP_UI_COMMAND_EVENT,
              detail: { action: 'browser.open', url: '{url}', conversationId: '{conversationId?}' },
            },
            {
              type: 'api-then-eval',
              note: 'Shell POST alone does not open the panel — always follow with openBrowser eval or wait for browser.session.ready SSE',
              steps: [
                'POST /api/runtime/browser/session { url, conversation_id }',
                'window.__hcpUi?.openBrowser(url, conversationId)',
              ],
            },
          ],
        },
        close: {
          methods: [
            {
              type: 'browser-eval',
              expression: 'window.__hcpUi?.closeBrowser()',
            },
            {
              type: 'custom-event',
              event: HCP_UI_COMMAND_EVENT,
              detail: { action: 'browser.close' },
            },
          ],
        },
      },
    },
    mcpHint: {
      workspaceFile:
        "await page.evaluate((p) => window.__hcpUi?.openArtifact(p), '.business/samples/report.csv')",
      externalUrl:
        "await page.evaluate(({ url, cid }) => window.__hcpUi?.openBrowser(url, cid), { url: 'https://example.com', cid: 'default' })",
    },
  };
}

export function resolvePreviewTarget(target: string): 'artifact' | 'browser' {
  const trimmed = target.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return 'browser';
  }
  return 'artifact';
}

/** Safe no-op stubs when bridge handlers are not yet registered. */
export function stubHcpUiBridge(): HcpUiBridge {
  return {
    version: HCP_UI_BRIDGE_VERSION,
    openArtifact: noop,
    closeArtifact: noop,
    openBrowser: noop,
    closeBrowser: noop,
  };
}
