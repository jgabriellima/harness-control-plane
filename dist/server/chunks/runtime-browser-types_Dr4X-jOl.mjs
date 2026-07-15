function emptyBrowserSelection(url) {
  return {
    url,
    sessionId: null,
    loading: true,
    error: null,
    renderMode: "screencast",
    streamUrl: null,
    controlMode: "agent",
    viewportWidth: 1280,
    viewportHeight: 720,
    interactive: false
  };
}
function isBrowserToolName(tool) {
  const normalized = tool.trim().toLowerCase();
  return normalized.startsWith("browser_") || normalized.startsWith("browser");
}
function normalizeBrowserUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "about:blank";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("about:")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
function isLocalControlPlaneHost(parsed) {
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    return false;
  }
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  return port >= 4320 && port <= 4349;
}
function resolveBrowserPanelTarget(raw, currentOrigin) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { url: "about:blank", interactive: false, harnessSelf: false, panelOnly: false };
  }
  let parsed;
  try {
    parsed = new URL(trimmed, currentOrigin ?? "http://127.0.0.1");
  } catch {
    return { url: normalizeBrowserUrl(trimmed), interactive: false, harnessSelf: false, panelOnly: false };
  }
  const harnessSelf = Boolean(currentOrigin && parsed.origin === currentOrigin) || isLocalControlPlaneHost(parsed);
  if (!harnessSelf) {
    return { url: normalizeBrowserUrl(trimmed), interactive: false, harnessSelf: false, panelOnly: false };
  }
  const nested = parsed.searchParams.get("browser-open");
  const interactive = parsed.searchParams.get("browser-interactive") === "1";
  if (nested) {
    return {
      url: normalizeBrowserUrl(nested),
      interactive,
      harnessSelf: true,
      panelOnly: true
    };
  }
  return { url: "about:blank", interactive: false, harnessSelf: true, panelOnly: true };
}
function isChatBrowserLink(href, currentOrigin) {
  const trimmed = href.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  const resolved = resolveBrowserPanelTarget(trimmed, currentOrigin);
  if (resolved.harnessSelf) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    const isLocal = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (!isLocal) {
      return true;
    }
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
    const isRoot = !parsed.pathname || parsed.pathname === "/";
    if (isRoot && !isLocalControlPlaneHost(parsed) && port !== 80 && port !== 443) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}
function extractBrowserNavigateUrl(args) {
  if (typeof args !== "object" || args === null) {
    return null;
  }
  const record = args;
  const url = record.url ?? record.href ?? record.link;
  if (typeof url !== "string" || url.trim().length === 0) {
    return null;
  }
  return normalizeBrowserUrl(url.trim());
}

export { isBrowserToolName as a, emptyBrowserSelection as b, extractBrowserNavigateUrl as e, isChatBrowserLink as i, normalizeBrowserUrl as n, resolveBrowserPanelTarget as r };
