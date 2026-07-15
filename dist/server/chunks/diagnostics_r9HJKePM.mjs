import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { r as readDispatchLogForRun } from './runtime-dispatch-log_ek1TMBNw.mjs';
import { l as readRunsIndex, g as getRuntimeRunEntry } from './runtime-sessions_Qp0oFuny.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

async function readRegistryEventsForRun(runId, workspaceRoot) {
  try {
    const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
    const runsPath = join(binding.harnessRoot, "runtime-sessions", "runs.jsonl");
    const raw = await readFile(runsPath, "utf8");
    return raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((event) => event.runId === runId);
  } catch {
    return [];
  }
}
async function collectRunDiagnostics(runId, workspaceRoot) {
  const [dispatchEvents, registryEvents, runsIndex] = await Promise.all([
    readDispatchLogForRun(runId, workspaceRoot),
    readRegistryEventsForRun(runId, workspaceRoot),
    readRunsIndex(workspaceRoot)
  ]);
  const inMemory = Boolean(getRuntimeRunEntry(runId));
  const activeIndex = runsIndex.active.some((entry) => entry.runId === runId);
  const errorEvent = [...dispatchEvents].reverse().find(
    (entry) => entry.event === "chat.sdk.dispatch.error" || entry.event === "chat.response.error" || entry.event === "chat.fanout.error"
  ) ?? null;
  const failedRegistry = registryEvents.find((event) => event.event === "run.failed");
  return {
    run_id: runId,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    in_memory: inMemory,
    active_index: activeIndex,
    dispatch_events: dispatchEvents,
    registry_events: registryEvents,
    last_error: errorEvent ? {
      phase: errorEvent.phase,
      message: errorEvent.error_message ?? errorEvent.detail,
      request_id: errorEvent.request_id,
      ts: errorEvent.ts
    } : failedRegistry ? {
      message: typeof failedRegistry.message === "string" ? failedRegistry.message : void 0,
      ts: typeof failedRegistry.ts === "string" ? failedRegistry.ts : void 0
    } : null
  };
}

const GET = async ({ params, request, url }) => {
  const runId = params.runId?.trim();
  if (!runId) {
    return jsonError("runId is required", 400);
  }
  const projectId = url.searchParams.get("project_id")?.trim();
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const diagnostics = await collectRunDiagnostics(runId, workspaceRoot);
    return jsonOk(diagnostics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to collect run diagnostics";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
