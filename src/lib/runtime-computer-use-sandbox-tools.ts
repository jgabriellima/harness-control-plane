import type { SDKCustomTool } from '@cursor/sdk';

import { isComputerUseAgentInputBlocked } from './runtime-computer-use-control-gate';
import {
  resolveSandboxManifestForProject,
  runSandboxActionScript,
  type SandboxActionInput,
} from './runtime-computer-use-sandbox-bridge';

const SANDBOX_TOOL_NAMES = new Set(['sandbox_open_url', 'sandbox_screenshot', 'sandbox_shell']);

export function isSandboxToolName(tool: string): boolean {
  return SANDBOX_TOOL_NAMES.has(tool.trim().toLowerCase());
}

function toolError(message: string): string {
  return JSON.stringify({ status: 'error', error: message }, null, 2);
}

async function resolveReadySandboxName(
  workspaceRoot: string,
  projectId: string,
): Promise<{ sandboxName: string } | { error: string }> {
  const manifest = await resolveSandboxManifestForProject(projectId, workspaceRoot);
  if (!manifest || manifest.phase !== 'ready' || !manifest.sandboxName) {
    return {
      error:
        'Project sandbox is not ready — wait for the preview panel VNC stream (phase=ready in workspaces/{project}/.business/runtime-sessions/computer-use-sandbox.json).',
    };
  }
  return { sandboxName: manifest.sandboxName };
}

async function executeSandboxAction(
  workspaceRoot: string,
  projectId: string,
  input: Omit<SandboxActionInput, 'sandboxName' | 'workspaceRoot'>,
): Promise<string> {
  if (isComputerUseAgentInputBlocked()) {
    return toolError(
      'Computer use paused — operator has Take control in the preview panel. Ask them to return control to the agent, then retry.',
    );
  }

  const resolved = await resolveReadySandboxName(workspaceRoot, projectId);
  if ('error' in resolved) {
    return toolError(resolved.error);
  }

  const result = await runSandboxActionScript({
    ...input,
    sandboxName: resolved.sandboxName,
    workspaceRoot,
    local: true,
  });

  return JSON.stringify(result, null, 2);
}

/**
 * SDK custom tools for CUA Sandbox mode — proxy to cua_sandbox_action.py via the BFF bridge.
 * All state is scoped to workspaces/{projectId}/ — never app/.business/.
 */
export function buildSandboxCustomTools(input: {
  workspaceRoot: string;
  projectId: string;
}): Record<string, SDKCustomTool> {
  const workspaceRoot = input.workspaceRoot;
  const projectId = input.projectId.trim() || 'default';

  return {
    sandbox_open_url: {
      description:
        'Open a URL in the project CUA Sandbox Firefox browser. Returns JSON with status, url, browser, screenshot_path. Use this for all web browsing in sandbox mode — never use WebSearch or host curl.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL to open (https://...)' },
        },
        required: ['url'],
      },
      execute: async (args) => {
        const url = typeof args.url === 'string' ? args.url.trim() : '';
        if (!url) {
          return toolError('url is required');
        }
        return executeSandboxAction(workspaceRoot, projectId, {
          action: 'open-url',
          url,
        });
      },
    },
    sandbox_screenshot: {
      description:
        'Capture a screenshot of the project CUA Sandbox desktop. Returns JSON with screenshot_path.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () =>
        executeSandboxAction(workspaceRoot, projectId, {
          action: 'screenshot',
        }),
    },
    sandbox_shell: {
      description:
        'Run a shell command inside the project CUA Sandbox Linux VM (DISPLAY=:1). Use for curl/wget/parsing page HTML after sandbox_open_url. Returns JSON with stdout, stderr, exit_code.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run inside the sandbox' },
          timeout: {
            type: 'number',
            description: 'Timeout in seconds (default 60)',
          },
        },
        required: ['command'],
      },
      execute: async (args) => {
        const command = typeof args.command === 'string' ? args.command : '';
        if (!command.trim()) {
          return toolError('command is required');
        }
        const timeout = typeof args.timeout === 'number' ? args.timeout : undefined;
        return executeSandboxAction(workspaceRoot, projectId, {
          action: 'shell',
          command,
          timeout,
        });
      },
    },
  };
}
