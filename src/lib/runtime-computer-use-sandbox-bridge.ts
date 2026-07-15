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
  projectId: string;
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

/** Project runtime state lives under workspaces/{projectId}/ only — never app/.business/. */
export function requireProjectWorkspaceRoot(workspaceRoot?: string): string {
  const trimmed = workspaceRoot?.trim();
  if (!trimmed) {
    throw new Error(
      'workspaceRoot is required — project harness and runtime-sessions live under workspaces/{projectId}/',
    );
  }
  return trimmed;
}

function harnessScriptsDir(): string {
  return join(resolveControlPlaneInstallRoot(), 'scripts');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeProjectId(projectId: string | undefined | null): string {
  const trimmed = projectId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'default';
}

/** One canonical sandbox name per project — shared by every chat in that project. */
export function sandboxNameForProject(projectId: string): string {
  const slug =
    normalizeProjectId(projectId)
      .replace(/[^a-zA-Z0-9-]/g, '')
      .slice(-24)
      .toLowerCase() || 'default';
  return `jambu-cua-proj-${slug}`;
}

/** @deprecated Use sandboxNameForProject — conversation scope caused duplicate sandboxes. */
export function sandboxNameForConversation(conversationId: string): string {
  return sandboxNameForProject(conversationId);
}

export function buildSandboxOpenUrlRecipe(sandboxName: string, harnessRoot: string): string {
  return `python3 ${harnessRoot}/scripts/cua_sandbox_action.py open-url --sandbox ${sandboxName} --url <url>`;
}

async function manifestPath(workspaceRoot: string): Promise<string> {
  const root = requireProjectWorkspaceRoot(workspaceRoot);
  const binding = await resolveHarnessBinding({ workspaceRoot: root });
  const dir = join(binding.harnessRoot, 'runtime-sessions');
  await mkdir(dir, { recursive: true });
  return join(dir, MANIFEST_FILENAME);
}

function manifestMatchesProject(active: Record<string, unknown>, projectId: string): boolean {
  const normalized = normalizeProjectId(projectId);
  const manifestProject =
    typeof active.projectId === 'string'
      ? normalizeProjectId(active.projectId)
      : 'default';
  return manifestProject === normalized;
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
    projectId:
      typeof active.projectId === 'string'
        ? normalizeProjectId(active.projectId)
        : 'default',
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
  projectId: string,
  workspaceRoot: string,
): Promise<ComputerUseSandboxManifest | null> {
  try {
    const raw = await readFile(await manifestPath(workspaceRoot), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.active)) {
      return null;
    }
    const active = parsed.active;
    if (!manifestMatchesProject(active, projectId)) {
      return null;
    }
    return parseManifestActive(active);
  } catch {
    return null;
  }
}

export async function readActiveSandboxManifest(
  workspaceRoot: string,
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

/**
 * Resolve sandbox manifest from the active project workspace (sole source of truth).
 */
export async function resolveSandboxManifestForProject(
  projectId: string,
  workspaceRoot: string,
): Promise<ComputerUseSandboxManifest | null> {
  const normalizedProjectId = normalizeProjectId(projectId);
  const root = requireProjectWorkspaceRoot(workspaceRoot);

  const manifest = await readSandboxManifest(normalizedProjectId, root);
  if (manifest?.phase === 'ready' && manifest.sandboxName) {
    return manifest;
  }

  const active = await readActiveSandboxManifest(root);
  if (active?.phase === 'ready' && active.sandboxName) {
    const synced = { ...active, projectId: normalizedProjectId };
    await writeSandboxManifest(synced, root);
    return synced;
  }

  return manifest ?? active ?? null;
}

async function collectSandboxNameCandidates(
  projectId: string,
  workspaceRoot: string,
): Promise<string[]> {
  const names = new Set<string>();
  names.add(sandboxNameForProject(projectId));

  const projectManifest = await resolveSandboxManifestForProject(projectId, workspaceRoot);
  if (projectManifest?.sandboxName) {
    names.add(projectManifest.sandboxName);
  }
  if (projectManifest?.proposedName) {
    names.add(projectManifest.proposedName);
  }

  return [...names];
}

export async function writeSandboxManifest(
  manifest: ComputerUseSandboxManifest,
  workspaceRoot: string,
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
      // ignore non-json stdout
    }
  }

  return { lines, exitCode: 0, stderr: result.stderr };
}

export interface SandboxActionInput {
  action: 'open-url' | 'screenshot' | 'shell';
  sandboxName: string;
  url?: string;
  command?: string;
  timeout?: number;
  workspaceRoot?: string;
  local?: boolean;
}

export async function runSandboxActionScript(
  input: SandboxActionInput,
): Promise<Record<string, unknown>> {
  const script = join(harnessScriptsDir(), 'cua_sandbox_action.py');
  const args: string[] = [input.action, '--sandbox', input.sandboxName];

  if (input.action === 'open-url' && input.url) {
    args.push('--url', input.url);
  }
  if (input.action === 'shell' && input.command) {
    args.push('--command', input.command);
    if (input.timeout !== undefined) {
      args.push('--timeout', String(input.timeout));
    }
  }
  if (!(input.local ?? true)) {
    args.push('--remote');
  }

  let stdout = '';
  let stderr = '';

  try {
    const out = await execFileAsync('python3', [script, ...args], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
      env: process.env,
      cwd: input.workspaceRoot,
    });
    stdout = out.stdout;
    stderr = out.stderr;
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
  }

  for (const line of stdout.split('\n').reverse()) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        // keep searching
      }
    }
  }

  return {
    status: 'error',
    sandbox: input.sandboxName,
    error: stderr.trim() || 'Sandbox action produced no JSON output',
    stdout,
  };
}

