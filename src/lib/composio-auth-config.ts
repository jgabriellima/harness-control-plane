import {
  authContractCacheKey,
  authContractSatisfiesGrantedScopes,
  normalizeOAuthScopes,
  type ComposioAuthContract,
} from './composio-integration-contract';

const COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v3';
const AUTH_CONFIG_CACHE_TTL_MS = 60 * 60 * 1000;
const HARNESS_AUTH_CONFIG_NAME_PREFIX = 'harness-';

interface AuthConfigCacheEntry {
  authConfigId: string;
  expiresAt: number;
}

const authConfigCache = new Map<string, AuthConfigCacheEntry>();

export function getComposioApiKey(): string | undefined {
  return process.env.COMPOSIO_API_KEY?.trim() || undefined;
}

/** Derive Composio toolkit slug from harness slot id (slot.jira → jira). */
export function toolkitSlugFromSlotId(slotId: string, provider?: string): string {
  const fromProvider = provider?.trim().toLowerCase();
  if (fromProvider) {
    return fromProvider;
  }

  const segment = slotId.split('.').pop()?.trim().toLowerCase();
  return segment || slotId.trim().toLowerCase();
}

/**
 * Connect is available when the server has a Composio project key.
 * Auth config ids are resolved at connect time via Composio API — not env vars.
 */
export function composioConnectAvailable(toolkitSlug: string): boolean {
  return Boolean(getComposioApiKey() && toolkitSlug.trim());
}

interface ComposioAuthConfigListResponse {
  items?: Array<{
    id?: string;
    auth_config_id?: string;
    created_at?: string;
    name?: string;
  }>;
}

interface ComposioAuthConfigCreateResponse {
  id?: string;
  auth_config?: { id?: string };
  auth_config_id?: string;
  error?: string;
}

interface ComposioAuthConfigDetail {
  id?: string;
  name?: string;
  is_composio_managed?: boolean;
  credentials?: { scopes?: string[] | string };
  created_at?: string;
}

function extractAuthConfigId(record: {
  id?: string;
  auth_config_id?: string;
  auth_config?: { id?: string };
}): string | undefined {
  return record.auth_config?.id ?? record.auth_config_id ?? record.id;
}

function normalizeScopes(scopes: string[] | string | undefined): string[] {
  return normalizeOAuthScopes(scopes);
}

export function authConfigHasCriticalScopes(
  authContract: ComposioAuthContract | null | undefined,
  scopes: string[] | string | undefined,
): boolean {
  return authContractSatisfiesGrantedScopes(authContract, scopes);
}

async function fetchAuthConfigDetail(apiKey: string, authConfigId: string): Promise<ComposioAuthConfigDetail | null> {
  const response = await fetch(`${COMPOSIO_API_BASE}/auth_configs/${authConfigId}`, {
    headers: { 'x-api-key': apiKey },
  });

  const body = (await response.json()) as ComposioAuthConfigDetail & { error?: string };
  if (!response.ok || !body.id) {
    return null;
  }

  return body;
}

async function listManagedAuthConfigSummaries(
  apiKey: string,
  toolkitSlug: string,
): Promise<Array<{ id: string; name?: string; createdAt: number }>> {
  const query = new URLSearchParams({
    toolkit_slug: toolkitSlug,
    is_composio_managed: 'true',
    limit: '20',
  });

  const response = await fetch(`${COMPOSIO_API_BASE}/auth_configs?${query.toString()}`, {
    headers: { 'x-api-key': apiKey },
  });

  const body = (await response.json()) as ComposioAuthConfigListResponse & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `Composio auth_configs list failed (${response.status})`);
  }

  return (body.items ?? [])
    .map((item) => {
      const id = extractAuthConfigId(item);
      if (!id) {
        return null;
      }
      return {
        id,
        name: item.name,
        createdAt: Date.parse(item.created_at ?? '') || 0,
      };
    })
    .filter((item): item is { id: string; name?: string; createdAt: number } => item !== null)
    .sort((left, right) => right.createdAt - left.createdAt);
}

