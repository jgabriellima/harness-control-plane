import { j as joinAssistantTextBlocks, m as mergeStreamingAssistantText } from './assistant-text_q9NGcfVY.mjs';
import { a as appendDispatchLog } from './runtime-dispatch-log_ek1TMBNw.mjs';
import { s as splitOpenUIEnvelope, c as createTextPart, a as createOpenUISurfacePart } from './message-parts_Bw3wMi8N.mjs';
import { g as isRecoverableRuntimeConnectError, m as markRuntimeAuthUnavailable, h as isConnectCanceled, i as isConnectUnauthenticated, j as attachRecoverableConnectHandler, k as hasRuntimeSdkCredentials, a as canAttemptRuntimeSdkCall, c as cancelRunIgnoringConnectAbort, l as formatRuntimeConnectError, n as localGetRunOptions, b as invalidateSdkProbeCache, __tla as __tla_0 } from './runtime-sdk-probe_CMRaDJPh.mjs';
import { r as runtimeLogger, e as errorFields, m as mergeRunFailureDetail, d as classifyRunTerminalOutcome, f as isFailedRunStatus } from './runtime-run-failure_BzuNxIfC.mjs';
import { a as appendRunTerminal, w as workspaceCwd, d as runWithWorkspaceCwdAsync, g as getRuntimeRunEntry, h as releaseRuntimeRun, i as releaseAgentSlot, j as getActiveRunIds, f as findActiveRunEntry, k as retainRuntimeRun, c as registerRuntimeRun } from './runtime-sessions_Qp0oFuny.mjs';
import { l as loadRunSessionLifecyclePolicy, s as shouldAutoAttachIndexedRuns, a as readLiveActiveRuns } from './runtime-active-runs_D57KghA-.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDefaultSdkStateRoot } from '@cursor/sdk';
import { r as reconcileRuntimeCredentials } from './runtime-credentials-reconcile_CrWdw52B.mjs';
let broadcastBrowserSessionClosed, broadcastBrowserSessionReady, broadcastBrowserUrlChanged, broadcastRunInterrupted, appendRunInterrupted, startRunHubFanout, broadcastComputerUsePreviewReady, createRuntimeHubEventStream, broadcastRunRecoveredComplete, cancelRuntimeRun, encodeRuntimeSseHeartbeat, consumeRunStream, encodeRuntimeSseData, getRunContext, wireFromSdkMessage, resolveRunTerminalStatus, setRunContext, wireOpenUIAssistantMessage;
let __tla = Promise.all([
    (()=>{
        try {
            return __tla_0;
        } catch  {}
    })()
]).then(async ()=>{
    appendRunInterrupted = async function(input) {
        const args = {
            runId: input.runId,
            event: "run.interrupted",
            status: "interrupted",
            reason: input.reason,
            message: input.message ?? `Run interrupted (${input.reason})`,
            workspaceRoot: input.workspaceRoot
        };
        await appendRunTerminal(args);
    };
    const rawAssistantByRun = new Map();
    function clearOpenUIAssistantAccumulator(runId) {
        rawAssistantByRun.delete(runId);
    }
    function buildAssistantParts(surfaceId, split) {
        const parts = [];
        if (split.text.length > 0) {
            parts.push(createTextPart(split.text));
        }
        if (split.openuiSource.length > 0 || split.openFence) {
            parts.push(createOpenUISurfacePart(surfaceId, split.openuiSource, split.openFence ? "streaming" : "completed"));
        }
        return parts;
    }
    wireOpenUIAssistantMessage = function(message, runId, agentId, conversationId, surfaceId) {
        const chunk = joinAssistantTextBlocks(message.message.content.filter((block)=>block.type === "text").map((block)=>block.text));
        const previous = rawAssistantByRun.get(runId) ?? "";
        const raw = mergeStreamingAssistantText(previous, chunk);
        rawAssistantByRun.set(runId, raw);
        const split = splitOpenUIEnvelope(raw);
        const parts = buildAssistantParts(surfaceId, split);
        const timestamp = (new Date()).toISOString();
        return {
            type: "assistant",
            run_id: runId,
            agent_id: agentId,
            conversation_id: conversationId,
            timestamp,
            payload: {
                text: split.text,
                parts,
                openui_source: split.openuiSource,
                openui_status: split.openFence ? "streaming" : split.openuiSource.length > 0 ? "completed" : void 0
            }
        };
    };
    let installed = false;
    function installRuntimeProcessGuard() {
        if (installed || typeof process === "undefined" || typeof process.on !== "function") {
            return;
        }
        installed = true;
        const recover = (reason, promise)=>{
            if (!isRecoverableRuntimeConnectError(reason)) {
                return;
            }
            if (promise && typeof promise === "object" && "catch" in promise && typeof promise.catch === "function") {
                void promise.catch(()=>void 0);
            }
            if (reason instanceof Error && reason.message.toLowerCase().includes("unauthenticated")) {
                markRuntimeAuthUnavailable();
            }
            runtimeLogger.warn("runtime.connect.unhandled_recovered", errorFields(reason));
        };
        process.prependListener("unhandledRejection", recover);
    }
    const execFileAsync = promisify(execFile);
    async function querySqlite(databasePath, sql) {
        const { stdout } = await execFileAsync("sqlite3", [
            databasePath,
            sql
        ], {
            maxBuffer: 4 * 1024 * 1024
        });
        return stdout.trim();
    }
    async function readLocalRunFailureDetail(agentId, runId, workspaceCwd) {
        const stateRoot = getDefaultSdkStateRoot(workspaceCwd);
        const indexDbPath = `${stateRoot}/index.db`;
        const escapedAgentId = agentId.replace(/'/g, "''");
        const escapedRunId = runId.replace(/'/g, "''");
        const row = await querySqlite(indexDbPath, `SELECT result, error_code FROM runs WHERE agent_id='${escapedAgentId}' AND run_id='${escapedRunId}' LIMIT 1;`);
        if (!row?.trim()) {
            return void 0;
        }
        const parts = row.split("|");
        const resultText = parts[0]?.trim();
        const errorCode = parts[1]?.trim();
        return resultText || errorCode || void 0;
    }
    consumeRunStream = async function(run, onMessage) {
        const iterator = run.stream();
        try {
            for await (const message of iterator){
                onMessage(message);
            }
            return "completed";
        } catch (error) {
            if (isConnectCanceled(error)) {
                return "cancelled";
            }
            if (isConnectUnauthenticated(error)) {
                markRuntimeAuthUnavailable();
                return "auth_failed";
            }
            throw error;
        } finally{
            if (typeof iterator.return === "function") {
                const closePromise = iterator.return();
                attachRecoverableConnectHandler(closePromise);
                await closePromise.catch((error)=>{
                    if (isConnectCanceled(error)) {
                        return void 0;
                    }
                    throw error;
                });
            }
        }
    };
    async function resolveLocalRunFailureDetail(run, workspaceCwd, status, rawResult) {
        if (rawResult?.trim() || !workspaceCwd?.trim() || !isFailedRunStatus(status)) {
            return void 0;
        }
        return readLocalRunFailureDetail(run.agentId, run.id, workspaceCwd);
    }
    resolveRunTerminalStatus = async function(run, options) {
        const workspaceCwd = options?.workspaceCwd?.trim();
        const inlineFailure = run.error?.message?.trim() || run.error?.code?.trim();
        if (!run.supports("wait")) {
            const storeDetail = await resolveLocalRunFailureDetail(run, workspaceCwd, run.status, run.result);
            const errorDetail = mergeRunFailureDetail(inlineFailure, storeDetail);
            return classifyRunTerminalOutcome(run.status, run.result, errorDetail);
        }
        try {
            const waitPromise = run.wait();
            attachRecoverableConnectHandler(waitPromise);
            const result = await waitPromise;
            const waitInlineFailure = result.error?.message?.trim() || result.error?.code?.trim();
            const storeDetail = await resolveLocalRunFailureDetail(run, workspaceCwd, result.status, result.result);
            const errorDetail = mergeRunFailureDetail(waitInlineFailure, storeDetail);
            return classifyRunTerminalOutcome(result.status, result.result, errorDetail);
        } catch (error) {
            if (isConnectCanceled(error)) {
                return classifyRunTerminalOutcome("cancelled");
            }
            if (isConnectUnauthenticated(error)) {
                markRuntimeAuthUnavailable();
                return classifyRunTerminalOutcome("failed", "[unauthenticated] Error");
            }
            throw error;
        }
    };
    const runContexts = new Map();
    setRunContext = function(runId, context) {
        runContexts.set(runId, context);
    };
    getRunContext = function(runId) {
        return runContexts.get(runId);
    };
    function clearRunContext(runId) {
        runContexts.delete(runId);
    }
    installRuntimeProcessGuard();
    function encodeSseData(event) {
        const encoder = new TextEncoder();
        return encoder.encode(`data: ${JSON.stringify(event)}

`);
    }
    function encodeSseHeartbeat() {
        const encoder = new TextEncoder();
        return encoder.encode(": heartbeat\n\n");
    }
    wireFromSdkMessage = function(message, runId, agentId, conversationId) {
        const timestamp = (new Date()).toISOString();
        if (message.type === "assistant") {
            const textBlocks = joinAssistantTextBlocks(message.message.content.filter((block)=>block.type === "text").map((block)=>block.text));
            return {
                type: "assistant",
                run_id: runId,
                agent_id: agentId,
                conversation_id: conversationId,
                timestamp,
                payload: {
                    text: textBlocks
                }
            };
        }
        if (message.type === "tool_call") {
            return {
                type: "tool_call",
                run_id: runId,
                agent_id: agentId,
                conversation_id: conversationId,
                timestamp,
                payload: {
                    tool: message.name,
                    call_id: message.call_id,
                    status: message.status,
                    args: message.args,
                    result: message.result
                }
            };
        }
        if (message.type === "thinking") {
            return {
                type: "thinking",
                run_id: runId,
                agent_id: agentId,
                conversation_id: conversationId,
                timestamp,
                payload: {
                    text: message.text,
                    duration_ms: message.thinking_duration_ms
                }
            };
        }
        if (message.type === "status" && message.status === "ERROR") {
            return {
                type: "error",
                run_id: runId,
                agent_id: agentId,
                conversation_id: conversationId,
                timestamp,
                payload: {
                    message: message.message?.trim() || "Runtime run failed"
                }
            };
        }
        if (message.type === "usage") {
            return {
                type: "context.usage",
                run_id: runId,
                agent_id: agentId,
                conversation_id: conversationId,
                timestamp,
                payload: {
                    usage: message.usage
                }
            };
        }
        return {
            type: message.type,
            run_id: runId,
            agent_id: agentId,
            conversation_id: conversationId,
            timestamp,
            payload: {}
        };
    };
    const hubClients = new Set();
    const fanoutStarted = new Set();
    function broadcastEvent(event) {
        const chunk = encodeSseData(event);
        for (const client of hubClients){
            try {
                client.enqueue(chunk);
            } catch  {
                client.close();
                hubClients.delete(client);
            }
        }
    }
    broadcastBrowserSessionReady = function(input) {
        broadcastEvent({
            type: "browser.session.ready",
            run_id: "",
            agent_id: "",
            conversation_id: input.conversationId,
            timestamp: (new Date()).toISOString(),
            payload: {
                sessionId: input.sessionId,
                url: input.url,
                interactive: Boolean(input.interactive),
                controlMode: input.controlMode ?? "agent",
                viewportWidth: input.viewportWidth ?? 1280,
                viewportHeight: input.viewportHeight ?? 720,
                renderMode: input.renderMode ?? "screencast"
            }
        });
    };
    broadcastBrowserUrlChanged = function(input) {
        broadcastEvent({
            type: "browser.url.changed",
            run_id: "",
            agent_id: "",
            conversation_id: input.conversationId,
            timestamp: (new Date()).toISOString(),
            payload: {
                sessionId: input.sessionId,
                url: input.url
            }
        });
    };
    broadcastBrowserSessionClosed = function(input) {
        broadcastEvent({
            type: "browser.session.closed",
            run_id: "",
            agent_id: "",
            conversation_id: input.conversationId,
            timestamp: (new Date()).toISOString(),
            payload: {
                sessionId: input.sessionId
            }
        });
    };
    broadcastComputerUsePreviewReady = function(input) {
        broadcastEvent({
            type: "computer_use.preview.ready",
            run_id: "",
            agent_id: "",
            conversation_id: input.conversationId,
            timestamp: (new Date()).toISOString(),
            payload: {
                sessionId: input.sessionId
            }
        });
    };
    broadcastRunInterrupted = function(input) {
        broadcastEvent({
            type: "run.interrupted",
            run_id: input.runId,
            agent_id: input.agentId,
            conversation_id: input.conversationId,
            timestamp: (new Date()).toISOString(),
            payload: {
                reason: input.reason,
                message: input.message ?? `Run interrupted (${input.reason})`,
                resumable: true
            }
        });
    };
    broadcastRunRecoveredComplete = function(input) {
        broadcastEvent({
            type: "run_complete",
            run_id: input.runId,
            agent_id: input.agentId,
            conversation_id: input.conversationId,
            timestamp: (new Date()).toISOString(),
            payload: {
                status: input.status,
                recovered: true
            }
        });
    };
    function teardownRunFanout(runId) {
        fanoutStarted.delete(runId);
        clearRunContext(runId);
        clearOpenUIAssistantAccumulator(runId);
    }
    async function completeRunFanout(runId, agentId, conversationId, status, options = {}) {
        const resolvedWorkspaceRoot = options.workspaceRoot ?? workspaceCwd();
        const notifyClient = options.notifyClient !== false;
        const errorMessage = options.errorMessage;
        if (errorMessage) {
            if (notifyClient) {
                broadcastEvent({
                    type: "error",
                    run_id: runId,
                    agent_id: agentId,
                    conversation_id: conversationId,
                    timestamp: (new Date()).toISOString(),
                    payload: {
                        message: errorMessage,
                        ...options.clearAgent ? {
                            clear_agent: true
                        } : {}
                    }
                });
            }
            try {
                await appendRunTerminal({
                    runId,
                    event: "run.failed",
                    message: errorMessage,
                    workspaceRoot: resolvedWorkspaceRoot
                });
            } catch  {}
        } else if (notifyClient) {
            broadcastEvent({
                type: "run_complete",
                run_id: runId,
                agent_id: agentId,
                conversation_id: conversationId,
                timestamp: (new Date()).toISOString(),
                payload: {
                    status
                }
            });
            try {
                await appendRunTerminal({
                    runId,
                    event: "run.completed",
                    status,
                    workspaceRoot: resolvedWorkspaceRoot
                });
            } catch  {}
        } else if (!isFailedRunStatus(status) && status.trim().toLowerCase() !== "cancelled") {
            broadcastRunRecoveredComplete({
                runId,
                agentId,
                conversationId,
                status
            });
            try {
                await appendRunTerminal({
                    runId,
                    event: "run.completed",
                    status,
                    workspaceRoot: resolvedWorkspaceRoot
                });
            } catch  {}
        } else {
            broadcastRunInterrupted({
                runId,
                agentId,
                conversationId,
                reason: "stale_reattach",
                message: "Background run reattach abandoned"
            });
            try {
                await appendRunInterrupted({
                    runId,
                    reason: "stale_reattach",
                    message: "Background run reattach abandoned",
                    resumable: true,
                    workspaceRoot: resolvedWorkspaceRoot
                });
            } catch  {}
        }
        releaseRuntimeRun(runId);
        releaseAgentSlot();
        teardownRunFanout(runId);
    }
    async function abandonRunFanout(runId, agentId, conversationId, cwd, reason) {
        runtimeLogger.debug("chat.fanout.abandoned", {
            run_id: runId,
            agent_id: agentId,
            conversation_id: conversationId,
            reason
        });
        broadcastRunInterrupted({
            runId,
            agentId,
            conversationId,
            reason: "stale_reattach",
            message: reason
        });
        try {
            await appendRunInterrupted({
                runId,
                reason: "stale_reattach",
                message: reason,
                resumable: true,
                workspaceRoot: cwd
            });
        } catch  {}
        releaseRuntimeRun(runId);
        releaseAgentSlot();
        teardownRunFanout(runId);
    }
    cancelRuntimeRun = async function(runId) {
        const entry = getRuntimeRunEntry(runId);
        if (!entry) {
            return {
                ok: false,
                message: `Run ${runId} not found`
            };
        }
        const { run, conversationId, agentId } = entry;
        if (!run.supports("cancel")) {
            return {
                ok: false,
                message: run.unsupportedReason("cancel") ?? "Cancel not supported"
            };
        }
        try {
            await cancelRunIgnoringConnectAbort(run);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Cancel failed";
            return {
                ok: false,
                message
            };
        }
        if (conversationId && agentId) {
            broadcastEvent({
                type: "run.aborted",
                run_id: runId,
                agent_id: agentId,
                conversation_id: conversationId,
                timestamp: (new Date()).toISOString(),
                payload: {
                    status: "cancelled"
                }
            });
        }
        try {
            await appendRunTerminal({
                runId,
                event: "run.aborted",
                status: "cancelled",
                workspaceRoot: workspaceCwd()
            });
        } catch  {}
        if (conversationId && agentId) {
            await completeRunFanout(runId, agentId, conversationId, "cancelled");
        } else {
            releaseRuntimeRun(runId);
            releaseAgentSlot();
            teardownRunFanout(runId);
        }
        return {
            ok: true
        };
    };
    async function finalizeStreamedRunFanout(runId, agentId, conversationId, cwd, silent, requestId) {
        const entry = getRuntimeRunEntry(runId);
        const run = entry?.run;
        if (!run) {
            const message = "Run stream ended without a registered runtime handle";
            runtimeLogger.error("chat.fanout.run_missing", {
                request_id: requestId,
                run_id: runId,
                agent_id: agentId,
                conversation_id: conversationId,
                error_message: message
            });
            if (silent) {
                await abandonRunFanout(runId, agentId, conversationId, cwd, message);
                return;
            }
            await completeRunFanout(runId, agentId, conversationId, "failed", {
                workspaceRoot: cwd,
                errorMessage: message
            });
            return;
        }
        const terminal = await resolveRunTerminalStatus(run, {
            workspaceCwd: cwd
        });
        if (terminal.authFailed) {
            markRuntimeAuthUnavailable();
            invalidateSdkProbeCache(cwd);
            void reconcileRuntimeCredentials();
        }
        if (terminal.failed) {
            const message = terminal.errorMessage ?? "Runtime run failed";
            runtimeLogger.warn("chat.fanout.run_failed", {
                request_id: requestId,
                run_id: runId,
                agent_id: agentId,
                conversation_id: conversationId,
                status: terminal.status,
                auth_failed: terminal.authFailed,
                error_message: message
            });
            if (silent) {
                await abandonRunFanout(runId, agentId, conversationId, cwd, message);
                return;
            }
            await completeRunFanout(runId, agentId, conversationId, "failed", {
                workspaceRoot: cwd,
                errorMessage: message,
                clearAgent: terminal.authFailed
            });
            return;
        }
        await completeRunFanout(runId, agentId, conversationId, terminal.cancelled ? "cancelled" : terminal.status, {
            workspaceRoot: cwd,
            notifyClient: !silent
        });
    }
    async function streamRunToHub(runId, agentId, conversationId, run, cwd, silent) {
        const outcome = await consumeRunStream(run, (message)=>{
            const runContext = getRunContext(runId);
            const wire = runContext?.wireMode === "rich" && message.type === "assistant" ? wireOpenUIAssistantMessage(message, runId, agentId, conversationId, runContext.surfaceId) : wireFromSdkMessage(message, runId, agentId, conversationId);
            if (wire) {
                broadcastEvent(wire);
            }
        });
        if (outcome === "cancelled") {
            await completeRunFanout(runId, agentId, conversationId, "cancelled", {
                workspaceRoot: cwd,
                notifyClient: !silent
            });
            return;
        }
        if (outcome === "auth_failed") {
            markRuntimeAuthUnavailable();
            invalidateSdkProbeCache(cwd);
            void reconcileRuntimeCredentials();
            const message = formatRuntimeConnectError(new Error("[unauthenticated] Error"));
            if (silent) {
                await abandonRunFanout(runId, agentId, conversationId, cwd, message);
            } else {
                await completeRunFanout(runId, agentId, conversationId, "failed", {
                    workspaceRoot: cwd,
                    errorMessage: message,
                    clearAgent: true
                });
            }
            return;
        }
        await finalizeStreamedRunFanout(runId, agentId, conversationId, cwd, silent);
    }
    function handleFanoutError(error, runId, agentId, conversationId, requestId, cwd, phase, silent) {
        if (isConnectCanceled(error)) {
            runtimeLogger.debug("chat.fanout.cancelled", {
                request_id: requestId,
                run_id: runId,
                agent_id: agentId,
                conversation_id: conversationId,
                phase
            });
            return completeRunFanout(runId, agentId, conversationId, "cancelled", {
                workspaceRoot: cwd,
                notifyClient: !silent
            });
        }
        if (isConnectUnauthenticated(error)) {
            markRuntimeAuthUnavailable();
        }
        const message = formatRuntimeConnectError(error);
        if (silent) {
            return abandonRunFanout(runId, agentId, conversationId, cwd, message);
        }
        runtimeLogger.error("chat.fanout.error", {
            request_id: requestId,
            run_id: runId,
            agent_id: agentId,
            conversation_id: conversationId,
            phase,
            ...errorFields(error)
        });
        void appendDispatchLog({
            event: "chat.fanout.error",
            request_id: requestId ?? `fanout-${runId}`,
            run_id: runId,
            agent_id: agentId,
            conversation_id: conversationId,
            cwd,
            phase,
            error_message: message
        }, cwd);
        return completeRunFanout(runId, agentId, conversationId, "failed", {
            workspaceRoot: cwd,
            errorMessage: message
        });
    }
    startRunHubFanout = function(runId, agentId, conversationId, harnessWorkspaceCwd, options) {
        const resolvedOptions = typeof options === "string" ? {
            requestId: options
        } : options ?? {};
        const { requestId, silent = false } = resolvedOptions;
        if (fanoutStarted.has(runId)) {
            return;
        }
        fanoutStarted.add(runId);
        const cwd = harnessWorkspaceCwd ?? workspaceCwd();
        if (!hasRuntimeSdkCredentials() || !canAttemptRuntimeSdkCall()) {
            teardownRunFanout(runId);
            runtimeLogger.debug("chat.fanout.skip_credentials_or_auth_gate", {
                request_id: requestId,
                run_id: runId,
                agent_id: agentId,
                conversation_id: conversationId,
                cwd,
                silent
            });
            return;
        }
        runtimeLogger.debug("chat.fanout.started", {
            request_id: requestId,
            run_id: runId,
            agent_id: agentId,
            conversation_id: conversationId,
            cwd,
            silent
        });
        void appendDispatchLog({
            event: "chat.fanout.started",
            request_id: requestId ?? `fanout-${runId}`,
            run_id: runId,
            agent_id: agentId,
            conversation_id: conversationId,
            cwd,
            phase: "chat.fanout"
        }, cwd);
        void runWithWorkspaceCwdAsync(cwd, async ()=>{
            try {
                const entry = getRuntimeRunEntry(runId);
                let run = entry?.run;
                if (!run) {
                    run = retainRuntimeRun(runId);
                }
                if (!run) {
                    const { Agent } = await import('@cursor/sdk').then(async (m)=>{
                        await m.__tla;
                        return m;
                    });
                    run = await Agent.getRun(runId, await localGetRunOptions(workspaceCwd()));
                    registerRuntimeRun(runId, run, conversationId, agentId);
                }
                await streamRunToHub(runId, agentId, conversationId, run, cwd, silent);
            } catch (error) {
                await handleFanoutError(error, runId, agentId, conversationId, requestId, cwd, "chat.fanout", silent);
            }
        }).catch((error)=>{
            teardownRunFanout(runId);
            void handleFanoutError(error, runId, agentId, conversationId, requestId, cwd, "chat.fanout.outer", silent).catch(()=>{});
        });
    };
    function attachKnownRunsToHub() {
        if (!hasRuntimeSdkCredentials() || !canAttemptRuntimeSdkCall()) {
            return;
        }
        for (const runId of getActiveRunIds()){
            const entry = getRuntimeRunEntry(runId);
            if (!entry || !entry.conversationId || !entry.agentId) {
                continue;
            }
            startRunHubFanout(runId, entry.agentId, entry.conversationId, void 0, {
                silent: true
            });
        }
    }
    async function attachIndexedRunsToHub() {
        if (!hasRuntimeSdkCredentials() || !canAttemptRuntimeSdkCall()) {
            runtimeLogger.debug("chat.fanout.skip_indexed_auth_gate", {});
            return;
        }
        const policy = await loadRunSessionLifecyclePolicy();
        if (!shouldAutoAttachIndexedRuns(policy)) {
            runtimeLogger.debug("chat.fanout.skip_indexed_session_boundary", {
                indexed_at_process_start: policy.indexedAtProcessStart
            });
            return;
        }
        try {
            const index = await readLiveActiveRuns();
            for (const entry of index.active){
                const located = await findActiveRunEntry(entry.runId);
                startRunHubFanout(entry.runId, entry.agentId, entry.conversationId, located?.workspaceRoot, {
                    silent: true
                });
            }
        } catch  {}
    }
    createRuntimeHubEventStream = function(signal) {
        const HEARTBEAT_INTERVAL_MS = 15e3;
        return new ReadableStream({
            start (controller) {
                let closed = false;
                let heartbeatTimer = null;
                const client = {
                    enqueue: (chunk)=>{
                        if (!closed) {
                            try {
                                controller.enqueue(chunk);
                            } catch  {
                                closed = true;
                                hubClients.delete(client);
                            }
                        }
                    },
                    close: ()=>{
                        if (!closed) {
                            closed = true;
                            hubClients.delete(client);
                        }
                    }
                };
                const close = ()=>{
                    if (closed) {
                        return;
                    }
                    closed = true;
                    hubClients.delete(client);
                    if (heartbeatTimer) {
                        clearInterval(heartbeatTimer);
                        heartbeatTimer = null;
                    }
                    try {
                        controller.close();
                    } catch  {}
                };
                signal.addEventListener("abort", close, {
                    once: true
                });
                hubClients.add(client);
                attachKnownRunsToHub();
                void attachIndexedRunsToHub().catch((error)=>{
                    runtimeLogger.warn("chat.fanout.attach_indexed.error", errorFields(error));
                });
                heartbeatTimer = setInterval(()=>{
                    if (!closed) {
                        client.enqueue(encodeSseHeartbeat());
                    }
                }, HEARTBEAT_INTERVAL_MS);
            },
            cancel () {
                signal.abort();
            }
        });
    };
    encodeRuntimeSseData = function(event) {
        return encodeSseData(event);
    };
    encodeRuntimeSseHeartbeat = function() {
        return encodeSseHeartbeat();
    };
});
export { broadcastBrowserSessionClosed as a, broadcastBrowserSessionReady as b, broadcastBrowserUrlChanged as c, broadcastRunInterrupted as d, appendRunInterrupted as e, startRunHubFanout as f, broadcastComputerUsePreviewReady as g, createRuntimeHubEventStream as h, broadcastRunRecoveredComplete as i, cancelRuntimeRun as j, encodeRuntimeSseHeartbeat as k, consumeRunStream as l, encodeRuntimeSseData as m, getRunContext as n, wireFromSdkMessage as o, resolveRunTerminalStatus as r, setRunContext as s, wireOpenUIAssistantMessage as w, __tla };
