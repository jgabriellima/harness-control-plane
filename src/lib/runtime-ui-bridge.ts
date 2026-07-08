/**
 * Runtime UI bridge — programmatic control of harness UI surfaces from agents,
 * E2E tests, and external automation (Playwright evaluate, MCP hints).
 *
 * Contract: window.__hcpUi + CustomEvent 'hcp:ui-command'
 */

export type UiCommandAction = 'artifact.open' | 'artifact.close';

export interface UiCommandPayload {
  action: UiCommandAction;
  path?: string;
  projectId?: string;
}

export interface HcpUiBridge {
  openArtifact: (path: string, projectId?: string) => void;
  closeArtifact: () => void;
  version: number;
}

export const HCP_UI_COMMAND_EVENT = 'hcp:ui-command';
export const HCP_UI_BRIDGE_VERSION = 1;

type UiCommandHandler = (command: UiCommandPayload) => void;

let commandHandler: UiCommandHandler | null = null;

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

export function installHcpUiBridge(handlers: {
  openArtifact: (path: string, projectId?: string) => void;
  closeArtifact: () => void;
}): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const bridge: HcpUiBridge = {
    version: HCP_UI_BRIDGE_VERSION,
    openArtifact: (path, projectId) => {
      handlers.openArtifact(path, projectId);
      dispatchUiCommand({ action: 'artifact.open', path, projectId });
    },
    closeArtifact: () => {
      handlers.closeArtifact();
      dispatchUiCommand({ action: 'artifact.close' });
    },
  };

  (window as Window & { __hcpUi?: HcpUiBridge }).__hcpUi = bridge;

  const onCommand = (event: Event): void => {
    const detail = (event as CustomEvent<UiCommandPayload>).detail;
    if (!detail?.action) {
      return;
    }
    if (detail.action === 'artifact.open' && detail.path) {
      handlers.openArtifact(detail.path, detail.projectId);
      return;
    }
    if (detail.action === 'artifact.close') {
      handlers.closeArtifact();
    }
  };

  window.addEventListener(HCP_UI_COMMAND_EVENT, onCommand);

  return () => {
    window.removeEventListener(HCP_UI_COMMAND_EVENT, onCommand);
    delete (window as Window & { __hcpUi?: HcpUiBridge }).__hcpUi;
  };
}

export function buildUiControlManifest(baseUrl: string): Record<string, unknown> {
  return {
    version: HCP_UI_BRIDGE_VERSION,
    updatedAt: new Date().toISOString(),
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
    },
    mcpHint: {
      note: 'Use Playwright browser_evaluate with window.__hcpUi to open workspace files in the artifact panel without user click.',
      example: "await page.evaluate((p) => window.__hcpUi?.openArtifact(p), '.business/samples/report.csv')",
    },
  };
}
