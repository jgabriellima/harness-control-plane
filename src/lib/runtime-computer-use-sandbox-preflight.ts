import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { resolveControlPlaneInstallRoot } from './repo-root';

const execFileAsync = promisify(execFile);

const PREFLIGHT_TIMEOUT_MS = 10_000;

export type SandboxPreflightFailureKind =
  | 'docker_not_installed'
  | 'docker_daemon_down'
  | 'cua_sandbox_missing'
  | 'cua_cli_missing'
  | 'cua_api_key_missing'
  | 'unknown';

export interface SandboxPreflightCheck {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  remediation: string | null;
  failureKind: SandboxPreflightFailureKind | null;
}

export interface SandboxPreflightResult {
  ok: boolean;
  checks: SandboxPreflightCheck[];
  summary: string | null;
  primaryFailureKind: SandboxPreflightFailureKind | null;
}

function checkFromResult(input: {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  remediation?: string;
  failureKind?: SandboxPreflightFailureKind;
}): SandboxPreflightCheck {
  return {
    id: input.id,
    label: input.label,
    ok: input.ok,
    message: input.message,
    remediation: input.remediation ?? null,
    failureKind: input.ok ? null : (input.failureKind ?? 'unknown'),
  };
}

async function isDockerCliInstalled(): Promise<boolean> {
  try {
    await execFileAsync('command', ['-v', 'docker'], {
      timeout: 3_000,
      env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

async function checkSandboxBootstrapScript(): Promise<SandboxPreflightCheck> {
  const script = join(resolveControlPlaneInstallRoot(), 'scripts', 'cua_sandbox_vnc.py');
  if (existsSync(script)) {
    return checkFromResult({
      id: 'sandbox_bootstrap_script',
      label: 'Sandbox bootstrap script',
      ok: true,
      message: 'cua_sandbox_vnc.py available',
    });
  }
  return checkFromResult({
    id: 'sandbox_bootstrap_script',
    label: 'Sandbox bootstrap script',
    ok: false,
    message: `Missing control-plane script at ${script}`,
    remediation:
      'Reinstall or rebuild harness-control-plane — scripts/cua_sandbox_vnc.py must ship with the control plane package.',
    failureKind: 'unknown',
  });
}

async function checkDockerDaemon(): Promise<SandboxPreflightCheck> {
  const cliInstalled = await isDockerCliInstalled();
  if (!cliInstalled) {
    return checkFromResult({
      id: 'docker_daemon',
      label: 'Docker',
      ok: false,
      message: 'Docker is not installed on this machine',
      remediation:
        'Install Docker Desktop from https://www.docker.com/products/docker-desktop/ — Sandbox mode requires a local Docker engine.',
      failureKind: 'docker_not_installed',
    });
  }

  try {
    const result = await execFileAsync('docker', ['ps', '-q'], {
      timeout: PREFLIGHT_TIMEOUT_MS,
      env: process.env,
    });
    const combined = `${result.stdout}\n${result.stderr}`.trim();
    if (/cannot connect|is the docker daemon running|daemon unavailable/i.test(combined)) {
      throw new Error(combined);
    }

    const versionResult = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], {
      timeout: PREFLIGHT_TIMEOUT_MS,
      env: process.env,
    });
    const version = versionResult.stdout.trim();
    return checkFromResult({
      id: 'docker_daemon',
      label: 'Docker',
      ok: true,
      message: version ? `Docker ${version} — daemon running` : 'Docker daemon running',
    });
  } catch (error) {
    const detail =
      error instanceof Error
        ? `${error.message}${'stderr' in error && typeof error.stderr === 'string' ? ` — ${error.stderr.trim()}` : ''}`
        : 'Docker daemon check failed';

    const daemonDown =
      /cannot connect|is the docker daemon running|connection refused|daemon unavailable/i.test(
        detail,
      );

    return checkFromResult({
      id: 'docker_daemon',
      label: 'Docker',
      ok: false,
      message: daemonDown
        ? 'Docker is installed but the daemon is not running'
        : 'Docker daemon is not reachable',
      remediation: daemonDown
        ? 'Start Docker Desktop and wait until it reports "Engine running", then retry Sandbox mode.'
        : 'Verify Docker Desktop is installed, running, and your user can access the Docker socket.',
      failureKind: 'docker_daemon_down',
    });
  }
}

async function checkCuaSandboxPython(): Promise<SandboxPreflightCheck> {
  try {
    await execFileAsync(
      'python3',
      ['-c', 'from cua_sandbox import Sandbox'],
      { timeout: PREFLIGHT_TIMEOUT_MS, env: process.env },
    );
    return checkFromResult({
      id: 'cua_sandbox_python',
      label: 'CUA sandbox runtime',
      ok: true,
      message: 'cua_sandbox Python package available',
    });
  } catch {
    return checkFromResult({
      id: 'cua_sandbox_python',
      label: 'CUA sandbox runtime',
      ok: false,
      message: 'cua_sandbox Python package is not installed',
      remediation: 'Install the CUA sandbox SDK: pip install cua',
      failureKind: 'cua_sandbox_missing',
    });
  }
}

async function checkCuaCli(): Promise<SandboxPreflightCheck> {
  try {
    const result = await execFileAsync('cua', ['--version'], {
      timeout: PREFLIGHT_TIMEOUT_MS,
      env: process.env,
    });
    const version = result.stdout.trim() || result.stderr.trim() || 'installed';
    return checkFromResult({
      id: 'cua_cli',
      label: 'CUA CLI',
      ok: true,
      message: version,
    });
  } catch {
    return checkFromResult({
      id: 'cua_cli',
      label: 'CUA CLI',
      ok: false,
      message: 'cua CLI not found on PATH',
      remediation: 'Install the CUA CLI: curl -LsSf https://cua.ai/cli/install.sh | sh',
      failureKind: 'cua_cli_missing',
    });
  }
}

function checkCuaApiKey(): SandboxPreflightCheck {
  const key = process.env.CUA_API_KEY?.trim();
  if (key) {
    return checkFromResult({
      id: 'cua_api_key',
      label: 'CUA cloud API key',
      ok: true,
      message: 'CUA_API_KEY is set',
    });
  }
  return checkFromResult({
    id: 'cua_api_key',
    label: 'CUA cloud API key',
    ok: false,
    message: 'CUA_API_KEY is not set',
    remediation:
      'Export CUA_API_KEY from the cua.ai dashboard or use local Docker sandbox (--local).',
    failureKind: 'cua_api_key_missing',
  });
}

function summarizeFailures(checks: SandboxPreflightCheck[]): string {
  const failed = checks.filter((check) => !check.ok);
  if (failed.length === 0) {
    return 'Sandbox pre-flight passed';
  }
  const primary = failed[0];
  const remediation = primary.remediation ? ` ${primary.remediation}` : '';
  return `${primary.message}.${remediation}`;
}

/**
 * Mandatory checks before local or cloud sandbox bootstrap.
 * Fails fast with actionable remediation — never starts Docker pull when daemon is down.
 */
export async function runSandboxPreflight(input?: {
  local?: boolean;
}): Promise<SandboxPreflightResult> {
  const local = input?.local ?? true;
  const checks: SandboxPreflightCheck[] = [];

  if (local) {
    checks.push(await checkDockerDaemon());
    checks.push(await checkSandboxBootstrapScript());
    checks.push(await checkCuaSandboxPython());
    checks.push(await checkCuaCli());
  } else {
    checks.push(checkCuaApiKey());
    checks.push(await checkCuaSandboxPython());
  }

  const ok = checks.every((check) => check.ok);
  const primaryFailure = checks.find((check) => !check.ok) ?? null;

  return {
    ok,
    checks,
    summary: ok ? 'Sandbox pre-flight passed' : summarizeFailures(checks),
    primaryFailureKind: primaryFailure?.failureKind ?? null,
  };
}
