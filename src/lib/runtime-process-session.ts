import { randomUUID } from 'node:crypto';

/** Stable id for this control-plane process — resets on every restart. */
export const processSessionId = randomUUID();

const sessionExecutingRunIds = new Set<string>();

/** Marks a run as executing within the current process session (not continuable). */
export function markRunExecutingInProcessSession(runId: string): void {
  const normalized = runId.trim();
  if (!normalized) {
    return;
  }
  sessionExecutingRunIds.add(normalized);
}

export function clearRunFromProcessSession(runId: string): void {
  sessionExecutingRunIds.delete(runId.trim());
}

export function isRunExecutingInProcessSession(runId: string): boolean {
  return sessionExecutingRunIds.has(runId.trim());
}

export function listProcessSessionExecutingRunIds(): string[] {
  return [...sessionExecutingRunIds];
}
