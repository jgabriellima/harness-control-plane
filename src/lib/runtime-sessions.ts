import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Run } from '@cursor/sdk';
import { parse as parseYaml } from 'yaml';

import { AsyncLocalStorage } from 'node:async_hooks';

import { resolveHarnessBinding } from './harness-binding';
import { resolveAppRoot } from './app-root';

type AgentHandle = {
  agentId: string;
  dispose: () => Promise<void>;
};

type RunEntry = {
  run: Run;
  conversationId: string | null;
  agentId: string | null;
  refCount: number;
};

const sessions = new Map<string, AgentHandle>();
const activeRuns = new Map<string, RunEntry>();

let maxConcurrentAgents = 2;
let capLoaded = false;
let activeAgentSlots = 0;

type SlotWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
};

const agentWaitQueue: SlotWaiter[] = [];

const workspaceCwdStorage = new AsyncLocalStorage<string>();

export function runWithWorkspaceCwd<T>(cwd: string, fn: () => T): T {
  return workspaceCwdStorage.run(cwd, fn);
}

export async function runWithWorkspaceCwdAsync<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  return workspaceCwdStorage.run(cwd, fn);
}

export function workspaceCwd(): string {
  return workspaceCwdStorage.getStore() ?? resolveAppRoot();
}

export async function loadConcurrencyCap(): Promise<number> {
  if (capLoaded) {
    return maxConcurrentAgents;
  }

  try {
    const binding = await resolveHarnessBinding({ workspaceRoot: workspaceCwd() });
    const raw = await readFile(binding.dslPath, 'utf8');
    const doc = parseYaml(raw) as Record<string, unknown> | null;
    const runtime = doc?.runtime;
    if (typeof runtime === 'object' && runtime !== null) {
      const cap = (runtime as Record<string, unknown>).max_concurrent_agents;
      if (typeof cap === 'number' && Number.isFinite(cap) && cap > 0) {
        maxConcurrentAgents = Math.floor(cap);
      }
    }
  } catch {
    // Keep default cap when business.yaml is unreadable.
  }

  capLoaded = true;
  return maxConcurrentAgents;
}

export function getMaxConcurrentAgents(): number {
  return maxConcurrentAgents;
}

export async function acquireAgentSlot(): Promise<void> {
  await loadConcurrencyCap();

  if (activeAgentSlots < maxConcurrentAgents) {
    activeAgentSlots += 1;
    return;
  }

  return new Promise<void>((resolve, reject) => {
    agentWaitQueue.push({
      resolve: () => {
        activeAgentSlots += 1;
        resolve();
      },
      reject,
    });
  });
}

export function releaseAgentSlot(): void {
  activeAgentSlots = Math.max(0, activeAgentSlots - 1);
  const next = agentWaitQueue.shift();
  if (next) {
    next.resolve();
  }
}

export function registerRuntimeSession(agentId: string, dispose: () => Promise<void>): void {
  sessions.set(agentId, { agentId, dispose });
}

export async function disposeRuntimeSession(agentId: string): Promise<void> {
  const session = sessions.get(agentId);
  if (!session) {
    return;
  }
  sessions.delete(agentId);
  await session.dispose();
  releaseAgentSlot();
}

export function registerRuntimeRun(
  runId: string,
  run: Run,
  conversationId?: string | null,
  agentId?: string | null,
): void {
  const existing = activeRuns.get(runId);
  if (existing) {
    existing.refCount += 1;
    if (conversationId) {
      existing.conversationId = conversationId;
    }
    if (agentId) {
      existing.agentId = agentId;
    }
    return;
  }

  activeRuns.set(runId, {
    run,
    conversationId: conversationId ?? null,
    agentId: agentId ?? null,
    refCount: 1,
  });
}

export function retainRuntimeRun(runId: string): Run | undefined {
  const entry = activeRuns.get(runId);
  if (!entry) {
    return undefined;
  }
  entry.refCount += 1;
  return entry.run;
}

export function releaseRuntimeRun(runId: string): void {
  const entry = activeRuns.get(runId);
  if (!entry) {
    return;
  }

  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    activeRuns.delete(runId);
  }
}

export function getRuntimeRunEntry(
  runId: string,
): { run: Run; conversationId: string | null; agentId: string | null } | undefined {
  const entry = activeRuns.get(runId);
  if (!entry) {
    return undefined;
  }
  return {
    run: entry.run,
    conversationId: entry.conversationId,
    agentId: entry.agentId,
  };
}

export function getActiveRunIds(): string[] {
  return [...activeRuns.keys()];
}

export function getActiveRunCount(): number {
  return activeRuns.size;
}

export async function sessionsDirForCwd(cwd: string): Promise<string> {
  const binding = await resolveHarnessBinding({ workspaceRoot: cwd });
  return join(binding.harnessRoot, 'runtime-sessions');
}
