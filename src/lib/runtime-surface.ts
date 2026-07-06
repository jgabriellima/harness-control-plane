import type { ControlPlaneSurface } from './ui-config';

export type RuntimeSurface = ControlPlaneSurface;

export interface ResolveRuntimeSurfaceOptions {
  distributionSurface?: ControlPlaneSurface;
  desktopRuntime?: boolean;
}

/**
 * Resolve the active UI surface for capability decisions.
 * Desktop Tauri sets CONTROL_PLANE_DESKTOP=1 on the sidecar process.
 */
export function resolveRuntimeSurface(options: ResolveRuntimeSurfaceOptions = {}): RuntimeSurface {
  if (options.distributionSurface === 'desktop' || options.distributionSurface === 'embedded') {
    return options.distributionSurface;
  }
  if (options.desktopRuntime) {
    return 'desktop';
  }
  return options.distributionSurface ?? 'web';
}

/** Cursor IDE embedded preview — not a shippable surface. */
export function isCursorEmbeddedPreview(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  if (/Cursor/i.test(ua)) {
    return true;
  }
  try {
    return Boolean(
      (window as Window & { cursor?: unknown; __CURSOR__?: unknown; __GLASS_BROWSER__?: unknown })
        .cursor ||
        (window as Window & { __CURSOR__?: unknown }).__CURSOR__ ||
        (window as Window & { __GLASS_BROWSER__?: unknown }).__GLASS_BROWSER__,
    );
  } catch {
    return false;
  }
}

export function isTauriDesktopShell(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return Boolean(
      (window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI__ ||
        (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
    );
  } catch {
    return false;
  }
}

export function isDesktopRuntimeSurface(surface: RuntimeSurface): boolean {
  return surface === 'desktop' || surface === 'embedded' || isTauriDesktopShell();
}

export function microphoneDeniedMessage(surface: RuntimeSurface): string {
  if (isDesktopRuntimeSurface(surface)) {
    return 'Microphone access denied. Open System Settings → Privacy & Security → Microphone and allow this app.';
  }
  return 'Microphone access blocked';
}

export function voiceInputUnavailableMessage(surface: RuntimeSurface): string {
  if (isCursorEmbeddedPreview()) {
    return 'Voice input is unavailable in the Cursor preview panel. Use the Tauri desktop app or a normal browser tab.';
  }
  if (isDesktopRuntimeSurface(surface)) {
    return 'Voice input is unavailable. Check microphone permissions in System Settings.';
  }
  return 'Voice input needs a supported browser (Chrome, Safari, or Edge).';
}
