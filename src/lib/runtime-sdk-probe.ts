import { AuthenticationError, Cursor, NetworkError } from '@cursor/sdk';

import { errorFields, runtimeLogger } from './runtime-logger';
import { requireCursorApiKey } from './runtime-sdk-local';

export type SdkHealthErrorCode =
  | 'missing_api_key'
  | 'auth_failed'
  | 'network_failed'
  | 'timeout'
  | 'unknown';

export interface SdkDispatchHealth {
  ready: boolean;
  checked_at: string;
  cursor_api_key: 'present' | 'missing';
  auth: 'ok' | 'failed' | 'skipped';
  network: 'ok' | 'failed' | 'skipped';
  latency_ms: number | null;
  account?: { apiKeyName: string };
  message: string | null;
  error_name?: string;
  error_code?: SdkHealthErrorCode;
}

interface CacheEntry {
  health: SdkDispatchHealth;
  expiresAt: number;
}

const probeCache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_PROBE_TIMEOUT_MS = 15_000;

function resolveProbeTimeoutMs(): number {
  const raw = process.env.CONTROL_PLANE_SDK_PROBE_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_PROBE_TIMEOUT_MS;
}

function mapProbeFailure(error: unknown, startedAt: number): SdkDispatchHealth {
  const checked_at = new Date().toISOString();
  const latency_ms = Date.now() - startedAt;
  const fields = errorFields(error);

  if (error instanceof AuthenticationError) {
    return {
      ready: false,
      checked_at,
      cursor_api_key: 'present',
      auth: 'failed',
      network: 'ok',
      latency_ms,
      message:
        'CURSOR_API_KEY rejeitada pela API Cursor — verifique a chave em harness-control-plane/.env',
      error_name: fields.error_name,
      error_code: 'auth_failed',
    };
  }

  if (error instanceof NetworkError) {
    return {
      ready: false,
      checked_at,
      cursor_api_key: 'present',
      auth: 'skipped',
      network: 'failed',
      latency_ms,
      message:
        'Sem conexão com a API Cursor — verifique rede/VPN/proxy antes de enviar mensagens no chat',
      error_name: fields.error_name,
      error_code: 'network_failed',
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const isTimeout = /timed out/i.test(message);

  return {
    ready: false,
    checked_at,
    cursor_api_key: 'present',
    auth: 'skipped',
    network: 'failed',
    latency_ms,
    message: isTimeout
      ? 'Timeout ao contactar a API Cursor — tente novamente em instantes'
      : `Runtime Cursor indisponível: ${message}`,
    error_name: fields.error_name,
    error_code: isTimeout ? 'timeout' : 'unknown',
  };
}

export async function probeSdkDispatchHealth(options?: {
  cacheKey?: string;
  force?: boolean;
  timeoutMs?: number;
  cacheTtlMs?: number;
}): Promise<SdkDispatchHealth> {
  const cacheKey = options?.cacheKey ?? 'global';
  const now = Date.now();
  const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  if (!options?.force) {
    const cached = probeCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.health;
    }
  }

  const startedAt = Date.now();
  const checked_at = new Date().toISOString();

  try {
    requireCursorApiKey();
  } catch {
    const health: SdkDispatchHealth = {
      ready: false,
      checked_at,
      cursor_api_key: 'missing',
      auth: 'skipped',
      network: 'skipped',
      latency_ms: null,
      message:
        'CURSOR_API_KEY ausente no processo Astro — configure harness-control-plane/.env e reinicie o dev server',
      error_code: 'missing_api_key',
    };
    probeCache.set(cacheKey, { health, expiresAt: now + cacheTtlMs });
    return health;
  }

  const timeoutMs = options?.timeoutMs ?? resolveProbeTimeoutMs();
  const apiKey = requireCursorApiKey();

  try {
    const me = await Promise.race([
      Cursor.me({ apiKey }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('SDK probe timed out')), timeoutMs);
      }),
    ]);

    const health: SdkDispatchHealth = {
      ready: true,
      checked_at,
      cursor_api_key: 'present',
      auth: 'ok',
      network: 'ok',
      latency_ms: Date.now() - startedAt,
      account: { apiKeyName: me.apiKeyName },
      message: null,
    };

    probeCache.set(cacheKey, { health, expiresAt: now + cacheTtlMs });
    runtimeLogger.info('runtime.sdk.probe.ok', {
      latency_ms: health.latency_ms,
      account: me.apiKeyName,
    });
    return health;
  } catch (error) {
    const health = mapProbeFailure(error, startedAt);
    probeCache.set(cacheKey, { health, expiresAt: now + Math.min(cacheTtlMs, 10_000) });
    runtimeLogger.warn('runtime.sdk.probe.failed', {
      error_code: health.error_code,
      ...errorFields(error),
    });
    return health;
  }
}

export function invalidateSdkProbeCache(cacheKey?: string): void {
  if (cacheKey) {
    probeCache.delete(cacheKey);
    return;
  }
  probeCache.clear();
}