const bootstrapInFlight = new Map<string, Promise<ComputerUseSandboxManifest>>();

export function resetSandboxBootstrapState(projectId: string): void {
  bootstrapInFlight.delete(normalizeProjectId(projectId));
}

export async function clearSandboxManifest(
  projectId: string,
  workspaceRoot: string,
): Promise<void> {
  const existing = await readSandboxManifest(projectId, workspaceRoot);
  if (!existing) {
    return;
  }
  const path = await manifestPath(workspaceRoot);
  await writeFile(
    path,
    `${JSON.stringify({ active: null, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

async function tryAttachExistingSandbox(input: {
  projectId: string;
  conversationId: string;
  workspaceRoot: string;
  local?: boolean;
}): Promise<ComputerUseSandboxManifest | null> {
  const projectId = normalizeProjectId(input.projectId);
  const workspaceRoot = requireProjectWorkspaceRoot(input.workspaceRoot);
  const candidates = await collectSandboxNameCandidates(projectId, workspaceRoot);

  for (const candidateName of candidates) {
    try {
      const { lines } = await runPythonSandboxScript([
        'resolve',
        candidateName,
        ...(input.local ?? true ? ['--local'] : []),
      ]);
      const final = lines.at(-1);
      if (final?.status !== 'ready' || typeof final.vnc_url !== 'string') {
        continue;
      }

      const canonicalName =
        typeof final.sandbox_name === 'string' ? final.sandbox_name : candidateName;

      const manifest: ComputerUseSandboxManifest = {
        projectId,
        conversationId: input.conversationId,
        sandboxName: canonicalName,
        proposedName: sandboxNameForProject(projectId),
        phase: 'ready',
        vncUrl: final.vnc_url,
        message: 'Reattached to existing project sandbox',
        error: null,
        preflightChecks: null,
        apiPort: typeof final.api_port === 'number' ? final.api_port : null,
        vncPort: typeof final.vnc_port === 'number' ? final.vnc_port : null,
        updatedAt: new Date().toISOString(),
      };
      await writeSandboxManifest(manifest, workspaceRoot);
      return manifest;
    } catch {
      // try next candidate
    }
  }

  return null;
}

export async function ensureSandboxVncStream(input: {
  projectId: string;
  conversationId: string;
  workspaceRoot: string;
  image?: string;
  local?: boolean;
}): Promise<ComputerUseSandboxManifest> {
  const projectId = normalizeProjectId(input.projectId);
  const workspaceRoot = requireProjectWorkspaceRoot(input.workspaceRoot);
  const conversationId = input.conversationId.trim() || 'default';
  const existing = bootstrapInFlight.get(projectId);
  if (existing) {
    return existing;
  }

  const task = bootstrapSandboxVncInternal({ ...input, projectId, conversationId, workspaceRoot });
  bootstrapInFlight.set(projectId, task);
  try {
    return await task;
  } finally {
    bootstrapInFlight.delete(projectId);
  }
}

async function bootstrapSandboxVncInternal(input: {
  projectId: string;
  conversationId: string;
  workspaceRoot: string;
  image?: string;
  local?: boolean;
}): Promise<ComputerUseSandboxManifest> {
  const projectId = normalizeProjectId(input.projectId);
  const workspaceRoot = requireProjectWorkspaceRoot(input.workspaceRoot);
  const conversationId = input.conversationId.trim() || 'default';
  const proposedName = sandboxNameForProject(projectId);
  const image = input.image ?? DEFAULT_SANDBOX_IMAGE;
  const local = input.local ?? true;

  const attached = await tryAttachExistingSandbox({
    projectId,
    conversationId,
    workspaceRoot,
    local,
  });
  if (attached) {
    return attached;
  }

  let manifest: ComputerUseSandboxManifest = {
    projectId,
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
  await writeSandboxManifest(manifest, workspaceRoot);

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
    await writeSandboxManifest(manifest, workspaceRoot);
    return manifest;
  }

  manifest = {
    ...manifest,
    phase: 'provisioning',
    message: 'Preparing CUA Sandbox',
    updatedAt: new Date().toISOString(),
  };
  await writeSandboxManifest(manifest, workspaceRoot);

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
        const canonicalName =
          typeof line.sandbox_name === 'string' ? line.sandbox_name : manifest.sandboxName;
        manifest = {
          ...manifest,
          conversationId,
          phase: line.phase,
          sandboxName: canonicalName,
          message: line.message ?? manifest.message,
          updatedAt: new Date().toISOString(),
        };
        await writeSandboxManifest(manifest, workspaceRoot);
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
      await writeSandboxManifest(manifest, workspaceRoot);
      return manifest;
    }

    const errorMessage = final?.error ?? final?.message ?? 'Failed to obtain sandbox VNC URL';
    manifest = {
      ...manifest,
      phase: 'error',
      error: errorMessage,
      message: errorMessage,
      updatedAt: new Date().toISOString(),
    };
    await writeSandboxManifest(manifest, workspaceRoot);
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
    await writeSandboxManifest(manifest, workspaceRoot);
    return manifest;
  }
}
