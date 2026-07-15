import type { UIConfig } from './ui-config';

/**
 * Inline tool-activity accordion above the chat composer (ComposerToolActivity).
 * When false, use the dedicated Activity panel (header wrench) instead.
 */
export function resolveComposerToolActivityEnabled(uiConfig: UIConfig): boolean {
  const featureFlag = uiConfig.features?.composer_tool_activity;
  if (featureFlag === false) {
    return false;
  }
  return true;
}
