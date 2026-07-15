import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { g as getComposioApiKey, l as listConnectedAccountsForToolkit, a as getConnectedAccountDetails, d as deleteConnectedAccount, p as purgeAllConnectedAccountsForToolkit, t as toolkitSlugFromSlotId, b as parseComposioAuthContract, e as composioConnectAvailable, __tla as __tla_0 } from './composio-auth-config_B4-JkaML.mjs';
import { Composio, SessionPreset } from '@composio/core';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { i as isDesktopKeychainContext, b as desktopKeychainHas, c as desktopKeychainSet } from './runtime-credentials-activate_BGtjWMAg.mjs';
import { p as probeCredentialPresence, s as storeCredential } from './credential-store_CCdb2qUf.mjs';
let ComposioSubdomainMalformedError, isComposioSlotCredentialVerified, isComposioSlotConnected, isComposioSlotConnectable, disconnectComposioSlot, loadComposioConnectionDataForSlot, readStoredConnectedAccountId, composioConnectionEnvVar, composioTenantConnectionData, invalidateComposioCredentialProbeCache, loadIntegrationComposioConfig, pollAndStoreComposioConnection, resolveComposioUserId, verifyComposioSlotRemote;
let __tla = Promise.all([
    (()=>{
        try {
            return __tla_0;
        } catch  {}
    })()
]).then(async ()=>{
    const PROBE_CACHE_TTL_MS = 6e4;
    const probeCache = new Map();
    function parseProbeResult(payload) {
        try {
            const outer = JSON.parse(payload);
            if (typeof outer.data?.valid === "boolean") {
                return outer.data.valid;
            }
            if (outer.data?.status_code === 401 || outer.data?.status_code === 403) {
                return false;
            }
            if (typeof outer.error === "string" && /unauthorized|invalid credentials/i.test(outer.error)) {
                return false;
            }
            return outer.successful === true && !outer.error;
        } catch  {
            return !/invalid credentials|unauthorized|no active connection/i.test(payload);
        }
    }
    async function callProbeTool(options) {
        const response = await fetch(options.mcpUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
                ...options.mcpHeaders
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: {
                    name: options.toolName,
                    arguments: {}
                }
            })
        });
        const text = await response.text();
        const dataLine = text.split("\n").find((line)=>line.startsWith("data: "))?.slice("data: ".length);
        const inner = dataLine ? JSON.parse(dataLine).result?.content?.[0]?.text ?? text : text;
        return parseProbeResult(inner);
    }
    async function probeComposioToolkitCredential(options) {
        const apiKey = getComposioApiKey();
        if (!apiKey) {
            return false;
        }
        const toolkit = options.toolkit.trim().toLowerCase();
        const probeTools = (options.probeTools ?? []).map((tool)=>tool.trim()).filter(Boolean);
        if (probeTools.length === 0) {
            return false;
        }
        const cacheKey = `${options.userId}:${toolkit}:${options.connectedAccountId}:${probeTools.join(",")}`;
        const cached = probeCache.get(cacheKey);
        if (cached && cached.loadedAt + PROBE_CACHE_TTL_MS > Date.now()) {
            return cached.valid;
        }
        try {
            const composio = new Composio({
                apiKey
            });
            const session = await composio.sessions.create(options.userId, {
                toolkits: [
                    toolkit
                ],
                sessionPreset: SessionPreset.DIRECT_TOOLS,
                mcp: true,
                connectedAccounts: {
                    [toolkit]: options.connectedAccountId
                }
            });
            const mcpUrl = session.mcp?.url;
            const mcpHeaders = session.mcp?.headers;
            if (!mcpUrl || !mcpHeaders) {
                return false;
            }
            const headers = mcpHeaders;
            for (const toolName of probeTools){
                const valid = await callProbeTool({
                    mcpUrl,
                    mcpHeaders: headers,
                    toolName
                });
                if (!valid) {
                    probeCache.set(cacheKey, {
                        valid: false,
                        loadedAt: Date.now()
                    });
                    return false;
                }
            }
            probeCache.set(cacheKey, {
                valid: true,
                loadedAt: Date.now()
            });
            return true;
        } catch  {
            return false;
        }
    }
    invalidateComposioCredentialProbeCache = function() {
        probeCache.clear();
    };
    function isRecord$1(value) {
        return typeof value === "object" && value !== null;
    }
    function isMalformedAtlassianSubdomain(subdomain) {
        return /\.atlassian\.net/i.test(subdomain.trim());
    }
    function atlassianSubdomainFromSite(site) {
        const trimmed = site.trim();
        if (!trimmed) {
            return void 0;
        }
        try {
            const hostname = trimmed.includes("://") ? new URL(trimmed).hostname : trimmed;
            const match = hostname.match(/^([a-z0-9-]+)\.atlassian\.net$/i);
            return match?.[1]?.toLowerCase();
        } catch  {
            const match = trimmed.match(/^([a-z0-9-]+)\.atlassian\.net$/i);
            return match?.[1]?.toLowerCase();
        }
    }
    loadComposioConnectionDataForSlot = async function(options) {
        const composioConfig = await loadIntegrationComposioConfig(options.slotId, options.provider, options.workspaceRoot);
        if (!composioConfig?.enabled) {
            return void 0;
        }
        const binding = await resolveHarnessBinding(options.workspaceRoot ? {
            workspaceRoot: options.workspaceRoot
        } : {});
        const bizPath = join(binding.harnessRoot, "business.yaml");
        let bizRaw;
        try {
            bizRaw = parse(await readFile(bizPath, "utf8"));
        } catch  {
            return void 0;
        }
        if (!isRecord$1(bizRaw) || !isRecord$1(bizRaw.integrations)) {
            return void 0;
        }
        const slot = bizRaw.integrations[options.slotId];
        if (!isRecord$1(slot) || typeof slot.config !== "string") {
            return void 0;
        }
        const configPath = join(binding.harnessRoot, slot.config.replace(/^\/?\.business\//, ""));
        let integrationRaw;
        try {
            integrationRaw = parse(await readFile(configPath, "utf8"));
        } catch  {
            return void 0;
        }
        if (!isRecord$1(integrationRaw)) {
            return void 0;
        }
        const tenantScope = integrationRaw.tenant_scope;
        if (!isRecord$1(tenantScope)) {
            return void 0;
        }
        const toolkit = composioConfig.toolkit;
        if (toolkit === "confluence" || toolkit === "jira") {
            const site = (typeof tenantScope.site === "string" ? tenantScope.site : null) ?? (typeof tenantScope.site_url === "string" ? tenantScope.site_url : null) ?? (typeof tenantScope.wiki_base === "string" ? tenantScope.wiki_base : null);
            if (!site) {
                return void 0;
            }
            const subdomain = atlassianSubdomainFromSite(site);
            if (!subdomain) {
                return void 0;
            }
            return {
                subdomain
            };
        }
        return void 0;
    };
    composioTenantConnectionData = Object.freeze(Object.defineProperty({
        __proto__: null,
        atlassianSubdomainFromSite,
        isMalformedAtlassianSubdomain,
        loadComposioConnectionDataForSlot
    }, Symbol.toStringTag, {
        value: 'Module'
    }));
    const COMPOSIO_API_BASE = "https://backend.composio.dev/api/v3";
    ComposioSubdomainMalformedError = class extends Error {
        constructor(expectedSubdomain, receivedSubdomain){
            super(`Confluence subdomain must be "${expectedSubdomain}" — not "${receivedSubdomain}". On the Composio page enter only the site slug before .atlassian.net.`);
            this.expectedSubdomain = expectedSubdomain;
            this.receivedSubdomain = receivedSubdomain;
            this.name = "ComposioSubdomainMalformedError";
        }
        expectedSubdomain;
        receivedSubdomain;
        code = "composio_subdomain_malformed";
    };
    function normalizeComposioProjectId(projectId) {
        const trimmed = projectId?.trim();
        return trimmed && trimmed.length > 0 ? trimmed : "default";
    }
    function legacyComposioConnectionEnvVar(slotId) {
        return `COMPOSIO_CONNECTED_${slotId.trim().replace(/\./g, "_").toUpperCase()}`;
    }
    composioConnectionEnvVar = function(slotId, projectId) {
        const project = normalizeComposioProjectId(projectId).replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
        const slot = slotId.trim().replace(/\./g, "_").toUpperCase();
        return `COMPOSIO_CONNECTED_${project}_${slot}`;
    };
    function composioConnectionEnvVarCandidates(slotId, projectId) {
        const scoped = composioConnectionEnvVar(slotId, projectId);
        const candidates = [
            scoped
        ];
        if (normalizeComposioProjectId(projectId) === "default") {
            const legacy = legacyComposioConnectionEnvVar(slotId);
            if (legacy !== scoped) {
                candidates.push(legacy);
            }
        }
        return candidates;
    }
    resolveComposioUserId = function(workspaceId, operatorId = "local-operator") {
        const normalizedWorkspace = workspaceId.trim() || "default";
        return `${normalizedWorkspace}:${operatorId.trim() || "local-operator"}`;
    };
    function isRecord(value) {
        return typeof value === "object" && value !== null;
    }
    loadIntegrationComposioConfig = async function(slotId, provider, workspaceRoot) {
        const binding = await resolveHarnessBinding(workspaceRoot ? {
            workspaceRoot
        } : {});
        const root = binding.harnessRoot;
        const bizPath = join(root, "business.yaml");
        let bizRaw;
        try {
            bizRaw = parse(await readFile(bizPath, "utf8"));
        } catch  {
            return null;
        }
        if (!isRecord(bizRaw)) {
            return null;
        }
        const integrations = bizRaw.integrations;
        if (!isRecord(integrations)) {
            return null;
        }
        const slot = integrations[slotId];
        if (!isRecord(slot)) {
            return null;
        }
        const configRel = slot.config;
        if (typeof configRel !== "string") {
            return null;
        }
        const configPath = join(root, configRel.replace(/^\/?\.business\//, ""));
        let integrationRaw;
        try {
            integrationRaw = parse(await readFile(configPath, "utf8"));
        } catch  {
            return null;
        }
        if (!isRecord(integrationRaw)) {
            return null;
        }
        const composioOAuth = integrationRaw.composio_oauth;
        if (!isRecord(composioOAuth) || composioOAuth.enabled !== true) {
            return null;
        }
        const toolkit = typeof composioOAuth.toolkit === "string" ? composioOAuth.toolkit.trim().toLowerCase() : toolkitSlugFromSlotId(slotId, provider);
        const intermediary = typeof composioOAuth.intermediary === "string" && composioOAuth.intermediary.trim().toLowerCase() === "composio" ? "composio" : "composio";
        const authContract = parseComposioAuthContract(composioOAuth);
        return {
            enabled: true,
            toolkit,
            intermediary,
            authContract
        };
    };
    isComposioSlotConnectable = async function(slotId, provider, workspaceRoot) {
        const config = await loadIntegrationComposioConfig(slotId, provider, workspaceRoot);
        if (!config?.enabled) {
            return false;
        }
        return composioConnectAvailable(config.toolkit);
    };
    isComposioSlotConnected = async function(slotId, projectId) {
        for (const envVar of composioConnectionEnvVarCandidates(slotId, projectId)){
            if (isDesktopKeychainContext()) {
                if (await desktopKeychainHas(envVar)) {
                    return true;
                }
                continue;
            }
            const presence = await probeCredentialPresence([
                {
                    env_var: envVar,
                    storage: "composio_connection",
                    required: true,
                    description: "Composio connection"
                }
            ], "");
            if (presence[0]?.present === true) {
                return true;
            }
        }
        return false;
    };
    readStoredConnectedAccountId = async function(slotId, projectId) {
        for (const envVar of composioConnectionEnvVarCandidates(slotId, projectId)){
            if (isDesktopKeychainContext()) {
                const { desktopKeychainGet } = await import('./runtime-credentials-activate_BGtjWMAg.mjs').then((n)=>n.f);
                const value = await desktopKeychainGet(envVar);
                if (value?.trim()) {
                    return value.trim();
                }
                continue;
            }
            const script = `
import sys
from _business_secrets import keychain_get
print(keychain_get(sys.argv[1]) or "")
`;
            const { execFile } = await import('node:child_process').then(async (m)=>{
                await m.__tla;
                return m;
            });
            const { promisify } = await import('node:util').then(async (m)=>{
                await m.__tla;
                return m;
            });
            const { resolveAppRoot } = await import('./workspace-manager_C2YuGzrP.mjs').then((n)=>n.o);
            const execFileAsync = promisify(execFile);
            try {
                const { stdout } = await execFileAsync("python3", [
                    "-c",
                    script,
                    envVar
                ], {
                    cwd: resolveAppRoot(),
                    maxBuffer: 1024 * 1024,
                    env: credentialProbeEnv()
                });
                const value = stdout.trim();
                if (value.length > 0) {
                    return value;
                }
            } catch  {}
        }
        return null;
    };
    function credentialProbeEnv() {
        const bundleId = process.env.JAMBU_HOST_BUNDLE_ID?.trim() || process.env.TAURI_BUNDLE_IDENTIFIER?.trim() || "";
        if (!bundleId) {
            return process.env;
        }
        return {
            ...process.env,
            JAMBU_HOST_BUNDLE_ID: bundleId,
            TAURI_BUNDLE_IDENTIFIER: bundleId
        };
    }
    async function storeComposioConnection(slotId, connectedAccountId, projectId) {
        const envVar = composioConnectionEnvVar(slotId, projectId);
        if (isDesktopKeychainContext()) {
            await desktopKeychainSet(envVar, connectedAccountId);
            const { writeCredentialMetadata } = await import('./runtime-credentials-activate_BGtjWMAg.mjs').then((n)=>n.f);
            await writeCredentialMetadata(envVar);
            return;
        }
        await storeCredential(envVar, connectedAccountId);
    }
    async function clearStoredComposioConnection(slotId, projectId) {
        for (const envVar of composioConnectionEnvVarCandidates(slotId, projectId)){
            if (isDesktopKeychainContext()) {
                const { desktopKeychainDelete } = await import('./runtime-credentials-activate_BGtjWMAg.mjs').then((n)=>n.f);
                await desktopKeychainDelete(envVar);
                continue;
            }
            const script = `
import sys
from _business_secrets import keychain_delete
keychain_delete(sys.argv[1])
`;
            const { execFile } = await import('node:child_process').then(async (m)=>{
                await m.__tla;
                return m;
            });
            const { promisify } = await import('node:util').then(async (m)=>{
                await m.__tla;
                return m;
            });
            const { resolveAppRoot } = await import('./workspace-manager_C2YuGzrP.mjs').then((n)=>n.o);
            const execFileAsync = promisify(execFile);
            await execFileAsync("python3", [
                "-c",
                script,
                envVar
            ], {
                cwd: resolveAppRoot(),
                maxBuffer: 1024 * 1024,
                env: credentialProbeEnv()
            }).catch(()=>void 0);
        }
    }
    verifyComposioSlotRemote = async function(options) {
        const userId = resolveComposioUserId(options.projectId);
        const connectedAccountId = await readStoredConnectedAccountId(options.slotId, options.projectId);
        const connectedLocally = Boolean(connectedAccountId);
        if (!connectedAccountId) {
            return {
                connectedLocally: false,
                connectedAccountId: null,
                remoteActive: false,
                credentialValid: null,
                userId,
                status: null,
                failureReason: null,
                expectedSubdomain: null,
                storedSubdomain: null
            };
        }
        const composioConfig = await loadIntegrationComposioConfig(options.slotId, options.provider, options.workspaceRoot);
        const toolkit = composioConfig?.toolkit ?? toolkitSlugFromSlotId(options.slotId, options.provider);
        const connectionData = await loadComposioConnectionDataForSlot({
            slotId: options.slotId,
            provider: options.provider,
            workspaceRoot: options.workspaceRoot
        });
        const expectedSubdomain = connectionData?.subdomain ?? null;
        const accountDetails = await getConnectedAccountDetails(connectedAccountId);
        const storedSubdomain = accountDetails?.subdomain ?? null;
        if (storedSubdomain && isMalformedAtlassianSubdomain(storedSubdomain)) {
            return {
                connectedLocally: true,
                connectedAccountId,
                remoteActive: true,
                credentialValid: false,
                userId,
                status: accountDetails?.status ?? "ACTIVE",
                failureReason: "subdomain_malformed",
                expectedSubdomain,
                storedSubdomain
            };
        }
        const apiKey = getComposioApiKey();
        if (!apiKey) {
            return {
                connectedLocally,
                connectedAccountId,
                remoteActive: false,
                credentialValid: null,
                userId,
                status: "api_key_missing",
                failureReason: null,
                expectedSubdomain,
                storedSubdomain
            };
        }
        try {
            const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts/${connectedAccountId}`, {
                headers: {
                    "x-api-key": apiKey
                }
            });
            if (!response.ok) {
                if (response.status === 404) {
                    await clearStoredComposioConnection(options.slotId, options.projectId);
                    return {
                        connectedLocally: false,
                        connectedAccountId: null,
                        remoteActive: false,
                        credentialValid: null,
                        userId,
                        status: "account_deleted",
                        failureReason: null,
                        expectedSubdomain,
                        storedSubdomain: null
                    };
                }
                return {
                    connectedLocally,
                    connectedAccountId,
                    remoteActive: false,
                    credentialValid: null,
                    userId,
                    status: `http_${response.status}`,
                    failureReason: "remote_inactive",
                    expectedSubdomain,
                    storedSubdomain
                };
            }
            const body = await response.json();
            const remoteActive = body.status?.toUpperCase() === "ACTIVE" && body.user_id === userId && (body.toolkit?.slug?.toLowerCase() ?? toolkit) === toolkit;
            let credentialValid = null;
            let failureReason = null;
            if (remoteActive && connectedAccountId && !options.skipCredentialProbe) {
                credentialValid = await probeComposioToolkitCredential({
                    userId,
                    toolkit,
                    connectedAccountId,
                    probeTools: composioConfig?.authContract?.probeTools
                });
                if (credentialValid === false) {
                    failureReason = "credential_invalid";
                }
            } else if (remoteActive && options.skipCredentialProbe) {
                credentialValid = null;
            } else if (!remoteActive) {
                failureReason = "remote_inactive";
            }
            return {
                connectedLocally,
                connectedAccountId,
                remoteActive,
                credentialValid,
                userId,
                status: body.status ?? null,
                failureReason,
                expectedSubdomain,
                storedSubdomain
            };
        } catch  {
            return {
                connectedLocally,
                connectedAccountId,
                remoteActive: false,
                credentialValid: null,
                userId,
                status: "probe_failed",
                failureReason: "remote_inactive",
                expectedSubdomain,
                storedSubdomain
            };
        }
    };
    isComposioSlotCredentialVerified = function(remote) {
        return remote.remoteActive && remote.credentialValid === true;
    };
    pollAndStoreComposioConnection = async function(options) {
        const composioConfig = await loadIntegrationComposioConfig(options.slotId, options.provider, options.workspaceRoot);
        if (!composioConfig?.enabled) {
            throw new Error(`Slot ${options.slotId} is not configured for Composio OAuth`);
        }
        const maxAttempts = options.maxAttempts ?? 15;
        const intervalMs = options.intervalMs ?? 2e3;
        for(let attempt = 0; attempt < maxAttempts; attempt += 1){
            const account = await listConnectedAccountsForToolkit({
                userId: options.userId,
                toolkitSlug: composioConfig.toolkit
            });
            if (account?.id && account.status?.toUpperCase() === "ACTIVE") {
                const details = await getConnectedAccountDetails(account.id);
                const connectionData = await loadComposioConnectionDataForSlot({
                    slotId: options.slotId,
                    provider: options.provider,
                    workspaceRoot: options.workspaceRoot
                });
                const expectedSubdomain = connectionData?.subdomain;
                const storedSubdomain = details?.subdomain;
                if (storedSubdomain && isMalformedAtlassianSubdomain(storedSubdomain)) {
                    await deleteConnectedAccount(account.id);
                    if (expectedSubdomain) {
                        throw new ComposioSubdomainMalformedError(expectedSubdomain, storedSubdomain);
                    }
                    throw new Error(`Composio stored subdomain "${storedSubdomain}" is invalid — enter only the slug before .atlassian.net.`);
                }
                await storeComposioConnection(options.slotId, account.id, options.projectId);
                await purgeAllConnectedAccountsForToolkit({
                    userId: options.userId,
                    toolkitSlug: composioConfig.toolkit,
                    exceptAccountId: account.id
                });
                return {
                    connectedAccountId: account.id,
                    toolkit: composioConfig.toolkit
                };
            }
            if (attempt < maxAttempts - 1) {
                await new Promise((resolve)=>setTimeout(resolve, intervalMs));
            }
        }
        throw new Error(`Composio connection for ${composioConfig.toolkit} did not become ACTIVE in time`);
    };
    disconnectComposioSlot = async function(slotId, userId, toolkitSlug, projectId) {
        const connectedAccountId = await readStoredConnectedAccountId(slotId, projectId);
        const apiKey = getComposioApiKey();
        if (apiKey && toolkitSlug) {
            await purgeAllConnectedAccountsForToolkit({
                userId,
                toolkitSlug
            });
        } else if (apiKey && connectedAccountId) {
            await deleteConnectedAccount(connectedAccountId);
        }
        if (isDesktopKeychainContext()) {
            const { desktopKeychainDelete } = await import('./runtime-credentials-activate_BGtjWMAg.mjs').then((n)=>n.f);
            for (const envVar of composioConnectionEnvVarCandidates(slotId, projectId)){
                await desktopKeychainDelete(envVar);
            }
        } else {
            await clearStoredComposioConnection(slotId, projectId);
        }
    };
});
export { ComposioSubdomainMalformedError as C, isComposioSlotCredentialVerified as a, isComposioSlotConnected as b, isComposioSlotConnectable as c, disconnectComposioSlot as d, loadComposioConnectionDataForSlot as e, readStoredConnectedAccountId as f, composioConnectionEnvVar as g, composioTenantConnectionData as h, invalidateComposioCredentialProbeCache as i, loadIntegrationComposioConfig as l, pollAndStoreComposioConnection as p, resolveComposioUserId as r, verifyComposioSlotRemote as v, __tla };
