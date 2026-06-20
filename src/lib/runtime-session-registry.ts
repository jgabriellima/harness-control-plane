import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { resolveHarnessBinding } from './harness-binding';
import { resolveAppRoot } from './app-root';
import type { SessionBoundEvent, SessionRegistryIndex } from './runtime-adapters/types';

const execFileAsync = promisify(execFile);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableBindError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const text = `${error.message}\n${'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''}`;
  return (
    text.includes('no transcript project') ||
    text.includes('transcript missing') ||
    text.includes('sdk-agent-store missing')
  );
}

async function sessionPaths(workspaceRoot: string) {
  const binding = await resolveHarnessBinding({ workspaceRoot });
  const sessionsDir = join(binding.harnessRoot, 'runtime-sessions');
  return {
    harnessRoot: binding.harnessRoot,
    workspaceRoot: binding.workspaceRoot,
    sessionsDir,
    registryPath: join(sessionsDir, 'registry.jsonl'),
    indexPath: join(sessionsDir, 'index.json'),
    registryScript: join(binding.harnessRoot, 'bin', `${binding.cliPrefix}_session_registry.py`),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function readSessionIndex(workspaceRoot?: string): Promise<SessionRegistryIndex> {
  const paths = await sessionPaths(workspaceRoot ?? resolveAppRoot());

  try {
    const raw = await readFile(paths.indexPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.conversations)) {
      return { version: 1, updatedAt: new Date().toISOString(), conversations: [] };
    }

    const conversations = parsed.conversations
      .filter(isRecord)
      .map((entry) => ({
        id: typeof entry.id === 'string' ? entry.id : '',
        title: typeof entry.title === 'string' ? entry.title : 'Runtime chat',
        projectId: typeof entry.projectId === 'string' ? entry.projectId : 'default',
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
        agentId: typeof entry.agentId === 'string' ? entry.agentId : undefined,
        archived: entry.archived === true,
      }))
      .filter((entry) => entry.id.length > 0);

    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      conversations,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, updatedAt: new Date().toISOString(), conversations: [] };
    }
    throw error;
  }
}

export async function readLatestBindings(
  workspaceRoot?: string,
): Promise<Map<string, SessionBoundEvent>> {
  const paths = await sessionPaths(workspaceRoot ?? resolveAppRoot());

  let raw: string;
  try {
    raw = await readFile(paths.registryPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Map();
    }
    throw error;
  }

  const latest = new Map<string, SessionBoundEvent>();
  for (const line of raw.split('\n')) {
    const stripped = line.trim();
    if (stripped.length === 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped) as unknown;
    } catch {
      continue;
    }

    if (!isRecord(parsed) || parsed.event !== 'session.bound') {
      continue;
    }

    const harnessConversationId =
      typeof parsed.harnessConversationId === 'string' ? parsed.harnessConversationId : '';
    if (harnessConversationId.length === 0) {
      continue;
    }

    latest.set(harnessConversationId, parsed as SessionBoundEvent);
  }

  return latest;
}

export async function bindSession(input: {
  harnessConversationId: string;
  vendorAgentId: string;
  vendor?: string;
  workspaceRoot?: string;
}): Promise<SessionBoundEvent> {
  const paths = await sessionPaths(input.workspaceRoot ?? resolveAppRoot());
  const maxAttempts = 6;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        'python3',
        [
          paths.registryScript,
          'bind',
          '--conversation-id',
          input.harnessConversationId,
          '--agent-id',
          input.vendorAgentId,
          '--vendor',
          input.vendor ?? 'cursor-local',
        ],
        { cwd: paths.workspaceRoot, maxBuffer: 1024 * 1024 },
      );

      return JSON.parse(stdout.trim()) as SessionBoundEvent;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isRetryableBindError(error) || attempt === maxAttempts - 1) {
        throw lastError;
      }
      await sleep(250 * 2 ** attempt);
    }
  }

  throw lastError ?? new Error('session bind failed');
}

export async function rebuildSessionIndex(workspaceRoot?: string): Promise<SessionRegistryIndex> {
  const paths = await sessionPaths(workspaceRoot ?? resolveAppRoot());

  await execFileAsync('python3', [paths.registryScript, 'rebuild-index'], {
    cwd: paths.workspaceRoot,
    maxBuffer: 1024 * 1024,
  });
  return readSessionIndex(workspaceRoot);
}
