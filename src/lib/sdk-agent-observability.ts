import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getDefaultSdkStateRoot } from '@cursor/sdk';

import { getCursorLocalAdapter } from './runtime-adapters/cursor-local';
import { readSdkContextUsageSnapshot } from './sdk-context-usage-reader';
import type {
  SdkAgentObservability,
  SdkGeneratedFileRecord,
  SdkRunRecord,
  SdkToolCallRecord,
} from './sdk-agent-observability-types';
import { extractFilePathsFromTool } from './tool-file-paths';

const execFileAsync = promisify(execFile);

const FILE_MUTATION_TOOLS = new Set([
  'write',
  'edit',
  'strreplace',
  'search_replace',
  'apply_patch',
  'delete',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function querySqliteRows(databasePath: string, sql: string): Promise<string[][]> {
  const { stdout } = await execFileAsync(
    'sqlite3',
    ['-separator', '\t', '-nullvalue', '', databasePath, sql],
    { maxBuffer: 32 * 1024 * 1024 },
  );

  return stdout
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t'));
}

async function readAgentRuns(stateRoot: string, agentId: string): Promise<SdkRunRecord[]> {
  const indexDbPath = `${stateRoot}/index.db`;
  const escapedAgentId = agentId.replace(/'/g, "''");
  const rows = await querySqliteRows(
    indexDbPath,
    `SELECT run_id, turn_number, status, created_at, COALESCE(finished_at, '') FROM runs WHERE agent_id='${escapedAgentId}' ORDER BY turn_number ASC, created_at ASC;`,
  );

  return rows.map((row) => ({
    runId: row[0] ?? '',
    turnNumber: Number.parseInt(row[1] ?? '0', 10) || 0,
    status: row[2] ?? 'UNKNOWN',
    createdAt: row[3] ?? '',
    finishedAt: row[4]?.trim() ? row[4] : null,
  }));
}

function isTerminalToolStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === 'completed' ||
    normalized === 'success' ||
    normalized === 'failed' ||
    normalized === 'error' ||
    normalized === 'cancelled'
  );
}

export function mergeToolCallRecord(
  existing: SdkToolCallRecord | undefined,
  incoming: SdkToolCallRecord,
): SdkToolCallRecord {
  if (!existing) {
    return {
      ...incoming,
      startedAt: incoming.startedAt ?? incoming.recordedAt,
    };
  }

  const startedAt = existing.startedAt ?? existing.recordedAt;
  let durationMs = existing.durationMs;

  if (isTerminalToolStatus(incoming.status)) {
    const startMs = Date.parse(startedAt);
    const endMs = Date.parse(incoming.recordedAt);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      durationMs = endMs - startMs;
    }
  }

  return {
    callId: incoming.callId,
    runId: incoming.runId,
    turnNumber: incoming.turnNumber,
    tool: incoming.tool,
    status: incoming.status,
    startedAt,
    recordedAt: incoming.recordedAt,
    durationMs,
    args: incoming.args !== undefined ? incoming.args : existing.args,
    result: incoming.result !== undefined ? incoming.result : existing.result,
  };
}

function parseRunStreamToolCall(
  payloadJson: string,
  createdAt: string,
  runId: string,
  turnNumber: number,
): SdkToolCallRecord | null {
  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const message = payload.message;
  if (!isRecord(message) || message.type !== 'tool_call') {
    return null;
  }

  const callId = typeof message.call_id === 'string' ? message.call_id.trim() : '';
  const tool = typeof message.name === 'string' ? message.name.trim() : 'tool';
  const status = typeof message.status === 'string' ? message.status.trim() : 'running';

  if (!callId) {
    return null;
  }

  return {
    callId,
    runId,
    turnNumber,
    tool,
    status,
    args: message.args,
    result: message.result,
    startedAt: createdAt || new Date().toISOString(),
    recordedAt: createdAt || new Date().toISOString(),
  };
}

