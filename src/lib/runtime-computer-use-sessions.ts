import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveHarnessBinding } from './harness-binding';
import type { ComputerUseTargetMode } from './runtime-computer-use-types';
import { parseComputerUseTargetMode } from './runtime-computer-use-types';

const SESSIONS_REL = 'state/computer-use-sessions.json';

export interface ComputerUseSessionRecord {
  enabled: boolean;
  mode: ComputerUseTargetMode | null;
  updatedAt: string;
}

type SessionsFile = Record<string, ComputerUseSessionRecord>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function sessionsPath(workspaceRoot?: string): Promise<string> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const stateDir = join(binding.harnessRoot, 'state');
  await mkdir(stateDir, { recursive: true });
  return join(stateDir, 'computer-use-sessions.json');
}

async function readSessionsFile(workspaceRoot?: string): Promise<SessionsFile> {
  const path = await sessionsPath(workspaceRoot);

  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }

    const sessions: SessionsFile = {};
    for (const [conversationId, value] of Object.entries(parsed)) {
      if (!isRecord(value) || typeof value.enabled !== 'boolean') {
        continue;
      }
      const mode = parseComputerUseTargetMode(value.mode);
      sessions[conversationId] = {
        enabled: value.enabled,
        mode: value.enabled ? (mode ?? 'host') : null,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
      };
    }
    return sessions;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function writeSessionsFile(sessions: SessionsFile, workspaceRoot?: string): Promise<void> {
  const path = await sessionsPath(workspaceRoot);
  await writeFile(path, `${JSON.stringify(sessions, null, 2)}\n`, 'utf8');
}

export async function loadComputerUseSession(
  conversationId: string,
  workspaceRoot?: string,
): Promise<ComputerUseSessionRecord> {
  const sessions = await readSessionsFile(workspaceRoot);
  return (
    sessions[conversationId] ?? {
      enabled: false,
      mode: null,
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function saveComputerUseSession(
  conversationId: string,
  enabled: boolean,
  workspaceRoot?: string,
  mode: ComputerUseTargetMode | null = enabled ? 'host' : null,
): Promise<ComputerUseSessionRecord> {
  const sessions = await readSessionsFile(workspaceRoot);
  const record: ComputerUseSessionRecord = {
    enabled,
    mode: enabled ? (mode ?? 'host') : null,
    updatedAt: new Date().toISOString(),
  };
  sessions[conversationId] = record;
  await writeSessionsFile(sessions, workspaceRoot);
  return record;
}

export async function isComputerUseEnabledForConversation(
  conversationId: string | undefined,
  workspaceRoot?: string,
): Promise<boolean> {
  if (!conversationId?.trim()) {
    return false;
  }
  const session = await loadComputerUseSession(conversationId.trim(), workspaceRoot);
  return session.enabled;
}
