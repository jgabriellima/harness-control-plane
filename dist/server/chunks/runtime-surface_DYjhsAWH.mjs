function resolveRuntimeSurface(options = {}) {
  if (options.distributionSurface === "desktop" || options.distributionSurface === "embedded") {
    return options.distributionSurface;
  }
  if (options.desktopRuntime) {
    return "desktop";
  }
  return options.distributionSurface ?? "web";
}
function isCursorEmbeddedPreview() {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  if (/Cursor/i.test(ua)) {
    return true;
  }
  try {
    return Boolean(
      window.cursor || window.__CURSOR__ || window.__GLASS_BROWSER__
    );
  } catch {
    return false;
  }
}
function isTauriDesktopShell() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return Boolean(
      window.__TAURI__ || window.__TAURI_INTERNALS__
    );
  } catch {
    return false;
  }
}
function isDesktopRuntimeSurface(surface) {
  return surface === "desktop" || surface === "embedded" || isTauriDesktopShell();
}
function microphoneDeniedMessage(surface) {
  if (isDesktopRuntimeSurface(surface)) {
    return "Microphone access denied. Open System Settings → Privacy & Security → Microphone and allow this app.";
  }
  return "Microphone access blocked";
}
function voiceInputUnavailableMessage(surface) {
  if (isCursorEmbeddedPreview()) {
    return "Voice input is unavailable in the Cursor preview panel. Use the Tauri desktop app or a normal browser tab.";
  }
  if (isDesktopRuntimeSurface(surface)) {
    return "Voice input is unavailable. Check microphone permissions in System Settings.";
  }
  return "Voice input needs a supported browser (Chrome, Safari, or Edge).";
}

export { isTauriDesktopShell as a, isCursorEmbeddedPreview as b, isDesktopRuntimeSurface as i, microphoneDeniedMessage as m, resolveRuntimeSurface as r, voiceInputUnavailableMessage as v };