async function createManagedAuthConfigId(
  apiKey: string,
  toolkitSlug: string,
  authContract: ComposioAuthContract | null | undefined,
): Promise<string> {
  const tools = authContract?.toolsForAuthConfig ?? [];
  if (tools.length === 0) {
    throw new Error(
      `Integration auth_contract.tools_for_auth_config is required for Composio OAuth on toolkit "${toolkitSlug}"`,
    );
  }

  const authConfigBody: Record<string, unknown> = {
    type: 'use_composio_managed_auth',
    name: `${HARNESS_AUTH_CONFIG_NAME_PREFIX}${toolkitSlug}-${Date.now()}`,
    tool_access_config: {
      tools_for_connected_account_creation: tools,
    },
  };

  const response = await fetch(`${COMPOSIO_API_BASE}/auth_configs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      toolkit: { slug: toolkitSlug },
      auth_config: authConfigBody,
    }),
  });

  const body = (await response.json()) as ComposioAuthConfigCreateResponse;
  const authConfigId = extractAuthConfigId(body.auth_config ?? body);
  if (!response.ok || !authConfigId) {
    throw new Error(body.error ?? `Composio auth_configs create failed (${response.status})`);
  }

  return authConfigId;
}

async function resolveManagedAuthConfigId(
  apiKey: string,
  toolkitSlug: string,
  authContract: ComposioAuthContract | null | undefined,
): Promise<string> {
  const summaries = await listManagedAuthConfigSummaries(apiKey, toolkitSlug);

  for (const summary of summaries) {
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

/**
 * Resolve (or create) the Composio auth config from the integration auth_contract.
 * Scopes and probe tools are declared in workspace integration YAML — not hardcoded here.
 */
export async function resolveAuthConfigIdForToolkit(
  toolkitSlug: string,
  authContract?: ComposioAuthContract | null,
): Promise<string> {
  const normalized = toolkitSlug.trim().toLowerCase();
  if (!normalized) {
    throw new Error('toolkit slug is required');
  }

  const cacheKey = `${normalized}:${authContractCacheKey(authContract)}`;
  const cached = authConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.authConfigId;
  }

  const apiKey = getComposioApiKey();
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured on the server');
  }

  const authConfigId = await resolveManagedAuthConfigId(apiKey, normalized, authContract);

  authConfigCache.set(cacheKey, {
    authConfigId,
    expiresAt: Date.now() + AUTH_CONFIG_CACHE_TTL_MS,
  });

  return authConfigId;
}

export function invalidateAuthConfigCache(toolkitSlug?: string): void {
  if (!toolkitSlug) {
    authConfigCache.clear();
    return;
  }
  const prefix = `${toolkitSlug.trim().toLowerCase()}:`;
  for (const key of [...authConfigCache.keys()]) {
    if (key.startsWith(prefix)) {
      authConfigCache.delete(key);
    }
  }
}

export interface ComposioConnectedAccountSummary {
  id: string;
  status: string;
  subdomain?: string;
  updatedAt: number;
}

function extractSubdomainFromAccountRecord(
  record: { data?: { subdomain?: string }; state?: { val?: { subdomain?: string } } },
): string | undefined {
  const fromData = record.data?.subdomain?.trim();
  if (fromData) {
    return fromData;
  }
  const fromState = record.state?.val?.subdomain?.trim();
  return fromState || undefined;
}

export async function getConnectedAccountDetails(
  connectedAccountId: string,
): Promise<ComposioConnectedAccountSummary | null> {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    return null;
  }

  const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts/${connectedAccountId}`, {
    headers: { 'x-api-key': apiKey },
  });

  const body = (await response.json()) as {
    id?: string;
    status?: string;
    updated_at?: string;
    created_at?: string;
    data?: { subdomain?: string };
    state?: { val?: { subdomain?: string } };
    error?: string;
  };

  if (!response.ok || !body.id || !body.status) {
    return null;
  }

  return {
    id: body.id,
    status: body.status,
    subdomain: extractSubdomainFromAccountRecord(body),
    updatedAt: Date.parse(body.updated_at ?? body.created_at ?? '') || 0,
  };
}

