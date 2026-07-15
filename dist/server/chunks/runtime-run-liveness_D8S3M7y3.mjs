import { e as ensureWorkspacesReady, l as listWorkspaceProjects, r as resolveProjectWorkspaceRoot } from './workspace-manager_C2YuGzrP.mjs';
import { f as isFailedRunStatus } from './runtime-run-failure_BzuNxIfC.mjs';
import { k as hasRuntimeSdkCredentials, a as canAttemptRuntimeSdkCall, n as localGetRunOptions, __tla as __tla_0 } from './runtime-sdk-probe_CMRaDJPh.mjs';
let probeRunLivenessAcrossWorkspaces, isSuccessfulTerminalStatus, probeRunLiveness;
let __tla = Promise.all([
    (()=>{
        try {
            return __tla_0;
        } catch  {}
    })()
]).then(async ()=>{
    const TERMINAL_STATUSES = new Set([
        "completed",
        "finished",
        "failed",
        "cancelled",
        "aborted",
        "error",
        "expired"
    ]);
    const SUCCESS_TERMINAL_STATUSES = new Set([
        "completed",
        "finished",
        "succeeded"
    ]);
    function isNotFoundError(error) {
        const message = error instanceof Error ? error.message : String(error);
        return /not found/i.test(message);
    }
    function isTerminalStatus(status) {
        return TERMINAL_STATUSES.has(status.toLowerCase());
    }
    isSuccessfulTerminalStatus = function(status) {
        const normalized = status.trim().toLowerCase();
        if (SUCCESS_TERMINAL_STATUSES.has(normalized)) {
            return true;
        }
        if (!isTerminalStatus(normalized)) {
            return false;
        }
        return !isFailedRunStatus(normalized) && normalized !== "cancelled" && normalized !== "aborted";
    };
    probeRunLiveness = async function(runId, workspaceRoot) {
        if (!hasRuntimeSdkCredentials() || !canAttemptRuntimeSdkCall()) {
            return {
                liveness: "unavailable"
            };
        }
        try {
            const { Agent } = await import('@cursor/sdk').then(async (m)=>{
                await m.__tla;
                return m;
            });
            const run = await Agent.getRun(runId, await localGetRunOptions(workspaceRoot));
            const status = typeof run.status === "string" ? run.status : "";
            if (isTerminalStatus(status)) {
                return {
                    liveness: "terminal",
                    run
                };
            }
            return {
                liveness: "alive",
                run
            };
        } catch (error) {
            if (isNotFoundError(error)) {
                return {
                    liveness: "not_found"
                };
            }
            throw error;
        }
    };
    probeRunLivenessAcrossWorkspaces = async function(runId) {
        await ensureWorkspacesReady();
        const projects = await listWorkspaceProjects();
        for (const project of projects){
            const root = project.path ?? resolveProjectWorkspaceRoot(project.id);
            const probe = await probeRunLiveness(runId, root);
            if (probe.liveness !== "not_found") {
                return {
                    ...probe,
                    workspaceRoot: root
                };
            }
        }
        return {
            liveness: "not_found"
        };
    };
});
export { probeRunLivenessAcrossWorkspaces as a, isSuccessfulTerminalStatus as i, probeRunLiveness as p, __tla };
