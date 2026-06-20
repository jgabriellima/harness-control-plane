/** Sidecar env contract — set by Rust setup before spawn */
export interface DesktopSidecarEnv {
  TAURI_RESOURCE_DIR: string;
  TAURI_APP_PORT: string;
  HOST: '127.0.0.1';
  PORT: string;
  CURSOR_API_KEY?: string;
  SENTRY_DSN?: string;
}

/** Readiness poll config for desktop production gate */
export interface DesktopReadinessGate {
  path: '/api/runtime/readiness';
  intervalMs: number;
  timeoutMs: number;
  expectedStatus: 200;
}

export const DEFAULT_READINESS_GATE: DesktopReadinessGate = {
  path: '/api/runtime/readiness',
  intervalMs: 300,
  timeoutMs: 90_000,
  expectedStatus: 200,
};
