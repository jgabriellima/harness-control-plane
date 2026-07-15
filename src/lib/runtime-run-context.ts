import type { PresentationPromptVariant, PresentationWireMode } from './presentation-types';

export interface RuntimeRunContext {
  wireMode: PresentationWireMode;
  promptVariant: PresentationPromptVariant;
  surfaceId: string;
  requestId?: string;
}

const runContexts = new Map<string, RuntimeRunContext>();

export function setRunContext(runId: string, context: RuntimeRunContext): void {
  runContexts.set(runId, context);
}

export function getRunContext(runId: string): RuntimeRunContext | undefined {
  return runContexts.get(runId);
}

export function clearRunContext(runId: string): void {
  runContexts.delete(runId);
}
