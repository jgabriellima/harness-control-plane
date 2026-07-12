import type { UIConfig } from './ui-config';

export function resolveContextUsagePanelEnabled(uiConfig: UIConfig): boolean {
  const featureFlag = uiConfig.features?.context_usage_panel;
  if (featureFlag === false) {
    return false;
  }
  return true;
}
