let getConnectedAccountDetails, parseComposioAuthContract, createComposioConnectLink, deleteConnectedAccount, composioConnectAvailable, getComposioApiKey, invalidateAuthConfigCache, listConnectedAccountsForToolkit, purgeAllConnectedAccountsForToolkit, toolkitSlugFromSlotId;
let __tla = (async ()=>{
    function isRecord(value) {
        return typeof value === "object" && value !== null;
    }
    function asStringArray(value) {
        if (!Array.isArray(value)) {
            return [];
        }
        return value.filter((item)=>typeof item === "string").map((item)=>item.trim()).filter(Boolean);
    }
    function parseScopeGroups(raw) {
        if (!Array.isArray(raw)) {
            return [];
        }
        const groups = [];
        for (const entry of raw){
            if (Array.isArray(entry)) {
                const scopes = asStringArray(entry);
                if (scopes.length > 0) {
                    groups.push(scopes);
                }
                continue;
            }
            if (isRecord(entry) && Array.isArray(entry.any_of)) {
                const scopes = asStringArray(entry.any_of);
                if (scopes.length > 0) {
                    groups.push(scopes);
                }
            }
        }
        return groups;
    }
    parseComposioAuthContract = function(composioOAuth) {
        const raw = composioOAuth.auth_contract;
        if (!isRecord(raw)) {
            return null;
        }
        const version = typeof raw.version === "string" ? raw.version.trim() : "1.0";
        const intermediary = typeof raw.intermediary === "string" && raw.intermediary.trim().toLowerCase() === "composio" ? "composio" : "composio";
        const toolsForAuthConfig = asStringArray(raw.tools_for_auth_config);
        const probeTools = asStringArray(raw.probe_tools);
        const scopeGroups = parseScopeGroups(raw.scope_groups);
        if (toolsForAuthConfig.length === 0 && probeTools.length === 0 && scopeGroups.length === 0) {
            return null;
        }
        return {
            version,
            intermediary,
            toolsForAuthConfig: toolsForAuthConfig.length > 0 ? toolsForAuthConfig : [
                ...probeTools
            ],
            probeTools: probeTools.length > 0 ? probeTools : [
                ...toolsForAuthConfig
            ],
            scopeGroups
        };
    };
    function normalizeOAuthScopes(scopes) {
        if (!scopes) {
            return [];
        }
        if (Array.isArray(scopes)) {
            return scopes.map((scope)=>scope.trim()).filter(Boolean);
        }
        return scopes.split(/[,\s]+/).map((scope)=>scope.trim()).filter(Boolean);
    }
    function authContractSatisfiesGrantedScopes(contract, grantedScopes) {
        if (!contract || contract.scopeGroups.length === 0) {
            return true;
        }
        const granted = new Set(normalizeOAuthScopes(grantedScopes));
        return contract.scopeGroups.every((group)=>group.some((scope)=>granted.has(scope)));
    }
    function authContractCacheKey(contract) {
        if (!contract) {
            return "default";
        }
        const tools = [
            ...contract.toolsForAuthConfig
        ].sort().join(",");
        const groups = contract.scopeGroups.map((g)=>[
                ...g
            ].sort().join("|")).join(";");
        return `${contract.version}:${tools}:${groups}`;
    }
    const COMPOSIO_API_BASE = "https://backend.composio.dev/api/v3";
    const AUTH_CONFIG_CACHE_TTL_MS = 60 * 60 * 1e3;
    const HARNESS_AUTH_CONFIG_NAME_PREFIX = "harness-";
    const authConfigCache = new Map();
    getComposioApiKey = function() {
        return process.env.COMPOSIO_API_KEY?.trim() || void 0;
    };
    toolkitSlugFromSlotId = function(slotId, provider) {
        const fromProvider = provider?.trim().toLowerCase();
        if (fromProvider) {
            return fromProvider;
        }
        const segment = slotId.split(".").pop()?.trim().toLowerCase();
        return segment || slotId.trim().toLowerCase();
    };
    composioConnectAvailable = function(toolkitSlug) {
        return Boolean(getComposioApiKey() && toolkitSlug.trim());
    };
    function extractAuthConfigId(record) {
        return record.auth_config?.id ?? record.auth_config_id ?? record.id;
    }
    function authConfigHasCriticalScopes(authContract, scopes) {
        return authContractSatisfiesGrantedScopes(authContract, scopes);
    }
    async function fetchAuthConfigDetail(apiKey, authConfigId) {
        const response = await fetch(`${COMPOSIO_API_BASE}/auth_configs/${authConfigId}`, {
            headers: {
                "x-api-key": apiKey
            }
        });
        const body = await response.json();
        if (!response.ok || !body.id) {
            return null;
        }
        return body;
    }
    async function listManagedAuthConfigSummaries(apiKey, toolkitSlug) {
        const query = new URLSearchParams({
            toolkit_slug: toolkitSlug,
            is_composio_managed: "true",
            limit: "20"
        });
        const response = await fetch(`${COMPOSIO_API_BASE}/auth_configs?${query.toString()}`, {
            headers: {
                "x-api-key": apiKey
            }
        });
        const body = await response.json();
        if (!response.ok) {
            throw new Error(body.error ?? `Composio auth_configs list failed (${response.status})`);
        }
        return (body.items ?? []).map((item)=>{
            const id = extractAuthConfigId(item);
            if (!id) {
                return null;
            }
            return {
                id,
                name: item.name,
                createdAt: Date.parse(item.created_at ?? "") || 0
            };
        }).filter((item)=>item !== null).sort((left, right)=>right.createdAt - left.createdAt);
    }
    async function createManagedAuthConfigId(apiKey, toolkitSlug, authContract) {
        const tools = authContract?.toolsForAuthConfig ?? [];
        if (tools.length === 0) {
            throw new Error(`Integration auth_contract.tools_for_auth_config is required for Composio OAuth on toolkit "${toolkitSlug}"`);
        }
        const authConfigBody = {
            type: "use_composio_managed_auth",
            name: `${HARNESS_AUTH_CONFIG_NAME_PREFIX}${toolkitSlug}-${Date.now()}`,
            tool_access_config: {
                tools_for_connected_account_creation: tools
            }
        };
        const response = await fetch(`${COMPOSIO_API_BASE}/auth_configs`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey
            },
            body: JSON.stringify({
                toolkit: {
                    slug: toolkitSlug
                },
                auth_config: authConfigBody
            })
        });
        const body = await response.json();
        const authConfigId = extractAuthConfigId(body.auth_config ?? body);
        if (!response.ok || !authConfigId) {
            throw new Error(body.error ?? `Composio auth_configs create failed (${response.status})`);
        }
        return authConfigId;
    }
    async function resolveManagedAuthConfigId(apiKey, toolkitSlug, authContract) {
        const summaries = await listManagedAuthConfigSummaries(apiKey, toolkitSlug);
        for (const summary of summaries){
            const detail = await fetchAuthConfigDetail(apiKey, summary.id);
            if (!detail?.is_composio_managed) {
                continue;
            }
            if (authConfigHasCriticalScopes(authContract, detail.credentials?.scopes)) {
                return summary.id;
            }
        }
        return createManagedAuthConfigId(apiKey, toolkitSlug, authContract);
    }
    async function resolveAuthConfigIdForToolkit(toolkitSlug, authContract) {
        const normalized = toolkitSlug.trim().toLowerCase();
        if (!normalized) {
            throw new Error("toolkit slug is required");
        }
        const cacheKey = `${normalized}:${authContractCacheKey(authContract)}`;
        const cached = authConfigCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.authConfigId;
        }
        const apiKey = getComposioApiKey();
        if (!apiKey) {
            throw new Error("COMPOSIO_API_KEY is not configured on the server");
        }
        const authConfigId = await resolveManagedAuthConfigId(apiKey, normalized, authContract);
        authConfigCache.set(cacheKey, {
            authConfigId,
            expiresAt: Date.now() + AUTH_CONFIG_CACHE_TTL_MS
        });
        return authConfigId;
    }
    invalidateAuthConfigCache = function(toolkitSlug) {
        if (!toolkitSlug) {
            authConfigCache.clear();
            return;
        }
        const prefix = `${toolkitSlug.trim().toLowerCase()}:`;
        for (const key of [
            ...authConfigCache.keys()
        ]){
            if (key.startsWith(prefix)) {
                authConfigCache.delete(key);
            }
        }
    };
    function extractSubdomainFromAccountRecord(record) {
        const fromData = record.data?.subdomain?.trim();
        if (fromData) {
            return fromData;
        }
        const fromState = record.state?.val?.subdomain?.trim();
        return fromState || void 0;
    }
    getConnectedAccountDetails = async function(connectedAccountId) {
        const apiKey = getComposioApiKey();
        if (!apiKey) {
            return null;
        }
        const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts/${connectedAccountId}`, {
            headers: {
                "x-api-key": apiKey
            }
        });
        const body = await response.json();
        if (!response.ok || !body.id || !body.status) {
            return null;
        }
        return {
            id: body.id,
            status: body.status,
            subdomain: extractSubdomainFromAccountRecord(body),
            updatedAt: Date.parse(body.updated_at ?? body.created_at ?? "") || 0
        };
    };
    async function listAllConnectedAccountsForToolkit(options) {
        const apiKey = getComposioApiKey();
        if (!apiKey) {
            return [];
        }
        const query = new URLSearchParams({
            user_ids: options.userId,
            toolkit_slugs: options.toolkitSlug,
            limit: "20"
        });
        const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts?${query.toString()}`, {
            headers: {
                "x-api-key": apiKey
            }
        });
        const body = await response.json();
        if (!response.ok) {
            throw new Error(body.error ?? `Composio connected_accounts list failed (${response.status})`);
        }
        return (body.items ?? []).filter((item)=>item.id && item.status).map((item)=>({
                id: item.id,
                status: item.status,
                subdomain: extractSubdomainFromAccountRecord(item),
                updatedAt: Date.parse(item.updated_at ?? item.created_at ?? "") || 0
            }));
    }
    deleteConnectedAccount = async function(connectedAccountId) {
        const apiKey = getComposioApiKey();
        if (!apiKey) {
            return;
        }
        await fetch(`${COMPOSIO_API_BASE}/connected_accounts/${connectedAccountId}`, {
            method: "DELETE",
            headers: {
                "x-api-key": apiKey
            }
        }).catch(()=>void 0);
    };
    purgeAllConnectedAccountsForToolkit = async function(options) {
        const accounts = await listAllConnectedAccountsForToolkit(options);
        for (const account of accounts){
            if (options.exceptAccountId && account.id === options.exceptAccountId) {
                continue;
            }
            await deleteConnectedAccount(account.id);
        }
    };
    listConnectedAccountsForToolkit = async function(options) {
        const summaries = await listAllConnectedAccountsForToolkit(options);
        const active = summaries.filter((item)=>item.status.toUpperCase() === "ACTIVE");
        if (active.length === 0) {
            return null;
        }
        active.sort((left, right)=>right.updatedAt - left.updatedAt);
        const { isMalformedAtlassianSubdomain } = await import('./composio-connection_CC45xKfl.mjs').then(async (m)=>{
            await m.__tla;
            return m;
        }).then((n)=>n.h);
        for (const candidate of active){
            if (candidate.subdomain && isMalformedAtlassianSubdomain(candidate.subdomain)) {
                await deleteConnectedAccount(candidate.id);
                continue;
            }
            return {
                id: candidate.id,
                status: candidate.status
            };
        }
        return null;
    };
    createComposioConnectLink = async function(options) {
        const apiKey = getComposioApiKey();
        if (!apiKey) {
            throw new Error("COMPOSIO_API_KEY is not configured on the server");
        }
        const authConfigId = await resolveAuthConfigIdForToolkit(options.toolkitSlug, options.authContract);
        const payload = {
            auth_config_id: authConfigId,
            user_id: options.userId,
            callback_url: options.callbackUrl
        };
        if (options.connectionData && Object.keys(options.connectionData).length > 0) {
            payload.connection_data = options.connectionData;
        }
        const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts/link`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey
            },
            body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok || !body.redirect_url) {
            throw new Error(body.error ?? `Composio link failed (${response.status})`);
        }
        return body.redirect_url;
    };
})();
export { getConnectedAccountDetails as a, parseComposioAuthContract as b, createComposioConnectLink as c, deleteConnectedAccount as d, composioConnectAvailable as e, getComposioApiKey as g, invalidateAuthConfigCache as i, listConnectedAccountsForToolkit as l, purgeAllConnectedAccountsForToolkit as p, toolkitSlugFromSlotId as t, __tla };
