import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { i as broadcastRunRecoveredComplete, d as broadcastRunInterrupted, e as appendRunInterrupted } from './runtime-hub-stream_CkfCSBM_.mjs';
import { f as findActiveRunEntry } from './runtime-sessions_Qp0oFuny.mjs';
import { a as probeRunLivenessAcrossWorkspaces, i as isSuccessfulTerminalStatus } from './runtime-run-liveness_D8S3M7y3.mjs';
import { f as findRunRegistryMetadata } from './runtime-run-recovery_GoTseua8.mjs';

const POST = async ({ params }) => {
  const runId = params.runId?.trim();
  if (!runId) {
    return jsonError("Run id is required", 400);
  }
  const located = await findActiveRunEntry(runId);
  if (!located) {
    const probe = await probeRunLivenessAcrossWorkspaces(runId);
    if (probe.liveness === "terminal" && probe.run && isSuccessfulTerminalStatus(probe.run.status) && probe.workspaceRoot) {
      const metadata = await findRunRegistryMetadata(runId, probe.workspaceRoot);
      if (metadata) {
        broadcastRunRecoveredComplete({
          runId,
          agentId: metadata.agentId,
          conversationId: metadata.conversationId,
          status: probe.run.status
        });
        return jsonOk({ ok: true, purged: false, recovered: "completed", runId });
      }
    }
    return jsonOk({ ok: true, purged: false, reason: "not_indexed" });
  }
  const { entry, workspaceRoot } = located;
  broadcastRunInterrupted({
    runId,
    agentId: entry.agentId,
    conversationId: entry.conversationId,
    reason: "stale_reattach",
    message: "Run removed from active index — attach failed or process restarted"
  });
  try {
    await appendRunInterrupted({
      runId,
      reason: "stale_reattach",
      message: "Run removed from active index — attach failed or process restarted",
      resumable: true,
      workspaceRoot
    });
  } catch {
    return jsonError("Failed to reconcile stale run", 500);
  }
  return jsonOk({ ok: true, purged: true, runId });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
