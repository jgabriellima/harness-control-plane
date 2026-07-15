import { n as localGetRunOptions, m as markRuntimeAuthUnavailable, b as invalidateSdkProbeCache, l as formatRuntimeConnectError, h as isConnectCanceled, __tla as __tla_0 } from './runtime-sdk-probe_CMRaDJPh.mjs';
import { k as encodeRuntimeSseHeartbeat, l as consumeRunStream, m as encodeRuntimeSseData, r as resolveRunTerminalStatus, n as getRunContext, w as wireOpenUIAssistantMessage, o as wireFromSdkMessage, __tla as __tla_1 } from './runtime-hub-stream_CkfCSBM_.mjs';
import { w as workspaceCwd, k as retainRuntimeRun, h as releaseRuntimeRun, i as releaseAgentSlot } from './runtime-sessions_Qp0oFuny.mjs';
let page;
let __tla = Promise.all([
    (()=>{
        try {
            return __tla_0;
        } catch  {}
    })(),
    (()=>{
        try {
            return __tla_1;
        } catch  {}
    })()
]).then(async ()=>{
    function wireFromSdkMessageSingleSession(message, runId, agentId) {
        const runContext = getRunContext(runId);
        const hubWire = runContext?.wireMode === "rich" && message.type === "assistant" ? wireOpenUIAssistantMessage(message, runId, agentId, "", runContext.surfaceId) : wireFromSdkMessage(message, runId, agentId, "");
        if (!hubWire) {
            return null;
        }
        const { conversation_id: _ignored, ...wire } = hubWire;
        return wire;
    }
    function createRuntimeEventStream(runId, agentId, signal) {
        const HEARTBEAT_INTERVAL_MS = 15e3;
        return new ReadableStream({
            async start (controller) {
                let closed = false;
                let heartbeatTimer = null;
                const close = ()=>{
                    if (closed) {
                        return;
                    }
                    closed = true;
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
                heartbeatTimer = setInterval(()=>{
                    if (!closed) {
                        controller.enqueue(encodeRuntimeSseHeartbeat());
                    }
                }, HEARTBEAT_INTERVAL_MS);
                let retained = false;
                try {
                    await localGetRunOptions(workspaceCwd());
                    let run = retainRuntimeRun(runId);
                    retained = Boolean(run);
                    if (!run) {
                        const { Agent } = await import('@cursor/sdk').then(async (m)=>{
                            await m.__tla;
                            return m;
                        });
                        run = await Agent.getRun(runId, await localGetRunOptions(workspaceCwd()));
                    }
                    const outcome = await consumeRunStream(run, (message)=>{
                        if (closed) {
                            return;
                        }
                        const wire = wireFromSdkMessageSingleSession(message, runId, agentId);
                        if (wire) {
                            controller.enqueue(encodeRuntimeSseData(wire));
                        }
                    });
                    if (closed || outcome === "cancelled" || outcome === "auth_failed") {
                        if (outcome === "auth_failed" && !closed) {
                            markRuntimeAuthUnavailable("stream_auth_failed");
                            invalidateSdkProbeCache(workspaceCwd());
                            controller.enqueue(encodeRuntimeSseData({
                                type: "error",
                                run_id: runId,
                                agent_id: agentId,
                                timestamp: (new Date()).toISOString(),
                                payload: {
                                    message: formatRuntimeConnectError(new Error("[unauthenticated] Error"))
                                }
                            }));
                        }
                        return;
                    }
                    const terminal = await resolveRunTerminalStatus(run, {
                        workspaceCwd: workspaceCwd()
                    });
                    if (closed) {
                        return;
                    }
                    if (terminal.authFailed) {
                        markRuntimeAuthUnavailable("stream_run_auth_failed");
                        invalidateSdkProbeCache(workspaceCwd());
                    }
                    if (terminal.failed) {
                        controller.enqueue(encodeRuntimeSseData({
                            type: "error",
                            run_id: runId,
                            agent_id: agentId,
                            timestamp: (new Date()).toISOString(),
                            payload: {
                                message: terminal.errorMessage ?? "Runtime run failed"
                            }
                        }));
                        return;
                    }
                    controller.enqueue(encodeRuntimeSseData({
                        type: "run_complete",
                        run_id: runId,
                        agent_id: agentId,
                        timestamp: (new Date()).toISOString(),
                        payload: {
                            status: terminal.cancelled ? "cancelled" : terminal.status
                        }
                    }));
                } catch (error) {
                    if (closed || isConnectCanceled(error)) {
                        return;
                    }
                    const message = formatRuntimeConnectError(error);
                    controller.enqueue(encodeRuntimeSseData({
                        type: "error",
                        run_id: runId,
                        agent_id: agentId,
                        timestamp: (new Date()).toISOString(),
                        payload: {
                            message
                        }
                    }));
                } finally{
                    if (retained) {
                        releaseRuntimeRun(runId);
                    }
                    releaseAgentSlot();
                    close();
                }
            },
            cancel () {
                signal.abort();
            }
        });
    }
    const GET = async ({ request, url })=>{
        const runId = url.searchParams.get("run_id")?.trim();
        const agentId = url.searchParams.get("agent_id")?.trim();
        if (!runId || !agentId) {
            return new Response("run_id and agent_id are required", {
                status: 400
            });
        }
        const stream = createRuntimeEventStream(runId, agentId, request.signal);
        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive"
            }
        });
    };
    const _page = Object.freeze(Object.defineProperty({
        __proto__: null,
        GET
    }, Symbol.toStringTag, {
        value: 'Module'
    }));
    page = ()=>_page;
});
export { page, __tla };
