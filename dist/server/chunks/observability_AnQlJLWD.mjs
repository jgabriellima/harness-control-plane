import { r as readSdkContextUsageSnapshot, c as collectInstructionCorpus, e as estimateRuntimeOverhead, h as handleApiError } from './sdk-context-usage-reader_foPKFTT8.mjs';
import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDefaultSdkStateRoot } from '@cursor/sdk';
import { g as getCursorLocalAdapter } from './cursor-local_DFAlIUYa.mjs';
import { r as runtimeLogger, e as errorFields } from './runtime-run-failure_BzuNxIfC.mjs';
import { e as extractFilePathsFromTool } from './tool-file-paths_By2mFIiA.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const execFileAsync = promisify(execFile);
const FILE_MUTATION_TOOLS = /* @__PURE__ */ new Set([
  "write",
  "edit",
  "strreplace",
  "search_replace",
  "apply_patch",
  "delete"
]);
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
async function querySqliteRows(databasePath, sql) {
  const { stdout } = await execFileAsync(
    "sqlite3",
    ["-separator", "	", "-nullvalue", "", databasePath, sql],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  return stdout.trim().split("\n").filter((line) => line.length > 0).map((line) => line.split("	"));
}
async function readAgentRuns(stateRoot, agentId) {
  try {
    const indexDbPath = `${stateRoot}/index.db`;
    const escapedAgentId = agentId.replace(/'/g, "''");
    const rows = await querySqliteRows(
      indexDbPath,
      `SELECT run_id, turn_number, status, created_at, COALESCE(finished_at, '') FROM runs WHERE agent_id='${escapedAgentId}' ORDER BY turn_number ASC, created_at ASC;`
    );
    return rows.map((row) => ({
      runId: row[0] ?? "",
      turnNumber: Number.parseInt(row[1] ?? "0", 10) || 0,
      status: row[2] ?? "UNKNOWN",
      createdAt: row[3] ?? "",
      finishedAt: row[4]?.trim() ? row[4] : null
    }));
  } catch (error) {
    runtimeLogger.warn("sdk_agent_observability.read_agent_runs_failed", {
      agent_id: agentId,
      ...errorFields(error)
    });
    return [];
  }
}
function isTerminalToolStatus(status) {
  const normalized = status.trim().toLowerCase();
  return normalized === "completed" || normalized === "success" || normalized === "failed" || normalized === "error" || normalized === "cancelled";
}
function mergeToolCallRecord(existing, incoming) {
  if (!existing) {
    return {
      ...incoming,
      startedAt: incoming.startedAt ?? incoming.recordedAt
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
    args: incoming.args !== void 0 ? incoming.args : existing.args,
    result: incoming.result !== void 0 ? incoming.result : existing.result
  };
}
function parseRunStreamToolCall(payloadJson, createdAt, runId, turnNumber) {
  let payload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (!isRecord(payload)) {
    return null;
  }
  const message = payload.message;
  if (!isRecord(message) || message.type !== "tool_call") {
    return null;
  }
  const callId = typeof message.call_id === "string" ? message.call_id.trim() : "";
  const tool = typeof message.name === "string" ? message.name.trim() : "tool";
  const status = typeof message.status === "string" ? message.status.trim() : "running";
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
    startedAt: createdAt || (/* @__PURE__ */ new Date()).toISOString(),
    recordedAt: createdAt || (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function readToolCallsFromRunEvents(stateRoot, agentId, runs) {
  if (runs.length === 0) {
    return [];
  }
  const indexDbPath = `${stateRoot}/index.db`;
  const runTurnById = new Map(runs.map((run) => [run.runId, run.turnNumber]));
  const escapedRunIds = runs.map((run) => `'${run.runId.replace(/'/g, "''")}'`).join(",");
  let rows;
  try {
    rows = await querySqliteRows(
      indexDbPath,
      `SELECT run_id, seq, payload_json, created_at FROM run_events WHERE run_id IN (${escapedRunIds}) AND event_type='run_stream_event' ORDER BY seq ASC;`
    );
  } catch (error) {
    runtimeLogger.warn("sdk_agent_observability.read_tool_calls_failed", {
      agent_id: agentId,
      ...errorFields(error)
    });
    return [];
  }
  const byCallId = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const runId = row[0] ?? "";
    const payloadJson = row[2] ?? "";
    const createdAt = row[3] ?? "";
    const turnNumber = runTurnById.get(runId) ?? 0;
    const parsed = parseRunStreamToolCall(payloadJson, createdAt, runId, turnNumber);
    if (!parsed) {
      continue;
    }
    byCallId.set(parsed.callId, mergeToolCallRecord(byCallId.get(parsed.callId), parsed));
  }
  return [...byCallId.values()].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}
async function readToolCallsFromTranscript(workspaceRoot, agentId) {
  const adapter = getCursorLocalAdapter();
  const cwd = workspaceRoot;
  const refs = await adapter.resolveSessionRefs(agentId, cwd);
  const transcript = await adapter.getTranscript(agentId, refs);
  const records = [];
  for (const message of transcript.messages) {
    if (message.role !== "tool" || !message.toolName) {
      continue;
    }
    const callId = message.toolUseId ?? message.id;
    records.push({
      callId,
      runId: "transcript",
      turnNumber: 0,
      tool: message.toolName,
      status: message.toolStatus ?? "completed",
      args: message.toolArgs,
      result: message.toolResult,
      startedAt: message.recordedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      recordedAt: message.recordedAt ?? (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return records.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}
function normalizedToolName(toolName) {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}
function collectGeneratedFilesFromToolCalls(toolCalls) {
  const files = [];
  const seen = /* @__PURE__ */ new Set();
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
        mutation
      });
    }
  }
  return files.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}
async function readSdkAgentObservability(input) {
  const agentId = input.agentId.trim();
  const workspaceRoot = input.workspaceRoot.trim();
  if (!agentId || !workspaceRoot) {
    return null;
  }
  const stateRoot = getDefaultSdkStateRoot(workspaceRoot);
  const [runs, contextUsage] = await Promise.all([
    readAgentRuns(stateRoot, agentId),
    readSdkContextUsageSnapshot({ workspaceCwd: workspaceRoot, agentId }).catch((error) => {
      runtimeLogger.warn("sdk_agent_observability.read_context_usage_failed", {
        agent_id: agentId,
        ...errorFields(error)
      });
      return null;
    })
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
    source: "sdk_agent_store",
    agentId,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    runs,
    toolCalls,
    generatedFiles,
    contextUsage
  };
}

const GET = async ({ request, url }) => {
  const projectId = url.searchParams.get("project_id")?.trim();
  const agentId = url.searchParams.get("agent_id")?.trim();
  const conversationId = url.searchParams.get("conversation_id")?.trim();
  if (!agentId) {
    return jsonError("agent_id is required", 400);
  }
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const observability = await readSdkAgentObservability({
      workspaceRoot,
      agentId
    });
    if (!observability) {
      const corpus2 = await collectInstructionCorpus(workspaceRoot);
      const overhead2 = estimateRuntimeOverhead(corpus2);
      return jsonOk({
        source: "sdk_agent_store",
        agentId,
        conversationId: conversationId ?? null,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        runs: [],
        toolCalls: [],
        generatedFiles: [],
        contextUsage: {
          corpus: corpus2,
          overhead: overhead2,
          sdkUsage: null
        }
      });
    }
    const corpus = await collectInstructionCorpus(workspaceRoot);
    const overhead = estimateRuntimeOverhead(corpus);
    const sdkUsage = observability.contextUsage ? {
      usedTokens: observability.contextUsage.usedTokens,
      maxTokens: observability.contextUsage.maxTokens,
      categories: observability.contextUsage.categories.filter((node) => node.id && typeof node.tokens === "number" && node.tokens > 0).map((node) => ({
        id: node.id,
        label: node.label ?? node.id,
        tokens: node.tokens,
        children: (node.children ?? []).filter((child) => child.id && typeof child.tokens === "number" && child.tokens > 0).map((child) => ({
          id: child.id,
          label: child.label ?? child.id,
          tokens: child.tokens,
          contentPreview: child.contentPreview
        }))
      })),
      agentId: observability.contextUsage.agentId,
      checkpointBlobId: observability.contextUsage.checkpointBlobId,
      updatedAt: observability.contextUsage.updatedAt
    } : null;
    return jsonOk({
      source: observability.source,
      agentId: observability.agentId,
      conversationId: conversationId ?? null,
      updatedAt: observability.updatedAt,
      runs: observability.runs,
      toolCalls: observability.toolCalls,
      generatedFiles: observability.generatedFiles,
      contextUsage: {
        corpus,
        overhead,
        sdkUsage
      }
    });
  } catch (error) {
    return handleApiError(
      "runtime.observability",
      error,
      "Unable to load runtime observability right now.",
      500,
      { agent_id: agentId, conversation_id: conversationId ?? null, project_id: projectId ?? null }
    );
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
