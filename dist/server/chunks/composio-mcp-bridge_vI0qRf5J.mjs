import { Composio, SessionPreset } from '@composio/core';
import { g as getComposioApiKey, a as getConnectedAccountDetails } from './composio-auth-config_B4-JkaML.mjs';
import { r as resolveComposioUserId, l as loadIntegrationComposioConfig, b as isComposioSlotConnected, f as readStoredConnectedAccountId } from './composio-connection_CC45xKfl.mjs';

const SESSION_CACHE_TTL_MS = 5 * 60 * 1e3;
const sessionCache = /* @__PURE__ */ new Map();
function invalidateComposioSessionCache() {
  sessionCache.clear();
}
function cacheKey(userId, slotIds) {
  return `${userId}:${[...slotIds].sort().join(",")}`;
}
async function buildComposioMcpServers(options) {
  const apiKey = getComposioApiKey();
  if (!apiKey || options.integrationSlots.length === 0) {
    return void 0;
  }
  const projectId = options.projectId.trim() || "default";
  const userId = resolveComposioUserId(projectId);
  const toolkits = [];
  const connectedAccounts = {};
  for (const slotId of options.integrationSlots) {
    const provider = slotId.split(".").pop() ?? slotId;
    const composioConfig = await loadIntegrationComposioConfig(
      slotId,
      provider,
      options.workspaceRoot
    );
    if (!composioConfig?.enabled) {
      continue;
    }
    const connected = await isComposioSlotConnected(slotId, projectId);
    if (!connected) {
      continue;
    }
    const accountId = await readStoredConnectedAccountId(slotId, projectId);
    if (!accountId) {
      continue;
    }
    const accountDetails = await getConnectedAccountDetails(accountId);
    if (accountDetails?.status.toUpperCase() !== "ACTIVE") {
      continue;
    }
    toolkits.push(composioConfig.toolkit);
    connectedAccounts[composioConfig.toolkit] = accountId;
  }
  if (toolkits.length === 0) {
    return void 0;
  }
  const key = cacheKey(userId, options.integrationSlots);
  const cached = sessionCache.get(key);
  if (cached && cached.loadedAt + SESSION_CACHE_TTL_MS > Date.now()) {
    return {
      [cached.serverKey]: {
        serverKey: cached.serverKey,
        url: cached.mcpUrl,
        headers: cached.mcpHeaders
      }
    };
  }
  const composio = new Composio({ apiKey });
  const uniqueToolkits = [...new Set(toolkits)];
  const session = await composio.sessions.create(userId, {
    toolkits: uniqueToolkits,
    sessionPreset: SessionPreset.DIRECT_TOOLS,
    mcp: true,
    connectedAccounts
  });
  const mcpUrl = session.mcp?.url;
  const mcpHeaders = session.mcp?.headers;
  if (!mcpUrl || !mcpHeaders) {
    return void 0;
  }
  const serverKey = `composio-${session.sessionId.slice(0, 8)}`;
  sessionCache.set(key, {
    sessionId: session.sessionId,
    serverKey,
    mcpUrl,
    mcpHeaders,
    loadedAt: Date.now()
  });
  return {
    [serverKey]: {
      serverKey,
      url: mcpUrl,
      headers: mcpHeaders
    }
  };
}
function composioMcpServersForSdk(bindings) {
  if (!bindings) {
    return void 0;
  }
  const servers = {};
  for (const [key, binding] of Object.entries(bindings)) {
    servers[key] = {
      type: "http",
      url: binding.url,
      headers: binding.headers
    };
  }
  return servers;
}
async function connectedComposioSlots(integrationSlots, projectId = "default") {
  const connected = [];
  for (const slotId of integrationSlots) {
    if (await isComposioSlotConnected(slotId, projectId)) {
      connected.push(slotId);
    }
  }
  return connected;
}

export { connectedComposioSlots as a, buildComposioMcpServers as b, composioMcpServersForSdk as c, invalidateComposioSessionCache as i };
