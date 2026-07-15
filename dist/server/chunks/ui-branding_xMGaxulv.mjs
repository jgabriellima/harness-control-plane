const DEFAULT_PRESENTATION_TITLE = "Control Plane";
const DEFAULT_WINDOW_TITLE = "Control Plane";
const DEFAULT_DESKTOP_IDENTIFIER = "control-plane";
function getPresentationTitle(config, fallback = DEFAULT_PRESENTATION_TITLE) {
  const title = config.presentation?.title?.trim();
  return title || fallback;
}
function getWindowTitle(config, fallback = DEFAULT_WINDOW_TITLE) {
  const windowTitle = config.distribution?.desktop?.window_title?.trim();
  if (windowTitle) {
    return windowTitle;
  }
  return getPresentationTitle(config, fallback);
}
function getDesktopIdentifier(config, fallback = DEFAULT_DESKTOP_IDENTIFIER) {
  const identifier = config.distribution?.desktop?.identifier?.trim();
  return identifier || fallback;
}
function getPresentationAssets(config) {
  const assets = config.presentation?.assets;
  if (!assets) {
    return void 0;
  }
  return assets;
}
function resolveUIBranding(config) {
  return {
    presentationTitle: getPresentationTitle(config),
    windowTitle: getWindowTitle(config),
    desktopIdentifier: getDesktopIdentifier(config),
    assets: getPresentationAssets(config)
  };
}

export { DEFAULT_PRESENTATION_TITLE as D, DEFAULT_DESKTOP_IDENTIFIER as a, DEFAULT_WINDOW_TITLE as b, getPresentationTitle as g, resolveUIBranding as r };
