import { execFile, spawn } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import {
  COMPUTER_USE_PERMISSION_DIALOG_HINT,
  COMPUTER_USE_PERMISSION_HINT,
  COMPUTER_USE_PERMISSION_STEPS,
} from './runtime-computer-use-copy';
import { resolveHarnessBinding } from './harness-binding';

const execFileAsync = promisify(execFile);

const INSTALL_SCRIPT =
  'curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh | bash';

export type ComputerUseSetupPhase =
  | 'idle'
  | 'installing'
  | 'configuring'
  | 'permissions'
  | 'ready'
  | 'error';

export interface ComputerUseSetupStatus {
  phase: ComputerUseSetupPhase;
  ready: boolean;
  driverInstalled: boolean;
  mcpConfigured: boolean;
  daemonRunning: boolean;
  permissionsGranted: boolean;
  platform: string;
  message: string | null;
  userAction: string | null;
  mcpConfigPaths: string[];
}

function driverExecEnv(): NodeJS.ProcessEnv {
  const localBin = join(homedir(), '.local/bin');
  const pathValue = process.env.PATH ?? '';
  const augmented = pathValue.includes(localBin) ? pathValue : `${localBin}:${pathValue}`;
  return { ...process.env, PATH: augmented };
}

async function runDriver(
  args: string[],
  options: { timeoutMs?: number; ignoreError?: boolean } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  const timeoutMs = options.timeoutMs ?? 60_000;

  try {
    const result = await execFileAsync('cua-driver', args, {
      env: driverExecEnv(),
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { stdout: String(result.stdout), stderr: String(result.stderr), code: 0 };
  } catch (error) {
    if (options.ignoreError && error && typeof error === 'object') {
      const execError = error as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: String(execError.stdout ?? ''),
        stderr: String(execError.stderr ?? ''),
        code: typeof execError.code === 'number' ? execError.code : 1,
      };
    }
    throw error;
  }
}

async function isDriverOnPath(): Promise<boolean> {
  try {
    await execFileAsync('command', ['-v', 'cua-driver'], {
      env: driverExecEnv(),
      shell: true,
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readMcpConfig(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function mergeMcpSnippet(targetPath: string, snippet: Record<string, unknown>): Promise<void> {
  const servers = snippet.mcpServers;
  if (!isRecord(servers)) {
    throw new Error('cua-driver mcp-config did not return mcpServers');
  }

  await mkdir(join(targetPath, '..'), { recursive: true });
  const existing = await readMcpConfig(targetPath);
  const existingServers = isRecord(existing.mcpServers) ? existing.mcpServers : {};

  const merged = {
    ...existing,
    mcpServers: {
      ...existingServers,
      ...servers,
    },
  };

  await writeFile(targetPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

export async function wireCuaDriverMcp(workspaceRoot: string): Promise<string[]> {
  const { stdout } = await runDriver(['mcp-config', '--client', 'cursor'], { timeoutMs: 15_000 });
  const snippet = extractJsonObject(stdout);
  if (!snippet) {
    throw new Error('Failed to parse cua-driver mcp-config output');
  }

  const paths: string[] = [];
  const projectMcp = join(workspaceRoot, '.cursor', 'mcp.json');
  await mergeMcpSnippet(projectMcp, snippet);
  paths.push(projectMcp);

  const userMcp = join(homedir(), '.cursor', 'mcp.json');
  if (userMcp !== projectMcp) {
    await mergeMcpSnippet(userMcp, snippet);
    paths.push(userMcp);
  }

  return paths;
}

async function installDriver(): Promise<void> {
  await execFileAsync('bash', ['-lc', INSTALL_SCRIPT], {
    env: driverExecEnv(),
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export async function stopDaemon(): Promise<void> {
  await runDriver(['stop'], { timeoutMs: 10_000, ignoreError: true });

  if (platform() === 'darwin') {
    try {
      await execFileAsync('osascript', ['-e', 'tell application "CuaDriver" to quit'], {
        timeout: 5_000,
      });
    } catch {
      // App may not be running.
    }
    try {
      await execFileAsync('killall', ['CuaDriver'], { timeout: 5_000 });
    } catch {
      // Process may already be stopped.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

/** Stop before permission toggles to avoid macOS "Quit & Reopen" when possible. */
export async function preparePermissionGrant(): Promise<void> {
  await stopDaemon();
}

export async function restartDaemonAfterPermissions(): Promise<boolean> {
  await stopDaemon();
  return ensureDaemonRunning();
}

export async function ensureDaemonRunning(): Promise<boolean> {
  if (platform() === 'darwin') {
    try {
      await execFileAsync('open', ['-n', '-g', '-a', 'CuaDriver', '--args', 'serve'], {
        timeout: 10_000,
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return true;
    } catch {
      return false;
    }
  }

  try {
    const { code } = await runDriver(['status'], { timeoutMs: 5_000, ignoreError: true });
    if (code === 0) {
      return true;
    }
    await runDriver(['serve', '--no-permissions-gate'], { timeoutMs: 3_000, ignoreError: true });
    return true;
  } catch {
    return false;
  }
}

async function probeDaemonRunning(): Promise<boolean> {
  try {
    const { code } = await runDriver(['status'], { timeoutMs: 5_000, ignoreError: true });
    return code === 0;
  } catch {
    return false;
  }
}

function permissionsGrantedFromText(output: string): boolean {
  const lower = output.toLowerCase();
  if (lower.includes('granted') && !lower.includes('not granted') && !lower.includes('denied')) {
    return true;
  }
  if (lower.includes('✅') || lower.includes('[ok')) {
    return !lower.includes('missing') && !lower.includes('denied');
  }
  return false;
}

export async function probePermissionsGranted(): Promise<boolean> {
  if (platform() !== 'darwin') {
    try {
      const { stdout, code } = await runDriver(['doctor', '--json'], {
        timeoutMs: 20_000,
        ignoreError: true,
      });
      if (code === 0) {
        return true;
      }
      const parsed = extractJsonObject(stdout);
      if (parsed && Array.isArray(parsed.probes)) {
        return parsed.probes.every(
          (probe) => !isRecord(probe) || probe.status !== 'error',
        );
      }
    } catch {
      return false;
    }
    return false;
  }

  try {
    const { stdout } = await runDriver(['permissions', 'status'], {
      timeoutMs: 15_000,
      ignoreError: true,
    });
    return permissionsGrantedFromText(stdout);
  } catch {
    return false;
  }
}

export async function requestPermissionsGrant(): Promise<void> {
  if (platform() !== 'darwin') {
    return;
  }

  await runDriver(['permissions', 'grant'], {
    timeoutMs: 120_000,
    ignoreError: true,
  });
}

/** Fire-and-forget — opens macOS permission dialogs without blocking the HTTP response. */
export function startPermissionsGrantDetached(): void {
  if (platform() !== 'darwin') {
    return;
  }

  try {
    const child = spawn('cua-driver', ['permissions', 'grant'], {
      env: driverExecEnv(),
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    // Driver missing — caller should surface via probe.
  }
}

export async function openMacPermissionSettings(): Promise<void> {
  if (platform() !== 'darwin') {
    return;
  }

  const panels = [
    'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility',
    'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture',
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  ];

  for (const panel of panels) {
    try {
      await execFileAsync('open', [panel], { timeout: 5_000 });
    } catch {
      // Try next deep link variant.
    }
  }
}

export async function probeComputerUseSetup(workspaceRoot?: string): Promise<ComputerUseSetupStatus> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const root = binding.workspaceRoot;

  const driverInstalled = await isDriverOnPath();
  let mcpConfigured = false;
  const mcpConfigPaths: string[] = [];

  for (const candidate of [join(root, '.cursor', 'mcp.json'), join(homedir(), '.cursor', 'mcp.json')]) {
    try {
      const config = await readMcpConfig(candidate);
      const servers = config.mcpServers;
      if (isRecord(servers) && isRecord(servers['cua-driver'])) {
        mcpConfigured = true;
        mcpConfigPaths.push(candidate);
      }
    } catch {
      // skip
    }
  }

  const daemonRunning = driverInstalled ? await probeDaemonRunning() : false;
  const permissionsGranted = driverInstalled ? await probePermissionsGranted() : false;

  const ready = driverInstalled && mcpConfigured && permissionsGranted;

  let phase: ComputerUseSetupPhase = 'idle';
  let message: string | null = null;
  let userAction: string | null = null;

  if (!driverInstalled) {
    phase = 'idle';
    message = 'Driver not installed';
  } else if (!mcpConfigured) {
    phase = 'configuring';
    message = 'MCP configuration pending';
  } else if (!permissionsGranted) {
    phase = 'permissions';
    message = 'macOS permissions required';
    userAction =
      platform() === 'darwin' ? COMPUTER_USE_PERMISSION_STEPS : 'Complete platform permission prompts for Cua Driver.';
  } else {
    phase = 'ready';
    message = 'Computer use is ready';
  }

  return {
    phase,
    ready,
    driverInstalled,
    mcpConfigured,
    daemonRunning,
    permissionsGranted,
    platform: platform(),
    message,
    userAction,
    mcpConfigPaths,
  };
}

export interface ActivateComputerUseResult {
  setup: ComputerUseSetupStatus;
  activated: boolean;
}

export async function activateComputerUse(workspaceRoot?: string): Promise<ActivateComputerUseResult> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const root = binding.workspaceRoot;

  try {
    if (!(await isDriverOnPath())) {
      await installDriver();
    }

    if (!(await isDriverOnPath())) {
      throw new Error(
        'cua-driver install finished but binary is not on PATH. Restart the app and try again.',
      );
    }

    await wireCuaDriverMcp(root);

    if (platform() === 'darwin' && !(await probePermissionsGranted())) {
      await preparePermissionGrant();
      startPermissionsGrantDetached();
    } else {
      await ensureDaemonRunning();
    }

    const setup = await probeComputerUseSetup(root);

    if (setup.ready) {
      await restartDaemonAfterPermissions();
      const { saveComputerUsePreferences } = await import('./runtime-computer-use-preferences');
      await saveComputerUsePreferences({ hostControlEnabled: true }, root);
      return { setup: { ...setup, phase: 'ready' }, activated: true };
    }

    return { setup, activated: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Computer use activation failed';
    const setup = await probeComputerUseSetup(root);
    return {
      setup: {
        ...setup,
        phase: 'error',
        ready: false,
        message,
        userAction: 'Retry activation or open System Settings manually.',
      },
      activated: false,
    };
  }
}

export async function tryCompleteComputerUseSetup(workspaceRoot?: string): Promise<{
  restarted: boolean;
  activated: boolean;
}> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const root = binding.workspaceRoot;
  const { loadComputerUsePreferences, saveComputerUsePreferences } = await import(
    './runtime-computer-use-preferences'
  );

  const preferences = await loadComputerUsePreferences(root);
  if (preferences.hostControlEnabled) {
    return { restarted: false, activated: true };
  }

  const setup = await probeComputerUseSetup(root);
  if (!setup.driverInstalled || !setup.mcpConfigured) {
    return { restarted: false, activated: false };
  }

  // Daemon must relaunch after TCC toggles — picks up Screen Recording + Accessibility grants.
  await restartDaemonAfterPermissions();
  const granted = await probePermissionsGranted();
  if (!granted) {
    return { restarted: true, activated: false };
  }

  await saveComputerUsePreferences({ hostControlEnabled: true }, root);
  return { restarted: true, activated: true };
}

export async function finalizeComputerUseActivation(workspaceRoot?: string): Promise<ActivateComputerUseResult> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const root = binding.workspaceRoot;

  if (platform() === 'darwin') {
    await preparePermissionGrant();
    startPermissionsGrantDetached();
  }

  const completed = await tryCompleteComputerUseSetup(root);
  const setup = await probeComputerUseSetup(root);

  if (completed.activated || setup.ready) {
    const { saveComputerUsePreferences } = await import('./runtime-computer-use-preferences');
    await saveComputerUsePreferences({ hostControlEnabled: true }, root);
    return { setup: { ...setup, phase: 'ready', ready: true }, activated: true };
  }

  return { setup, activated: false };
}
