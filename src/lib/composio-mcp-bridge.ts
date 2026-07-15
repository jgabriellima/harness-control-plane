import { Composio, SessionPreset } from '@composio/core';

import { getComposioApiKey } from './composio-auth-config';
import {
  isComposioSlotConnected,
  loadIntegrationComposioConfig,
  readStoredConnectedAccountId,
  resolveComposioUserId,
} from './composio-connection';
import { getConnectedAccountDetails } from './composio-auth-config';

const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedSession {
  sessionId: string;
  serverKey: string;
  mcpUrl: string;
  mcpHeaders: Record<string, string>;
  loadedAt: number;
}

const sessionCache = new Map<string, CachedSession>();

export function invalidateComposioSessionCache(): void {
  sessionCache.clear();
}

function cacheKey(userId: string, slotIds: string[]): string {
  return `${userId}:${[...slotIds].sort().join(',')}`;
}

export interface ComposioMcpServerBinding {
  serverKey: string;
  url: string;
  headers: Record<string, string>;
}

export async function buildComposioMcpServers(options: {
  workspaceRoot: string;
  integrationSlots: string[];
  projectId: string;
  conversationId?: string;
}): Promise<Record<string, ComposioMcpServerBinding> | undefined> {
  const apiKey = getComposioApiKey();
  if (!apiKey || options.integrationSlots.length === 0) {
    return undefined;
  }

  const projectId = options.projectId.trim() || 'default';
  const userId = resolveComposioUserId(projectId);

  const toolkits: string[] = [];
  const connectedAccounts: Record<string, string> = {};

  for (const slotId of options.integrationSlots) {
    const provider = slotId.split('.').pop() ?? slotId;
    const composioConfig = await loadIntegrationComposioConfig(
      slotId,
      provider,
      options.workspaceRoot,
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
    if (accountDetails?.status.toUpperCase() !== 'ACTIVE') {
      continue;
    }

    toolkits.push(composioConfig.toolkit);
    connectedAccounts[composioConfig.toolkit] = accountId;
  }

  if (toolkits.length === 0) {
    return undefined;
  }

  const key = cacheKey(userId, options.integrationSlots);
  const cached = sessionCache.get(key);
  if (cached && cached.loadedAt + SESSION_CACHE_TTL_MS > Date.now()) {
    return {
      [cached.serverKey]: {
        serverKey: cached.serverKey,
        url: cached.mcpUrl,
        headers: cached.mcpHeaders,
      },
    };
  }

  const composio = new Composio({ apiKey });
  const uniqueToolkits = [...new Set(toolkits)];

  const session = await composio.sessions.create(userId, {
    toolkits: uniqueToolkits,
    sessionPreset: SessionPreset.DIRECT_TOOLS,
    mcp: true,
    connectedAccounts,
  });

  const mcpUrl = session.mcp?.url;
  const mcpHeaders = session.mcp?.headers;
  if (!mcpUrl || !mcpHeaders) {
    return undefined;
  }

  const serverKey = `composio-${session.sessionId.slice(0, 8)}`;
  sessionCache.set(key, {
    sessionId: session.sessionId,
    serverKey,
    mcpUrl,
    mcpHeaders: mcpHeaders as Record<string, string>,
    loadedAt: Date.now(),
  });

  return {
    [serverKey]: {
      serverKey,
      url: mcpUrl,
      headers: mcpHeaders as Record<string, string>,
    },
  };
}

export function composioMcpServersForSdk(
  bindings: Record<string, ComposioMcpServerBinding> | undefined,
): Record<string, { type: 'http'; url: string; headers: Record<string, string> }> | undefined {
  if (!bindings) {
    return undefined;
  }

  const servers: Record<string, { type: 'http'; url: string; headers: Record<string, string> }> = {};
  for (const [key, binding] of Object.entries(bindings)) {
    servers[key] = {
      type: 'http',
      url: binding.url,
      headers: binding.headers,
    };
  }
  return servers;
}

export async function connectedComposioSlots(
  integrationSlots: string[],
  projectId = 'default',
): Promise<string[]> {
  const connected: string[] = [];
  for (const slotId of integrationSlots) {
    if (await isComposioSlotConnected(slotId, projectId)) {
      connected.push(slotId);
    }
  }
  return connected;
}

export async function readConnectedAccountIds(
  integrationSlots: string[],
  projectId = 'default',
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const slotId of integrationSlots) {
    const id = await readStoredConnectedAccountId(slotId, projectId);
    if (id) {
      out[slotId] = id;
    }
  }
  return out;
}
