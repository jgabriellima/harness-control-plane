import { Composio, SessionPreset } from '@composio/core';

import { getComposioApiKey } from './composio-auth-config';

const PROBE_CACHE_TTL_MS = 60_000;
const probeCache = new Map<string, { valid: boolean; loadedAt: number }>();

function parseProbeResult(payload: string): boolean {
  try {
    const outer = JSON.parse(payload) as {
      data?: { valid?: boolean; status_code?: number; message?: string };
      successful?: boolean;
      error?: string;
    };
    if (typeof outer.data?.valid === 'boolean') {
      return outer.data.valid;
    }
    if (outer.data?.status_code === 401 || outer.data?.status_code === 403) {
      return false;
    }
    if (typeof outer.error === 'string' && /unauthorized|invalid credentials/i.test(outer.error)) {
      return false;
    }
    // Never treat outer successful:true as valid — Composio marks tool execution, not auth.
    return outer.successful === true && !outer.error;
  } catch {
    return !/invalid credentials|unauthorized|no active connection/i.test(payload);
  }
}

async function callProbeTool(options: {
  mcpUrl: string;
  mcpHeaders: Record<string, string>;
  toolName: string;
}): Promise<boolean> {
  const response = await fetch(options.mcpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...options.mcpHeaders,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: options.toolName,
        arguments: {},
      },
    }),
  });

  const text = await response.text();
  const dataLine = text
    .split('\n')
    .find((line) => line.startsWith('data: '))
    ?.slice('data: '.length);
  const inner = dataLine
    ? ((JSON.parse(dataLine) as { result?: { content?: Array<{ text?: string }> } }).result
        ?.content?.[0]?.text ?? text)
    : text;

  return parseProbeResult(inner);
}

/** Live MCP credential probe — runs every tool in auth_contract.probe_tools. */
export async function probeComposioToolkitCredential(options: {
  userId: string;
  toolkit: string;
  connectedAccountId: string;
  probeTools?: string[];
}): Promise<boolean> {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    return false;
  }

  const toolkit = options.toolkit.trim().toLowerCase();
  const probeTools = (options.probeTools ?? []).map((tool) => tool.trim()).filter(Boolean);
  if (probeTools.length === 0) {
    return false;
  }

  const cacheKey = `${options.userId}:${toolkit}:${options.connectedAccountId}:${probeTools.join(',')}`;
  const cached = probeCache.get(cacheKey);
  if (cached && cached.loadedAt + PROBE_CACHE_TTL_MS > Date.now()) {
    return cached.valid;
  }

  try {
    const composio = new Composio({ apiKey });
    const session = await composio.sessions.create(options.userId, {
      toolkits: [toolkit],
      sessionPreset: SessionPreset.DIRECT_TOOLS,
      mcp: true,
      connectedAccounts: { [toolkit]: options.connectedAccountId },
    });

    const mcpUrl = session.mcp?.url;
    const mcpHeaders = session.mcp?.headers;
    if (!mcpUrl || !mcpHeaders) {
      return false;
    }

    const headers = mcpHeaders as Record<string, string>;
    for (const toolName of probeTools) {
      const valid = await callProbeTool({ mcpUrl, mcpHeaders: headers, toolName });
      if (!valid) {
        probeCache.set(cacheKey, { valid: false, loadedAt: Date.now() });
        return false;
      }
    }

    probeCache.set(cacheKey, { valid: true, loadedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

export function invalidateComposioCredentialProbeCache(): void {
  probeCache.clear();
}
