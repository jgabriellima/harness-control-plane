import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveHarnessBinding } from './harness-binding';

export type DispatchLogEvent =
  | 'chat.request.received'
  | 'chat.request.parsed'
  | 'chat.workspace.resolved'
  | 'chat.commands.loaded'
  | 'chat.sdk.dispatch.start'
  | 'chat.sdk.dispatch.ok'
  | 'chat.sdk.dispatch.error'
  | 'chat.agent.resume_stale'
  | 'chat.fanout.started'
  | 'chat.registry.started'
  | 'chat.session.bind'
  | 'chat.response.ok'
  | 'chat.response.error'
  | 'chat.fanout.error'
  | 'chat.fanout.complete';

export interface DispatchLogRecord {
  ts: string;
  event: DispatchLogEvent;
  request_id: string;
  phase?: string;
  run_id?: string;
  agent_id?: string;
  conversation_id?: string;
  project_id?: string;
  cwd?: string;
  duration_ms?: number;
  status_code?: number;
  error_name?: string;
  error_message?: string;
  detail?: string;
}

async function dispatchLogPath(workspaceRoot?: string): Promise<string> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const sessionsDir = join(binding.harnessRoot, 'runtime-sessions');
  await mkdir(sessionsDir, { recursive: true });
  return join(sessionsDir, 'dispatch-log.jsonl');
}

export async function appendDispatchLog(
  record: Omit<DispatchLogRecord, 'ts'>,
  workspaceRoot?: string,
): Promise<void> {
  try {
    const path = await dispatchLogPath(workspaceRoot);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
    await appendFile(path, `${line}\n`, 'utf8');
  } catch {
    // Dispatch log is best-effort observability — never block chat.
  }
}

export async function readDispatchLogTail(
  limit = 50,
  workspaceRoot?: string,
): Promise<DispatchLogRecord[]> {
  try {
    const path = await dispatchLogPath(workspaceRoot);
    const raw = await readFile(path, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as DispatchLogRecord)
      .reverse();
  } catch {
    return [];
  }
}

export async function readDispatchLogForRun(
  runId: string,
  workspaceRoot?: string,
): Promise<DispatchLogRecord[]> {
  const tail = await readDispatchLogTail(500, workspaceRoot);
  return tail.filter((entry) => entry.run_id === runId).reverse();
}

export async function readRecentDispatchFailures(
  limit = 10,
  workspaceRoot?: string,
): Promise<DispatchLogRecord[]> {
  const tail = await readDispatchLogTail(200, workspaceRoot);
  return tail
    .filter(
      (entry) =>
        entry.event === 'chat.sdk.dispatch.error' ||
        entry.event === 'chat.response.error' ||
        entry.event === 'chat.fanout.error',
    )
    .slice(0, limit);
}
