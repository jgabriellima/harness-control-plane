import { clearRuntimeAuthGate } from './runtime-sdk-auth-gate';
import { invalidateSdkProbeCache } from './runtime-sdk-probe';

const RUNTIME_KEY_ALIASES = ['RUNTIME_API_KEY', 'CURSOR_API_KEY'] as const;

export function activateRuntimeCredentialInProcess(envVar: string, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  if (envVar === 'RUNTIME_API_KEY' || envVar === 'CURSOR_API_KEY') {
    for (const key of RUNTIME_KEY_ALIASES) {
      process.env[key] = trimmed;
    }
    invalidateSdkProbeCache();
    clearRuntimeAuthGate();
  } else {
    process.env[envVar] = trimmed;
  }
}
