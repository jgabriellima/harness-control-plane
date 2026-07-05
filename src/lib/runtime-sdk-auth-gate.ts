const DEFAULT_AUTH_COOLDOWN_MS = 60_000;

let authBlockedUntil = 0;
let lastAuthBlockReason: string | null = null;

export function markRuntimeAuthUnavailable(reason: string, cooldownMs = DEFAULT_AUTH_COOLDOWN_MS): void {
  authBlockedUntil = Date.now() + cooldownMs;
  lastAuthBlockReason = reason;
}

export function clearRuntimeAuthGate(): void {
  authBlockedUntil = 0;
  lastAuthBlockReason = null;
}

export function canAttemptRuntimeSdkCall(): boolean {
  return Date.now() >= authBlockedUntil;
}

export function runtimeAuthGateSnapshot(): {
  blocked: boolean;
  reason: string | null;
  retryAfterMs: number;
} {
  const remaining = Math.max(0, authBlockedUntil - Date.now());
  return {
    blocked: remaining > 0,
    reason: lastAuthBlockReason,
    retryAfterMs: remaining,
  };
}

/** Test-only reset. */
export function resetRuntimeAuthGateForTests(): void {
  clearRuntimeAuthGate();
}
