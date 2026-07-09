import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { resolveHarnessBinding } from './harness-binding';
import { resolveControlPlaneInstallRoot } from './repo-root';
import { runSandboxPreflight } from './runtime-computer-use-sandbox-preflight';
import type { SandboxPreflightCheck } from './runtime-computer-use-sandbox-preflight';

const execFileAsync = promisify(execFile);

export const DEFAULT_SANDBOX_IMAGE = 'default';

export type SandboxLoadPhase =
  | 'idle'
  | 'preflight'
  | 'provisioning'
  | 'starting'
  | 'vnc_connecting'
  | 'ready'
  | 'error';

export interface ComputerUseSandboxManifest {
  conversationId: string;
  sandboxName: string;
  proposedName: string | null;
  phase: SandboxLoadPhase;
  vncUrl: string | null;
  message: string | null;
  error: string | null;
  preflightChecks: import('./runtime-computer-use-sandbox-preflight').SandboxPreflightCheck[] | null;
  apiPort: number | null;
  vncPort: number | null;
  updatedAt: string;
}

const MANIFEST_FILENAME = 'computer-use-sandbox.json';

function harnessScriptsDir(): string {
  return join(resolveControlPlaneInstallRoot(), 'scripts');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function sandboxNameForConversation(conversationId: string): string {
  const slug = conversationId.replace(/[^a-zA-Z0-9-]/g, '').slice(-24) || 'default';
  return `jambu-cua-${slug.toLowerCase()}`;
}

export function buildSandboxOpenUrlRecipe(sandboxName: string, harnessRoot: string): string {
  return `python3 ${harnessRoot}/scripts/cua_sandbox_action.py open-url --sandbox ${sandboxName} --url <url>`;
}

async function manifestPath(workspaceRoot?: string): Promise<string> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const dir = join(binding.harnessRoot, 'runtime-sessions');
  await mkdir(dir, { recursive: true });
  return join(dir, MANIFEST_FILENAME);
}

function parseManifestActive(active: Record<string, unknown>): ComputerUseSandboxManifest {
  const phase = active.phase;
  const validPhases: SandboxLoadPhase[] = [
    'idle',
    'preflight',
    'provisioning',
    'starting',
    'vnc_connecting',
    'ready',
    'error',
  ];
  return {
    conversationId: typeof active.conversationId === 'string' ? active.conversationId : 'default',
    sandboxName: typeof active.sandboxName === 'string' ? active.sandboxName : 'jambu-cua-default',
    proposedName: typeof active.proposedName === 'string' ? active.proposedName : null,
    phase: validPhases.includes(phase as SandboxLoadPhase) ? (phase as SandboxLoadPhase) : 'idle',
    vncUrl: typeof active.vncUrl === 'string' ? active.vncUrl : null,
    message: typeof active.message === 'string' ? active.message : null,
    error: typeof active.error === 'string' ? active.error : null,
    preflightChecks: Array.isArray(active.preflightChecks)
      ? (active.preflightChecks as SandboxPreflightCheck[])
      : null,
    apiPort: typeof active.apiPort === 'number' ? active.apiPort : null,
    vncPort: typeof active.vncPort === 'number' ? active.vncPort : null,
    updatedAt: typeof active.updatedAt === 'string' ? active.updatedAt : new Date().toISOString(),
  };
}

export async function readSandboxManifest(
  conversationId: string,
  workspaceRoot?: string,
): Promise<ComputerUseSandboxManifest | null> {
  try {
    const raw = await readFile(await manifestPath(workspaceRoot), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.active)) {
      return null;
    }
    const active = parsed.active;
    if (active.conversationId !== conversationId) {
      return null;
    }
    return parseManifestActive(active);
  } catch {
    return null;
  }
}

export async function readActiveSandboxManifest(
  workspaceRoot?: string,
): Promise<ComputerUseSandboxManifest | null> {
  try {
    const raw = await readFile(await manifestPath(workspaceRoot), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.active)) {
      return null;
    }
    return parseManifestActive(parsed.active);
  } catch {
    return null;
  }
}

