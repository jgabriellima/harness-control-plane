import type { UIConfig } from './ui-config';

export const DEFAULT_PRESENTATION_TITLE = 'Control Plane';
export const DEFAULT_WINDOW_TITLE = 'Control Plane';
export const DEFAULT_DESKTOP_IDENTIFIER = 'control-plane';

export interface PresentationAssets {
  icon_light?: string;
  icon_dark?: string;
  wordmark_light?: string;
  wordmark_dark?: string;
}

export interface UIBranding {
  presentationTitle: string;
  windowTitle: string;
  desktopIdentifier: string;
  assets?: PresentationAssets;
}

export function getPresentationTitle(
  config: UIConfig,
  fallback = DEFAULT_PRESENTATION_TITLE,
): string {
  const title = config.presentation?.title?.trim();
  return title || fallback;
}

export function getWindowTitle(config: UIConfig, fallback = DEFAULT_WINDOW_TITLE): string {
  const windowTitle = config.distribution?.desktop?.window_title?.trim();
  if (windowTitle) {
    return windowTitle;
  }
  return getPresentationTitle(config, fallback);
}

export function getDesktopIdentifier(
  config: UIConfig,
  fallback = DEFAULT_DESKTOP_IDENTIFIER,
): string {
  const identifier = config.distribution?.desktop?.identifier?.trim();
  return identifier || fallback;
}

export function getPresentationAssets(config: UIConfig): PresentationAssets | undefined {
  const assets = config.presentation?.assets;
  if (!assets) {
    return undefined;
  }
  return assets;
}

export function resolveUIBranding(config: UIConfig): UIBranding {
  return {
    presentationTitle: getPresentationTitle(config),
    windowTitle: getWindowTitle(config),
    desktopIdentifier: getDesktopIdentifier(config),
    assets: getPresentationAssets(config),
  };
}

export function runtimeSubtitle(presentationTitle: string): string {
  return `${presentationTitle} Runtime`;
}

export function homeAriaLabel(presentationTitle: string): string {
  return `${presentationTitle} home`;
}
