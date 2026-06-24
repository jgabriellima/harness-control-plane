const COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v3';
const AUTH_CONFIG_CACHE_TTL_MS = 60 * 60 * 1000;

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
  items?: Array<{ id?: string; auth_config_id?: string }>;
}

interface ComposioAuthConfigCreateResponse {
  id?: string;
  auth_config?: { id?: string };
  auth_config_id?: string;
  error?: string;
}

function extractAuthConfigId(record: {
  id?: string;
  auth_config_id?: string;
  auth_config?: { id?: string };
}): string | undefined {
  return record.auth_config?.id ?? record.auth_config_id ?? record.id;
}

async function listManagedAuthConfigId(apiKey: string, toolkitSlug: string): Promise<string | undefined> {
  const query = new URLSearchParams({
    toolkit_slug: toolkitSlug,
    is_composio_managed: 'true',
    limit: '10',
  });

  const response = await fetch(`${COMPOSIO_API_BASE}/auth_configs?${query.toString()}`, {
    headers: { 'x-api-key': apiKey },
  });

  const body = (await response.json()) as ComposioAuthConfigListResponse & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `Composio auth_configs list failed (${response.status})`);
  }

  for (const item of body.items ?? []) {
    const authConfigId = extractAuthConfigId(item);
    if (authConfigId) {
      return authConfigId;
    }
  }

  return undefined;
}

async function createManagedAuthConfigId(apiKey: string, toolkitSlug: string): Promise<string> {
  const response = await fetch(`${COMPOSIO_API_BASE}/auth_configs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      toolkit: { slug: toolkitSlug },
      auth_config: {
        type: 'use_composio_managed_auth',
        credentials: {},
      },
    }),
  });

  const body = (await response.json()) as ComposioAuthConfigCreateResponse;
  const authConfigId = extractAuthConfigId(body);
  if (!response.ok || !authConfigId) {
    throw new Error(body.error ?? `Composio auth_configs create failed (${response.status})`);
  }

  return authConfigId;
}

/**
 * Resolve (or create) the Composio auth config for a toolkit within our project.
 * Composio creates one auth config per toolkit; operators never paste auth_config ids.
 */
export async function resolveAuthConfigIdForToolkit(toolkitSlug: string): Promise<string> {
  const normalized = toolkitSlug.trim().toLowerCase();
  if (!normalized) {
    throw new Error('toolkit slug is required');
  }

  const cached = authConfigCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.authConfigId;
  }

  const apiKey = getComposioApiKey();
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured on the server');
  }

  const existing = await listManagedAuthConfigId(apiKey, normalized);
  const authConfigId = existing ?? (await createManagedAuthConfigId(apiKey, normalized));

  authConfigCache.set(normalized, {
    authConfigId,
    expiresAt: Date.now() + AUTH_CONFIG_CACHE_TTL_MS,
  });

  return authConfigId;
}

export async function createComposioConnectLink(options: {
  toolkitSlug: string;
  userId: string;
  callbackUrl: string;
}): Promise<string> {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured on the server');
  }

  const authConfigId = await resolveAuthConfigIdForToolkit(options.toolkitSlug);

  const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      auth_config_id: authConfigId,
      user_id: options.userId,
      callback_url: options.callbackUrl,
    }),
  });

  const body = (await response.json()) as { redirect_url?: string; error?: string };
  if (!response.ok || !body.redirect_url) {
    throw new Error(body.error ?? `Composio link failed (${response.status})`);
  }

  return body.redirect_url;
}
