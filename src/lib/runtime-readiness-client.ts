import type { SdkDispatchHealth } from './runtime-sdk-probe';

const READINESS_PATH = '/api/runtime/readiness';
const DISPATCH_HEALTH_PATH = '/api/runtime/dispatch-health';
const DEFAULT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 300;

let readyPromise: Promise<void> | null = null;

async function probeReadiness(): Promise<boolean> {
  try {
    const response = await fetch(READINESS_PATH, { cache: 'no-store' });
    // Any HTTP response means Astro is accepting connections. A missing readiness
    // snapshot (404) still means the API server is up for conversation hydrate.
    return !isTransientHydrateFailure(response.status);
  } catch {
    return false;
  }
}

export async function waitForRuntimeReady(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (await probeReadiness()) {
    return;
  }

  if (!readyPromise) {
    readyPromise = new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();

      const poll = (): void => {
        void probeReadiness().then((ready) => {
          if (ready) {
            readyPromise = null;
            resolve();
            return;
          }

          if (Date.now() - startedAt >= timeoutMs) {
            readyPromise = null;
            reject(new Error('Runtime server is not ready'));
            return;
          }

          window.setTimeout(poll, POLL_INTERVAL_MS);
        });
      };

      poll();
    });
  }

  await readyPromise;
}

export function isTransientHydrateFailure(status: number | null): boolean {
  return status === null || status === 502 || status === 503 || status === 504;
}

export async function fetchDispatchHealth(
  projectId: string,
  options?: { force?: boolean },
): Promise<SdkDispatchHealth> {
  const params = new URLSearchParams({ project_id: projectId });
  if (options?.force) {
    params.set('force', '1');
  }

  const response = await fetch(`${DISPATCH_HEALTH_PATH}?${params.toString()}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to verify Cursor runtime connectivity');
  }

  return (await response.json()) as SdkDispatchHealth;
}