async function readToolCallsFromRunEvents(
  stateRoot: string,
  agentId: string,
  runs: SdkRunRecord[],
): Promise<SdkToolCallRecord[]> {
  if (runs.length === 0) {
    return [];
  }

  const indexDbPath = `${stateRoot}/index.db`;
  const runTurnById = new Map(runs.map((run) => [run.runId, run.turnNumber]));
  const escapedRunIds = runs
    .map((run) => `'${run.runId.replace(/'/g, "''")}'`)
    .join(',');

  const rows = await querySqliteRows(
    indexDbPath,
    `SELECT run_id, seq, payload_json, created_at FROM run_events WHERE run_id IN (${escapedRunIds}) AND event_type='run_stream_event' ORDER BY seq ASC;`,
  );

  const byCallId = new Map<string, SdkToolCallRecord>();

  for (const row of rows) {
    const runId = row[0] ?? '';
    const payloadJson = row[2] ?? '';
    const createdAt = row[3] ?? '';
    const turnNumber = runTurnById.get(runId) ?? 0;
    const parsed = parseRunStreamToolCall(payloadJson, createdAt, runId, turnNumber);
    if (!parsed) {
      continue;
    }
    byCallId.set(parsed.callId, mergeToolCallRecord(byCallId.get(parsed.callId), parsed));
  }

  return [...byCallId.values()].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}

async function readToolCallsFromTranscript(
  workspaceRoot: string,
  agentId: string,
): Promise<SdkToolCallRecord[]> {
  const adapter = getCursorLocalAdapter();
  const cwd = workspaceRoot;
  const refs = await adapter.resolveSessionRefs(agentId, cwd);
  const transcript = await adapter.getTranscript(agentId, refs);

  const records: SdkToolCallRecord[] = [];

  for (const message of transcript.messages) {
    if (message.role !== 'tool' || !message.toolName) {
      continue;
    }

    const callId = message.toolUseId ?? message.id;
    records.push({
      callId,
      runId: 'transcript',
      turnNumber: 0,
      tool: message.toolName,
      status: message.toolStatus ?? 'completed',
      args: message.toolArgs,
      result: message.toolResult,
      startedAt: message.recordedAt ?? new Date().toISOString(),
      recordedAt: message.recordedAt ?? new Date().toISOString(),
    });
  }

  return records.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}

function normalizedToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

export function collectGeneratedFilesFromToolCalls(
  toolCalls: SdkToolCallRecord[],
): SdkGeneratedFileRecord[] {
  const files: SdkGeneratedFileRecord[] = [];
  const seen = new Set<string>();

  for (const call of toolCalls) {
    const normalized = normalizedToolName(call.tool);
    const mutation = FILE_MUTATION_TOOLS.has(normalized);
    const paths = extractFilePathsFromTool(call.tool, call.args, call.result);

    for (const path of paths) {
      const key = `${path}:${call.callId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      files.push({
        path,
        tool: call.tool,
        callId: call.callId,
        runId: call.runId,
        recordedAt: call.recordedAt,
        mutation,
      });
    }
  }

  return files.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}

export async function readSdkAgentObservability(input: {
  workspaceRoot: string;
  agentId: string;
}): Promise<SdkAgentObservability | null> {
  const agentId = input.agentId.trim();
  const workspaceRoot = input.workspaceRoot.trim();

  if (!agentId || !workspaceRoot) {
    return null;
  }

  const stateRoot = getDefaultSdkStateRoot(workspaceRoot);
  const [runs, contextUsage] = await Promise.all([
    readAgentRuns(stateRoot, agentId),
    readSdkContextUsageSnapshot({ workspaceCwd: workspaceRoot, agentId }),
  ]);

  let toolCalls = await readToolCallsFromRunEvents(stateRoot, agentId, runs);
  if (toolCalls.length === 0) {
    try {
      toolCalls = await readToolCallsFromTranscript(workspaceRoot, agentId);
    } catch {
      toolCalls = [];
    }
  }

  const generatedFiles = collectGeneratedFilesFromToolCalls(toolCalls);

  return {
    source: 'sdk_agent_store',
    agentId,
    updatedAt: new Date().toISOString(),
    runs,
    toolCalls,
    generatedFiles,
    contextUsage,
  };
}
