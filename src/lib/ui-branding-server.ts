import {
  DEFAULT_DESKTOP_IDENTIFIER,
  DEFAULT_PRESENTATION_TITLE,
  DEFAULT_WINDOW_TITLE,
  resolveUIBranding,
  type UIBranding,
} from './ui-branding';
import { loadUIConfig } from './ui-config';
import { resolveProjectRoot } from './project-root';

function envPresentationTitle(): string | undefined {
  return process.env.CONTROL_PLANE_PRESENTATION_TITLE?.trim() || undefined;
}

function envWindowTitle(): string | undefined {
  return process.env.CONTROL_PLANE_WINDOW_TITLE?.trim() || undefined;
}

function envDesktopIdentifier(): string | undefined {
  return process.env.CONTROL_PLANE_DESKTOP_IDENTIFIER?.trim() || undefined;
}

export function defaultUIBranding(): UIBranding {
  return {
    presentationTitle: envPresentationTitle() ?? DEFAULT_PRESENTATION_TITLE,
    windowTitle: envWindowTitle() ?? envPresentationTitle() ?? DEFAULT_WINDOW_TITLE,
    desktopIdentifier: envDesktopIdentifier() ?? DEFAULT_DESKTOP_IDENTIFIER,
  };
}

export async function loadPageBranding(projectRoot?: string): Promise<UIBranding> {
  const root = projectRoot ?? resolveProjectRoot();

  try {
    const config = await loadUIConfig(root);
    const branding = resolveUIBranding(config);

    return {
      presentationTitle: branding.presentationTitle || envPresentationTitle() || DEFAULT_PRESENTATION_TITLE,
      windowTitle: branding.windowTitle || envWindowTitle() || DEFAULT_WINDOW_TITLE,
      desktopIdentifier: branding.desktopIdentifier || envDesktopIdentifier() || DEFAULT_DESKTOP_IDENTIFIER,
      assets: branding.assets,
    };
  } catch {
    return defaultUIBranding();
  }
}
