import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { f as startRunHubFanout, i as broadcastRunRecoveredComplete, d as broadcastRunInterrupted, e as appendRunInterrupted } from './runtime-hub-stream_CkfCSBM_.mjs';
import { c as registerRuntimeRun, f as findActiveRunEntry } from './runtime-sessions_Qp0oFuny.mjs';
import { p as probeRunLiveness, a as probeRunLivenessAcrossWorkspaces, i as isSuccessfulTerminalStatus } from './runtime-run-liveness_D8S3M7y3.mjs';
import { d as classifyRunTerminalOutcome } from './runtime-run-failure_BzuNxIfC.mjs';
import { f as findRunRegistryMetadata } from './runtime-run-recovery_GoTseua8.mjs';
import { m as markRunExecutingInProcessSession } from './runtime-active-runs_D57KghA-.mjs';

async function resolveAttachRunContext(runId) {
  const located = await findActiveRunEntry(runId);
  if (located) {
    return { entry: located.entry, workspaceRoot: located.workspaceRoot, indexed: true };
  }
  const probe = await probeRunLivenessAcrossWorkspaces(runId);
  if (probe.liveness === "not_found" || !probe.workspaceRoot) {
    return null;
  }
  const metadata = await findRunRegistryMetadata(runId, probe.workspaceRoot);
  if (!metadata) {
    return null;
  }
  return {
    entry: {
      runId,
      conversationId: metadata.conversationId,
      agentId: metadata.agentId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    workspaceRoot: metadata.workspaceRoot,
    indexed: false
  };
}
function terminalStatusFromProbe(probe) {
  const status = typeof probe.run?.status === "string" ? probe.run.status : "completed";
  if (probe.liveness === "not_found") {
    return "not_found";
  }
  return status;
}
async function handleTerminalAttach(context, probe) {
  const { entry, workspaceRoot } = context;
  const status = terminalStatusFromProbe(probe);
  const outcome = classifyRunTerminalOutcome(
    status,
    typeof probe.run?.result === "string" ? probe.run.result : void 0
  );
  if (isSuccessfulTerminalStatus(status) && !outcome.failed) {
    broadcastRunRecoveredComplete({
      runId: entry.runId,
      agentId: entry.agentId,
      conversationId: entry.conversationId,
      status
    });
    return jsonOk({
      ok: true,
      recovered: "completed",
      runId: entry.runId,
      conversationId: entry.conversationId,
      agentId: entry.agentId,
      status
    });
  }
  const message = outcome.errorMessage ?? (probe.liveness === "not_found" ? `Run ${entry.runId} not found in local SDK store` : `Run ${entry.runId} already terminal`);
  broadcastRunInterrupted({
    runId: entry.runId,
    agentId: entry.agentId,
    conversationId: entry.conversationId,
    reason: "stale_reattach",
    message
  });
  try {
    await appendRunInterrupted({
      runId: entry.runId,
      reason: "stale_reattach",
      message,
      resumable: true,
      workspaceRoot
    });
  } catch {
    return jsonError("Failed to reconcile stale run", 500);
  }
  return jsonOk(
    {
      ok: false,
      purged: true,
      recovered: outcome.failed ? "failed" : "stale",
      runId: entry.runId,
      reason: probe.liveness,
      status,
      message
    },
    410
  );
}
const POST = async ({ params }) => {
  const runId = params.runId?.trim();
  if (!runId) {
    return jsonError("Run id is required", 400);
  }
  const context = await resolveAttachRunContext(runId);
  if (!context) {
    return jsonError(`Run ${runId} is not active`, 404);
  }
  const { entry, workspaceRoot } = context;
  let probe;
  try {
    probe = await probeRunLiveness(entry.runId, workspaceRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Run liveness probe failed";
    return jsonError(message, 503);
  }
  if (probe.liveness === "terminal" || probe.liveness === "not_found") {
    return handleTerminalAttach(context, probe);
  }
  if (probe.liveness === "unavailable") {
    return jsonError("Runtime SDK unavailable — cannot attach run", 503);
  }
  if (probe.run) {
    registerRuntimeRun(entry.runId, probe.run, entry.conversationId, entry.agentId);
  }
  startRunHubFanout(entry.runId, entry.agentId, entry.conversationId, workspaceRoot, {
    silent: true
  });
  markRunExecutingInProcessSession(entry.runId);
  return jsonOk({
    ok: true,
    runId: entry.runId,
    conversationId: entry.conversationId,
    agentId: entry.agentId
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
