/** Cua Driver MCP and related computer-use tool name detection. */

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
}

export function buildComputerUsePromptInjection(preferences: ComputerUsePreferences): string | null {
  if (!preferences.hostControlEnabled) {
    return '[computer_use: disabled — operator must enable host control in Settings]';
  }

  const modes = ['host_background'];
  if (preferences.allowForegroundCursor) {
    modes.push('host_foreground');
  }

  return `[computer_use: enabled modes=${modes.join(',')} consent_at=${preferences.consentedAt ?? 'unknown'}]`;
}
