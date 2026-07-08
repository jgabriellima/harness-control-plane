/** Cua Driver MCP and related computer-use tool name detection. */

import type { ComputerUseHealthProbe } from './runtime-computer-use-bridge';
import type { ComputerUseSetupStatus } from './runtime-computer-use-setup';

const CUA_TOOL_PREFIXES = ['cua_', 'cua-', 'driver_'] as const;

const CUA_TOOL_NAMES = new Set([
  'screenshot',
  'click',
  'type',
  'scroll',
  'list_windows',
  'list_apps',
  'launch_app',
  'get_window_state',
  'move_mouse',
  'drag',
  'hotkey',
  'press_key',
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
  allowForegroundCursor: boolean;
  consentedAt: string | null;
  healthError?: string | null;
}): string | null {
  if (!input.capabilityAvailable) {
    return '[computer_use: capability not activated — operator must complete setup in Settings before enabling per chat]';
  }

  if (!input.sessionEnabled) {
    return '[computer_use: off for this chat — enable Computer Use in composer options to load desktop control tools]';
  }

  if (input.healthError) {
    return `[computer_use: enabled for this chat but unavailable — ${input.healthError}. Ask the operator to open Settings → Computer Use and retry activation.]`;
  }

  const modes = ['host_background'];
  if (input.allowForegroundCursor) {
    modes.push('host_foreground');
  }

  return [
    `[computer_use: session_enabled modes=${modes.join(',')} consent_at=${input.consentedAt ?? 'unknown'}]`,
    'Use the custom-user-tools MCP server (Jambu computer-use bridge). Call tools by exact name: list_apps, list_windows, get_window_state, click, type_text, scroll, launch_app, health_report, etc.',
    'Never invoke cua-driver via Shell — sandbox blocks the daemon socket. Never ask for macOS permissions again; CuaDriver is already consented in Settings.',
  ].join('\n');
}
