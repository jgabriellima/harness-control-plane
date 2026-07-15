import { designDaemonApiUrl, resolveDesignDaemonConfig } from './design-daemon-config';

export interface DesignDaemonHealth {
  ok: boolean;
  port: number;
  vendorPresent: boolean;
  version?: string;
  error?: string;
}

interface DaemonHealthPayload {
  status?: string;
  version?: string;
}

export async function fetchDesignDaemonHealth(): Promise<DesignDaemonHealth> {
  const config = resolveDesignDaemonConfig();
  const base: DesignDaemonHealth = {
    ok: false,
    port: config.port,
    vendorPresent: config.vendorPresent,
  };

  if (!config.vendorPresent) {
    return {
      ...base,
      error: 'Open Design vendor not found. Run scripts/sync-open-design-vendor.sh',
    };
  }

  try {
    const response = await fetch(designDaemonApiUrl('/api/health', config), {
      signal: AbortSignal.timeout(4_000),
    });

    if (!response.ok) {
      return {
        ...base,
        error: `Daemon health returned ${response.status}`,
      };
    }

    const payload = (await response.json()) as DaemonHealthPayload;
    return {
      ok: payload.status === 'ok' || response.ok,
      port: config.port,
      vendorPresent: true,
      version: typeof payload.version === 'string' ? payload.version : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Daemon unreachable';
    return {
      ...base,
      error: message,
    };
  }
}

export async function fetchDesignApi<T>(path: string, init?: RequestInit): Promise<T> {
  const config = resolveDesignDaemonConfig();
  const response = await fetch(designDaemonApiUrl(path, config), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Design API ${path} failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}
