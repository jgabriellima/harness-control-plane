import { appendDispatchLog } from './runtime-dispatch-log';
import { RuntimeGatewayError } from './runtime-gateway';
import { reconcileRuntimeCredentials } from './runtime-credentials-reconcile';
import { canAttemptRuntimeSdkCall, clearRuntimeAuthGate } from './runtime-sdk-auth-gate';
import {
  getCachedServerSdkMessageContext,
  sdkRuntimeReconnectingMessage,
} from './runtime-sdk-messages';
import {
  invalidateSdkProbeCache,
  probeSdkDispatchHealth,
  type SdkDispatchHealth,
} from './runtime-sdk-probe';
import { runtimeLogger } from './runtime-logger';

const lastSuccessfulProbeAt = new Map<string, number>();

const DEFAULT_IDLE_REPROBE_MS = 120_000;

function resolveIdleReprobeMs(): number {
  const raw = process.env.CONTROL_PLANE_SDK_IDLE_REPROBE_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_IDLE_REPROBE_MS;
}

function shouldForceProbe(workspaceRoot: string): boolean {
  if (!canAttemptRuntimeSdkCall()) {
    return true;
  }

  const lastAt = lastSuccessfulProbeAt.get(workspaceRoot) ?? 0;
  if (lastAt === 0) {
    return true;
  }

  return Date.now() - lastAt > resolveIdleReprobeMs();
}

async function probeWithOptionalReconcile(
  workspaceRoot: string,
  requestId: string,
  reconcileFirst: boolean,
): Promise<SdkDispatchHealth> {
  if (reconcileFirst) {
    await reconcileRuntimeCredentials();
    invalidateSdkProbeCache(workspaceRoot);
    clearRuntimeAuthGate();
  }

  return probeSdkDispatchHealth({
    cacheKey: workspaceRoot,
    force: true,
    workspaceCwd: workspaceRoot,
    probeLocalExecution: true,
  });
}

/**
 * Server-side dispatch gate — integrators MUST NOT pre-call dispatch-health.
 * Throws RuntimeGatewayError 503 when cognitive runtime is not ready.
 */
export async function assertRuntimeAvailable(
  workspaceRoot: string,
  requestId: string,
): Promise<SdkDispatchHealth> {
  const cwd = workspaceRoot.trim();
  const force = shouldForceProbe(cwd);
  const startedAt = Date.now();

  runtimeLogger.debug('runtime.availability.assert', {
    request_id: requestId,
    workspace_root: cwd,
    force,
  });

  if (!force) {
    const cached = await probeSdkDispatchHealth({ cacheKey: cwd, force: false });
    if (cached.ready) {
      return cached;
    }
  }

  let health = await probeWithOptionalReconcile(cwd, requestId, true);

  if (!health.ready && (health.error_code === 'auth_failed' || health.auth === 'failed')) {
    health = await probeWithOptionalReconcile(cwd, requestId, true);
  }

  if (health.ready) {
    lastSuccessfulProbeAt.set(cwd, Date.now());
    runtimeLogger.info('runtime.availability.ok', {
      request_id: requestId,
      workspace_root: cwd,
      duration_ms: Date.now() - startedAt,
      forced: force,
    });
    return health;
  }

  const message =
    health.message ??
    sdkRuntimeReconnectingMessage(getCachedServerSdkMessageContext());

  runtimeLogger.warn('runtime.availability.blocked', {
    request_id: requestId,
    workspace_root: cwd,
    duration_ms: Date.now() - startedAt,
    error_code: health.error_code,
    message,
  });

  void appendDispatchLog(
    {
      event: 'runtime.availability.blocked',
      request_id: requestId,
      phase: 'runtime.availability',
      cwd,
      duration_ms: Date.now() - startedAt,
      error_code: health.error_code,
      error_message: message,
    },
    cwd,
  );

  throw new RuntimeGatewayError(message, 503, 'runtime.availability', requestId);
}

/** Test-only reset. */
export function resetRuntimeAvailabilityForTests(): void {
  lastSuccessfulProbeAt.clear();
}
