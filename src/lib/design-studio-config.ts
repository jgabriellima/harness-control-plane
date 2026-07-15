import type { UIConfig } from './ui-config';

export function resolveDesignStudioEnabled(uiConfig: UIConfig): boolean {
  return uiConfig.features?.design_studio === true;
}
