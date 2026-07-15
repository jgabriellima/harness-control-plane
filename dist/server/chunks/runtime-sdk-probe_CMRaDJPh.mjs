import { ConnectError, Code } from '@connectrpc/connect';
import { Cursor, AuthenticationError, NetworkError } from '@cursor/sdk';
import { s as sdkDispatchAuthMessage, g as getCachedServerSdkMessageContext, r as runtimeLogger, h as resolveServerSdkMessageContext, j as cacheServerSdkMessageContext, k as sdkMissingApiKeyMessage, e as errorFields, l as isRunAuthFailureText, b as sdkRuntimeReconnectingMessage, n as sdkUnknownFailureMessage, o as sdkAuthFailedMessage, p as sdkNetworkFailedMessage, q as sdkTimeoutMessage } from './runtime-run-failure_BzuNxIfC.mjs';
import { g as getPresentationTitle } from './ui-branding_xMGaxulv.mjs';
import { r as resolveProjectRoot } from './project-root_D7dTqIZJ.mjs';
import { l as loadUIConfig } from './ui-config_Wh0_gC44.mjs';
let canAttemptRuntimeSdkCall, invalidateSdkProbeCache, cancelRunIgnoringConnectAbort, resolveLocalAgentStore, ensureRuntimeApiKeyInProcessEnv, clearRuntimeAuthGate, isRecoverableRuntimeConnectError, isConnectCanceled, isConnectUnauthenticated, attachRecoverableConnectHandler, hasRuntimeSdkCredentials, formatRuntimeConnectError, markRuntimeAuthUnavailable, localGetRunOptions, probeSdkDispatchHealth, resolveRuntimeApiKey;
let __tla = (async ()=>{
    isConnectCanceled = function(error) {
        if (error instanceof ConnectError && (error.code === Code.Canceled || error.code === Code.Aborted)) {
            return true;
        }
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            return message.includes("[canceled]") || message.includes("[aborted]") || message.includes("operation was aborted") || message.includes("econnreset");
        }
        return false;
    };
    isConnectUnauthenticated = function(error) {
        if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
            return true;
        }
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            return message.includes("[unauthenticated]") || message.includes("invalid api key");
        }
        return false;
    };
    formatRuntimeConnectError = function(error) {
        if (isConnectUnauthenticated(error)) {
            return sdkDispatchAuthMessage(getCachedServerSdkMessageContext());
        }
        if (error instanceof Error) {
            return error.message;
        }
        return "Runtime stream failed";
    };
    isRecoverableRuntimeConnectError = function(error) {
        return isConnectCanceled(error) || isConnectUnauthenticated(error);
    };
    attachRecoverableConnectHandler = function(promise) {
        void promise.catch((error)=>{
            if (isRecoverableRuntimeConnectError(error)) {
                return;
            }
        });
    };
    cancelRunIgnoringConnectAbort = async function(run) {
        const promise = run.cancel();
        attachRecoverableConnectHandler(promise);
        try {
            await promise;
        } catch (error) {
            if (isConnectCanceled(error)) {
                return;
            }
            throw error;
        }
    };
    let sqliteAvailablePromise = null;
    const jsonlStores = new Map();
    async function nodeSqliteAvailable() {
        if (!sqliteAvailablePromise) {
            sqliteAvailablePromise = import('node:sqlite').then(async (m)=>{
                await m.__tla;
                return m;
            }).then(()=>true).catch(()=>false);
        }
        return sqliteAvailablePromise;
    }
    resolveLocalAgentStore = async function(workspaceCwd) {
        if (await nodeSqliteAvailable()) {
            return void 0;
        }
        const key = workspaceCwd.trim();
        const existing = jsonlStores.get(key);
        if (existing) {
            return existing;
        }
        const { getDefaultSdkStateRoot, JsonlLocalAgentStore } = await import('@cursor/sdk').then(async (m)=>{
            await m.__tla;
            return m;
        });
        const store = new JsonlLocalAgentStore(getDefaultSdkStateRoot(key));
        jsonlStores.set(key, store);
        runtimeLogger.info("runtime.sdk.local_store.jsonl", {
            reason: "node:sqlite_unavailable",
            workspace_cwd: key,
            state_root: getDefaultSdkStateRoot(key)
        });
        return store;
    };
    resolveRuntimeApiKey = function() {
        const runtimeKey = process.env.RUNTIME_API_KEY?.trim();
        if (runtimeKey) {
            return runtimeKey;
        }
        return process.env.CURSOR_API_KEY?.trim() || void 0;
    };
    ensureRuntimeApiKeyInProcessEnv = function() {
        const apiKey = resolveRuntimeApiKey();
        if (!apiKey) {
            return void 0;
        }
        for (const key of [
            "RUNTIME_API_KEY",
            "CURSOR_API_KEY"
        ]){
            if (process.env[key]?.trim() !== apiKey) {
                process.env[key] = apiKey;
            }
        }
        return apiKey;
    };
    function hasRuntimeApiKey() {
        return Boolean(resolveRuntimeApiKey());
    }
    hasRuntimeSdkCredentials = function() {
        return hasRuntimeApiKey();
    };
    function requireRuntimeApiKey() {
        const apiKey = resolveRuntimeApiKey();
        if (!apiKey) {
            throw new Error("RUNTIME_API_KEY is required");
        }
        return apiKey;
    }
    localGetRunOptions = async function(cwd) {
        requireRuntimeApiKey();
        const store = await resolveLocalAgentStore(cwd);
        return {
            runtime: "local",
            cwd,
            ...store ? {
                store
            } : {}
        };
    };
    const DEFAULT_AUTH_COOLDOWN_MS = 6e4;
    let authBlockedUntil = 0;
    markRuntimeAuthUnavailable = function(reason, cooldownMs = DEFAULT_AUTH_COOLDOWN_MS) {
        authBlockedUntil = Date.now() + cooldownMs;
    };
    clearRuntimeAuthGate = function() {
        authBlockedUntil = 0;
    };
    canAttemptRuntimeSdkCall = function() {
        return Date.now() >= authBlockedUntil;
    };
    async function loadServerSdkMessageContext() {
        try {
            const projectRoot = resolveProjectRoot();
            const uiConfig = await loadUIConfig(projectRoot);
            const ctx = resolveServerSdkMessageContext({
                distributionSurface: uiConfig.distribution?.surface,
                presentationTitle: getPresentationTitle(uiConfig)
            });
            cacheServerSdkMessageContext(ctx);
            return ctx;
        } catch  {
            const ctx = resolveServerSdkMessageContext();
            cacheServerSdkMessageContext(ctx);
            return ctx;
        }
    }
    const probeCache = new Map();
    const DEFAULT_CACHE_TTL_MS = 3e4;
    const DEFAULT_PROBE_TIMEOUT_MS = 15e3;
    function resolveProbeTimeoutMs() {
        const raw = process.env.CONTROL_PLANE_SDK_PROBE_TIMEOUT_MS?.trim();
        const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
        return DEFAULT_PROBE_TIMEOUT_MS;
    }
    function mapProbeFailure(error, startedAt, ctx) {
        const checked_at = (new Date()).toISOString();
        const latency_ms = Date.now() - startedAt;
        const fields = errorFields(error);
        if (error instanceof AuthenticationError || isConnectUnauthenticated(error) || error instanceof ConnectError && error.code === Code.Unauthenticated) {
            return {
                ready: false,
                checked_at,
                cursor_api_key: "present",
                auth: "failed",
                network: "ok",
                latency_ms,
                message: sdkAuthFailedMessage(ctx),
                error_name: fields.error_name,
                error_code: "auth_failed"
            };
        }
        if (error instanceof NetworkError) {
            return {
                ready: false,
                checked_at,
                cursor_api_key: "present",
                auth: "skipped",
                network: "failed",
                latency_ms,
                message: sdkNetworkFailedMessage(ctx),
                error_name: fields.error_name,
                error_code: "network_failed"
            };
        }
        const message = error instanceof Error ? error.message : String(error);
        const isTimeout = /timed out/i.test(message);
        return {
            ready: false,
            checked_at,
            cursor_api_key: "present",
            auth: "skipped",
            network: "failed",
            latency_ms,
            message: isTimeout ? sdkTimeoutMessage(ctx) : sdkUnknownFailureMessage(ctx, message),
            error_name: fields.error_name,
            error_code: isTimeout ? "timeout" : "unknown"
        };
    }
    async function probeLocalRuntimeExecution(workspaceCwd, timeoutMs, ctx, startedAt) {
        const apiKey = requireRuntimeApiKey();
        ensureRuntimeApiKeyInProcessEnv();
        const store = await resolveLocalAgentStore(workspaceCwd);
        const { Agent } = await import('@cursor/sdk').then(async (m)=>{
            await m.__tla;
            return m;
        });
        const promptPromise = Agent.prompt("Reply with exactly: OK", {
            apiKey,
            model: {
                id: process.env.CURSOR_RUNTIME_MODEL?.trim() || "composer-2.5"
            },
            local: {
                cwd: workspaceCwd,
                settingSources: [],
                ...store ? {
                    store
                } : {}
            }
        });
        try {
            const result = await Promise.race([
                promptPromise,
                new Promise((_, reject)=>{
                    setTimeout(()=>reject(new Error("Local runtime execution probe timed out")), timeoutMs);
                })
            ]);
            if (result.status !== "finished") {
                const failureDetail = result.result?.trim() || result.error?.message?.trim() || result.error?.code?.trim() || "Local runtime execution probe failed";
                const authFailed = isRunAuthFailureText(failureDetail);
                return {
                    ready: false,
                    checked_at: (new Date()).toISOString(),
                    cursor_api_key: "present",
                    auth: authFailed ? "failed" : "skipped",
                    network: "ok",
                    latency_ms: Date.now() - startedAt,
                    message: authFailed ? sdkRuntimeReconnectingMessage(ctx) : sdkUnknownFailureMessage(ctx, failureDetail),
                    error_code: authFailed ? "auth_failed" : "unknown"
                };
            }
            return null;
        } catch (error) {
            const checked_at = (new Date()).toISOString();
            const latency_ms = Date.now() - startedAt;
            const fields = errorFields(error);
            const rawMessage = error instanceof Error ? error.message : String(error);
            const authFailed = error instanceof AuthenticationError || isConnectUnauthenticated(error) || isRunAuthFailureText(rawMessage);
            if (authFailed) {
                const message = sdkRuntimeReconnectingMessage(ctx);
                return {
                    ready: false,
                    checked_at,
                    cursor_api_key: "present",
                    auth: "failed",
                    network: "ok",
                    latency_ms,
                    message,
                    error_name: fields.error_name,
                    error_code: "auth_failed"
                };
            }
            runtimeLogger.warn("runtime.sdk.execution_probe.failed", {
                workspace_cwd: workspaceCwd,
                ...fields
            });
            return null;
        } finally{
            void promptPromise.catch(()=>void 0);
        }
    }
    probeSdkDispatchHealth = async function(options) {
        const cacheKey = options?.cacheKey ?? "global";
        const now = Date.now();
        const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
        if (!options?.force) {
            const cached = probeCache.get(cacheKey);
            if (cached && cached.expiresAt > now) {
                return cached.health;
            }
        }
        const startedAt = Date.now();
        const checked_at = (new Date()).toISOString();
        const messageContext = await loadServerSdkMessageContext();
        try {
            requireRuntimeApiKey();
            ensureRuntimeApiKeyInProcessEnv();
        } catch  {
            const health = {
                ready: false,
                checked_at,
                cursor_api_key: "missing",
                auth: "skipped",
                network: "skipped",
                latency_ms: null,
                message: sdkMissingApiKeyMessage(messageContext),
                error_code: "missing_api_key"
            };
            probeCache.set(cacheKey, {
                health,
                expiresAt: now + cacheTtlMs
            });
            return health;
        }
        const timeoutMs = options?.timeoutMs ?? resolveProbeTimeoutMs();
        const apiKey = requireRuntimeApiKey();
        const mePromise = Cursor.me({
            apiKey
        });
        let probeTimer;
        try {
            const me = await Promise.race([
                mePromise,
                new Promise((_, reject)=>{
                    probeTimer = setTimeout(()=>reject(new Error("SDK probe timed out")), timeoutMs);
                })
            ]);
            const health = {
                ready: true,
                checked_at,
                cursor_api_key: "present",
                auth: "ok",
                network: "ok",
                latency_ms: Date.now() - startedAt,
                account: {
                    apiKeyName: me.apiKeyName
                },
                message: null
            };
            const workspaceCwd = options?.probeLocalExecution === true ? options?.workspaceCwd?.trim() : void 0;
            if (workspaceCwd) {
                const localFailure = await probeLocalRuntimeExecution(workspaceCwd, timeoutMs, messageContext, startedAt);
                if (localFailure) {
                    markRuntimeAuthUnavailable("probe_local_auth_failed");
                    probeCache.set(cacheKey, {
                        health: localFailure,
                        expiresAt: now + Math.min(cacheTtlMs, 1e4)
                    });
                    runtimeLogger.warn("runtime.sdk.probe.local_auth_failed", {
                        workspace_cwd: workspaceCwd,
                        latency_ms: localFailure.latency_ms
                    });
                    return localFailure;
                }
            }
            probeCache.set(cacheKey, {
                health,
                expiresAt: now + cacheTtlMs
            });
            clearRuntimeAuthGate();
            runtimeLogger.info("runtime.sdk.probe.ok", {
                latency_ms: health.latency_ms,
                account: me.apiKeyName
            });
            return health;
        } catch (error) {
            const health = mapProbeFailure(error, startedAt, messageContext);
            if (health.error_code === "auth_failed") {
                markRuntimeAuthUnavailable();
            }
            probeCache.set(cacheKey, {
                health,
                expiresAt: now + Math.min(cacheTtlMs, 1e4)
            });
            runtimeLogger.warn("runtime.sdk.probe.failed", {
                error_code: health.error_code,
                ...errorFields(error)
            });
            return health;
        } finally{
            if (probeTimer) {
                clearTimeout(probeTimer);
            }
            void mePromise.catch(()=>void 0);
        }
    };
    invalidateSdkProbeCache = function(cacheKey) {
        if (cacheKey) {
            probeCache.delete(cacheKey);
            return;
        }
        probeCache.clear();
    };
})();
export { canAttemptRuntimeSdkCall as a, invalidateSdkProbeCache as b, cancelRunIgnoringConnectAbort as c, resolveLocalAgentStore as d, ensureRuntimeApiKeyInProcessEnv as e, clearRuntimeAuthGate as f, isRecoverableRuntimeConnectError as g, isConnectCanceled as h, isConnectUnauthenticated as i, attachRecoverableConnectHandler as j, hasRuntimeSdkCredentials as k, formatRuntimeConnectError as l, markRuntimeAuthUnavailable as m, localGetRunOptions as n, probeSdkDispatchHealth as p, resolveRuntimeApiKey as r, __tla };
