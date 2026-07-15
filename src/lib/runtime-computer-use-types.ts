/** Where desktop automation runs for this chat session. */
export type ComputerUseTargetMode = 'host' | 'sandbox';

export function computerUseTargetModeLabel(mode: ComputerUseTargetMode): string {
  return mode === 'host' ? 'My computer' : 'Sandbox';
}

export function parseComputerUseTargetMode(value: unknown): ComputerUseTargetMode | null {
  if (value === 'host' || value === 'sandbox') {
    return value;
  }
  return null;
}

/** Cua Driver MCP and related computer-use tool name detection. */

import type { ComputerUseHealthProbe } from './runtime-computer-use-bridge';
import type { ComputerUseSetupStatus } from './runtime-computer-use-setup';

const CUA_TOOL_PREFIXES = ['cua_', 'cua-', 'driver_'] as const;

const CUA_TOOL_NAMES = new Set([
  'screenshot',
  'click',
  'type',
  'type_text',
  'scroll',
  'list_windows',
  'list_apps',
  'launch_app',
  'get_window_state',
  'get_desktop_state',
  'move_mouse',
  'move_cursor',
  'drag',
  'hotkey',
  'press_key',
  'zoom',
  'double_click',
  'right_click',
]);

export function isCuaToolName(tool: string): boolean {
  const normalized = tool.trim().toLowerCase();
  if (CUA_TOOL_NAMES.has(normalized)) {
    return true;
  }
  return CUA_TOOL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export interface ComputerUsePreferences {
  hostControlEnabled: boolean;
  allowForegroundCursor: boolean;
  consentedAt: string | null;
  updatedAt: string;
}

export function defaultComputerUsePreferences(): ComputerUsePreferences {
  const now = new Date().toISOString();
  return {
    hostControlEnabled: false,
    allowForegroundCursor: false,
    consentedAt: null,
    updatedAt: now,
  };
}

export interface ComputerUseStatus {
  preferences: ComputerUsePreferences;
  driverOnPath: boolean;
  preferencesPath: string;
  setup: ComputerUseSetupStatus;
  active: boolean;
  health: ComputerUseHealthProbe | null;
}

export function buildComputerUsePromptInjection(input: {
  capabilityAvailable: boolean;
  sessionEnabled: boolean;
  targetMode: ComputerUseTargetMode;
  allowForegroundCursor: boolean;
  consentedAt: string | null;
  healthError?: string | null;
  previewActive?: boolean;
  previewControlMode?: 'user' | 'agent';
  sandboxReady?: boolean;
  sandboxName?: string;
  sandboxApiPort?: number;
  sandboxVncPort?: number;
  sandboxOpenUrlRecipe?: string;
}): string | null {
  if (!input.sessionEnabled) {
    return '[computer_use: off for this chat — enable My computer or Sandbox in composer options]';
  }

  if (input.targetMode === 'sandbox') {
    const lines: string[] = [
      '[computer_use: session_enabled target=sandbox]',
      input.previewActive
        ? `[computer_use_preview: active target=sandbox stream=vnc controlMode=${input.previewControlMode ?? 'agent'}]`
        : '[computer_use_preview: inactive target=sandbox stream=vnc — panel embeds live noVNC when sandbox starts]',
    ];

    if (input.sandboxReady && input.sandboxName) {
      const attrs = [
        `sandbox_name=${input.sandboxName}`,
        input.sandboxApiPort !== undefined ? `api_port=${input.sandboxApiPort}` : null,
        input.sandboxVncPort !== undefined ? `vnc_port=${input.sandboxVncPort}` : null,
      ]
        .filter(Boolean)
        .join(' ');
      lines.push(`[computer_use_sandbox: ready] ${attrs}`);
      lines.push(
        'sandbox_tools=sandbox_open_url,sandbox_screenshot,sandbox_shell (injected custom tools — use ONLY these)',
      );
      if (input.sandboxOpenUrlRecipe) {
        lines.push(`open_url_recipe=${input.sandboxOpenUrlRecipe}`);
      }
    } else {
      lines.push('[computer_use_sandbox: not_ready] — sandbox is starting; check the preview panel for status');
    }

    lines.push(
      'Sandbox mode is ACTIVE for this chat turn. You are NOT on the operator Mac.',
      'MANDATORY: execute ALL web and shell work via sandbox_open_url, sandbox_screenshot, sandbox_shell — one project sandbox shared by every chat in this project.',
      'To browse a site: (1) sandbox_open_url { url }, (2) sandbox_shell { command: "curl -sL ..." } or sandbox_screenshot for visual verification.',
      'FORBIDDEN in sandbox mode: WebSearch, WebFetch, host Shell, host curl/wget, cua-driver, custom-user-tools, launch_app, get_desktop_state, docker ps, script discovery, guessing sandbox names.',
      'Do NOT substitute web search or host HTTP for sandbox browser actions — the operator preview panel must reflect real sandbox activity.',
      'Do not write manifest files or probe runtime-sessions from within a chat turn.',
      'The operator preview panel shows the project sandbox noVNC stream — never confuse it with the host desktop.',
    );

    return lines.join('\n');
  }

  if (!input.capabilityAvailable) {
    return '[computer_use: My computer selected but capability not activated — complete setup in Settings first]';
  }

  if (input.healthError) {
    return `[computer_use: My computer enabled but unavailable — ${input.healthError}. Ask the operator to open Settings → Computer Use and retry activation.]`;
  }

  const modes = ['host_background'];
  if (input.allowForegroundCursor) {
    modes.push('host_foreground');
  }

  return [
    `[computer_use: session_enabled target=host modes=${modes.join(',')} consent_at=${input.consentedAt ?? 'unknown'}]`,
    input.previewActive
      ? `[computer_use_preview: active target=host controlMode=${input.previewControlMode ?? 'agent'} — operator may Take control in the artifact preview panel]`
      : '[computer_use_preview: inactive target=host — panel opens automatically when you call desktop tools]',
    'Use the custom-user-tools MCP server (Jambu computer-use bridge). Call tools by exact name: list_apps, list_windows, get_window_state, get_desktop_state, click, type_text, scroll, launch_app, health_report, etc.',
    'Never invoke cua-driver via Shell — sandbox blocks the daemon socket. Never ask for macOS permissions again; CuaDriver is already consented in Settings.',
    'When preview controlMode is user, wait for the operator to return control before desktop actions.',
  ].join('\n');
}
