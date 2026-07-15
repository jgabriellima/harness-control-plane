import type { ChatRequest } from './harness-types';
import type { PresentationConfig, RichUiMode } from './presentation-types';
import { resolvePresentation, stripPresentationPrefixes } from './presentation-policy';

/** @deprecated Use resolvePresentation — kept for wire compatibility */
export type ResponseMode = 'text' | 'openui';

export function resolveResponseMode(
  request: ChatRequest,
  workspaceConfig: PresentationConfig = { richUi: 'off' },
  dslDefault: RichUiMode = 'off',
): ResponseMode {
  const resolved = resolvePresentation(request, workspaceConfig, dslDefault);
  return resolved.wireMode === 'rich' ? 'openui' : 'text';
}

export function stripResponseModePrefix(message: string): string {
  return stripPresentationPrefixes(message);
}