export async function writeSandboxManifest(
  manifest: ComputerUseSandboxManifest,
  workspaceRoot?: string,
): Promise<void> {
  const path = await manifestPath(workspaceRoot);
  await writeFile(
    path,
    `${JSON.stringify({ active: manifest, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

interface PythonLinePayload {
  phase?: SandboxLoadPhase;
  message?: string;
  status?: string;
  vnc_url?: string;
  error?: string;
  sandbox_name?: string;
  proposed_name?: string;
  api_port?: number;
  vnc_port?: number;
}

async function runPythonSandboxScript(
  args: string[],
): Promise<{ lines: PythonLinePayload[]; exitCode: number; stderr: string }> {
  const script = join(harnessScriptsDir(), 'cua_sandbox_vnc.py');
  const result = await execFileAsync('python3', [script, ...args], {
    maxBuffer: 4 * 1024 * 1024,
    timeout: 240_000,
    env: process.env,
  });

  const lines: PythonLinePayload[] = [];
  for (const line of result.stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) {
      continue;
    }
    try {
      lines.push(JSON.parse(trimmed) as PythonLinePayload);
    } catch {
      // ignore non-json stdout (telemetry should be on stderr)
    }
  }

  return { lines, exitCode: 0, stderr: result.stderr };
}

export async function runSandboxActionScript(
  args: string[],
): Promise<{ result: Record<string, unknown> | null; exitCode: number; stderr: string }> {
  const script = join(harnessScriptsDir(), 'cua_sandbox_action.py');

  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    const out = await execFileAsync('python3', [script, ...args], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
      env: process.env,
    });
    stdout = out.stdout;
    stderr = out.stderr;
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
    exitCode = err.code ?? 1;
  }

  let result: Record<string, unknown> | null = null;
  for (const line of stdout.split('\n').reverse()) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{')) {
      try {
        result = JSON.parse(trimmed) as Record<string, unknown>;
        break;
      } catch {
        // keep searching backward through output
      }
    }
  }

  return { result, exitCode, stderr };
}

const bootstrapInFlight = new Map<string, Promise<ComputerUseSandboxManifest>>();

export function resetSandboxBootstrapState(conversationId: string): void {
  bootstrapInFlight.delete(conversationId.trim() || 'default');
}

export async function clearSandboxManifest(
  conversationId: string,
  workspaceRoot?: string,
): Promise<void> {
  const path = await manifestPath(workspaceRoot);
  await writeFile(
    path,
    `${JSON.stringify({ active: null, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

export async function ensureSandboxVncStream(input: {
  conversationId: string;
  workspaceRoot?: string;
  image?: string;
  local?: boolean;
}): Promise<ComputerUseSandboxManifest> {
  const conversationId = input.conversationId.trim() || 'default';
  const existing = bootstrapInFlight.get(conversationId);
  if (existing) {
    return existing;
  }

  const task = bootstrapSandboxVncInternal(input);
  bootstrapInFlight.set(conversationId, task);
  try {
    return await task;
  } finally {
    bootstrapInFlight.delete(conversationId);
  }
}

async function bootstrapSandboxVncInternal(input: {
  conversationId: string;
  workspaceRoot?: string;
  image?: string;
  local?: boolean;
}): Promise<ComputerUseSandboxManifest> {
  const conversationId = input.conversationId.trim() || 'default';
  // proposedName is what we pass to Python; actual sandboxName comes back via sandbox_name on each emit
  const proposedName = sandboxNameForConversation(conversationId);
  const image = input.image ?? DEFAULT_SANDBOX_IMAGE;
  const local = input.local ?? true;

  let manifest: ComputerUseSandboxManifest = {
    conversationId,
    sandboxName: proposedName,
    proposedName,
    phase: 'preflight',
    vncUrl: null,
    message: 'Running sandbox pre-flight checks',
    error: null,
    preflightChecks: null,
    apiPort: null,
    vncPort: null,
    updatedAt: new Date().toISOString(),
  };
  await writeSandboxManifest(manifest, input.workspaceRoot);

  const preflight = await runSandboxPreflight({ local });
  if (!preflight.ok) {
    const errorMessage = preflight.summary ?? 'Sandbox pre-flight failed';
    manifest = {
      ...manifest,
      phase: 'error',
      error: errorMessage,
      message: errorMessage,
      preflightChecks: preflight.checks,
      updatedAt: new Date().toISOString(),
    };
    await writeSandboxManifest(manifest, input.workspaceRoot);
    return manifest;
  }

  manifest = {
    ...manifest,
    phase: 'provisioning',
    message: 'Preparing CUA Sandbox',
    updatedAt: new Date().toISOString(),
  };
  await writeSandboxManifest(manifest, input.workspaceRoot);

  try {
    const { lines } = await runPythonSandboxScript([
      'bootstrap',
      proposedName,
      '--image',
      image,
      ...(local ? ['--local'] : []),
      '--max-wait',
      '180',
    ]);

    for (const line of lines) {
      if (line.phase) {
        // Persist the Python-emitted sandbox_name as the canonical sandboxName on every phase transition
        const canonicalName =
          typeof line.sandbox_name === 'string' ? line.sandbox_name : manifest.sandboxName;
        manifest = {
          ...manifest,
          phase: line.phase,
          sandboxName: canonicalName,
          message: line.message ?? manifest.message,
          updatedAt: new Date().toISOString(),
        };
        await writeSandboxManifest(manifest, input.workspaceRoot);
      }
    }

    const final = lines.at(-1);
    if (final?.status === 'ready' && typeof final.vnc_url === 'string') {
      const canonicalName =
        typeof final.sandbox_name === 'string' ? final.sandbox_name : manifest.sandboxName;
      manifest = {
        ...manifest,
        phase: 'ready',
        sandboxName: canonicalName,
        proposedName,
        apiPort: typeof final.api_port === 'number' ? final.api_port : null,
        vncPort: typeof final.vnc_port === 'number' ? final.vnc_port : null,
        vncUrl: final.vnc_url,
        message: 'VNC stream ready',
        error: null,
        updatedAt: new Date().toISOString(),
      };
      await writeSandboxManifest(manifest, input.workspaceRoot);
      return manifest;
    }

    const errorMessage =
      final?.error ?? final?.message ?? 'Failed to obtain sandbox VNC URL';
    manifest = {
      ...manifest,
      phase: 'error',
      error: errorMessage,
      message: errorMessage,
      updatedAt: new Date().toISOString(),
    };
    await writeSandboxManifest(manifest, input.workspaceRoot);
    return manifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sandbox bootstrap failed';
    manifest = {
      ...manifest,
      phase: 'error',
      error: message,
      message,
      updatedAt: new Date().toISOString(),
    };
    await writeSandboxManifest(manifest, input.workspaceRoot);
    return manifest;
  }
}