export async function listAllConnectedAccountsForToolkit(options: {
  userId: string;
  toolkitSlug: string;
}): Promise<ComposioConnectedAccountSummary[]> {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    return [];
  }

  const query = new URLSearchParams({
    user_ids: options.userId,
    toolkit_slugs: options.toolkitSlug,
    limit: '20',
  });

  const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts?${query.toString()}`, {
    headers: { 'x-api-key': apiKey },
  });

  const body = (await response.json()) as {
    items?: Array<{
      id?: string;
      status?: string;
      updated_at?: string;
      created_at?: string;
      data?: { subdomain?: string };
      state?: { val?: { subdomain?: string } };
    }>;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? `Composio connected_accounts list failed (${response.status})`);
  }

  return (body.items ?? [])
    .filter((item) => item.id && item.status)
    .map((item) => ({
      id: item.id as string,
      status: item.status as string,
      subdomain: extractSubdomainFromAccountRecord(item),
      updatedAt: Date.parse(item.updated_at ?? item.created_at ?? '') || 0,
    }));
}

export async function deleteConnectedAccount(connectedAccountId: string): Promise<void> {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    return;
  }

  await fetch(`${COMPOSIO_API_BASE}/connected_accounts/${connectedAccountId}`, {
    method: 'DELETE',
    headers: { 'x-api-key': apiKey },
  }).catch(() => undefined);
}

/** Remove every connected account for a user/toolkit pair (all statuses). */
export async function purgeAllConnectedAccountsForToolkit(options: {
  userId: string;
  toolkitSlug: string;
  exceptAccountId?: string;
}): Promise<void> {
  const accounts = await listAllConnectedAccountsForToolkit(options);
  for (const account of accounts) {
    if (options.exceptAccountId && account.id === options.exceptAccountId) {
      continue;
    }
    await deleteConnectedAccount(account.id);
  }
}

export async function listConnectedAccountsForToolkit(options: {
  userId: string;
  toolkitSlug: string;
}): Promise<{ id: string; status: string } | null> {
  const summaries = await listAllConnectedAccountsForToolkit(options);
  const active = summaries.filter((item) => item.status.toUpperCase() === 'ACTIVE');
  if (active.length === 0) {
    return null;
  }

  active.sort((left, right) => right.updatedAt - left.updatedAt);

  const { isMalformedAtlassianSubdomain } = await import('./composio-tenant-connection-data');

  for (const candidate of active) {
    if (candidate.subdomain && isMalformedAtlassianSubdomain(candidate.subdomain)) {
      await deleteConnectedAccount(candidate.id);
      continue;
    }
    return { id: candidate.id, status: candidate.status };
  }

  return null;
}

export async function createComposioConnectLink(options: {
  toolkitSlug: string;
  userId: string;
  callbackUrl: string;
  connectionData?: Record<string, string>;
  authContract?: ComposioAuthContract | null;
}): Promise<string> {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured on the server');
  }

  const authConfigId = await resolveAuthConfigIdForToolkit(options.toolkitSlug, options.authContract);

  const payload: Record<string, unknown> = {
    auth_config_id: authConfigId,
    user_id: options.userId,
    callback_url: options.callbackUrl,
  };
  if (options.connectionData && Object.keys(options.connectionData).length > 0) {
    payload.connection_data = options.connectionData;
  }

  const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as { redirect_url?: string; error?: string };
  if (!response.ok || !body.redirect_url) {
    throw new Error(body.error ?? `Composio link failed (${response.status})`);
  }

  return body.redirect_url;
}
