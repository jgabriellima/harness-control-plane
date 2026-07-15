import { createServer } from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { b as resolveAppRoot } from './workspace-manager_C2YuGzrP.mjs';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { a as broadcastBrowserSessionClosed, c as broadcastBrowserUrlChanged } from './runtime-hub-stream_CkfCSBM_.mjs';
import { r as resolveBrowserPanelTarget, n as normalizeBrowserUrl } from './runtime-browser-types_Dr4X-jOl.mjs';

const sessions = /* @__PURE__ */ new Map();
const sessionsByConversation = /* @__PURE__ */ new Map();
const SCREENCAST_INTERVAL_MS = 500;
async function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to allocate CDP port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}
function sanitizePlaywrightNavigationUrl(raw) {
  const resolved = resolveBrowserPanelTarget(raw);
  if (resolved.harnessSelf) {
    return resolved.url;
  }
  return normalizeBrowserUrl(raw);
}
function generateSessionId() {
  return `browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
async function sessionsDir() {
  const binding = await resolveHarnessBinding({ workspaceRoot: resolveAppRoot() });
  const dir = join(binding.harnessRoot, "runtime-sessions");
  await mkdir(dir, { recursive: true });
  return dir;
}
async function persistCdpManifest(session) {
  const dir = await sessionsDir();
  const manifestPath = join(dir, "browser-cdp.json");
  const payload = {
    version: 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    active: {
      sessionId: session.sessionId,
      conversationId: session.conversationId,
      cdpEndpoint: session.cdpEndpoint,
      url: session.url,
      controlMode: session.controlMode
    },
    mcpHint: {
      server: "user-playwright",
      args: ["@playwright/mcp@latest", `--cdp-endpoint=${session.cdpEndpoint}`]
    }
  };
  await writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}
`, "utf8");
}
async function clearCdpManifest() {
  const dir = await sessionsDir();
  const manifestPath = join(dir, "browser-cdp.json");
  try {
    await writeFile(
      manifestPath,
      `${JSON.stringify({ version: 1, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), active: null }, null, 2)}
`,
      "utf8"
    );
  } catch {
  }
}
function startScreencast(handle) {
  if (handle.screencastTimer) {
    return;
  }
  handle.screencastTimer = setInterval(() => {
    void (async () => {
      try {
        const buffer = await handle.page.screenshot({ type: "jpeg", quality: 72 });
        const frame = buffer.toString("base64");
        handle.lastFrameBase64 = frame;
        for (const subscriber of handle.streamSubscribers) {
          subscriber(frame);
        }
      } catch {
      }
    })();
  }, SCREENCAST_INTERVAL_MS);
}
function stopScreencast(handle) {
  if (handle.screencastTimer) {
    clearInterval(handle.screencastTimer);
    handle.screencastTimer = null;
  }
  handle.streamSubscribers.clear();
  handle.urlSubscribers.clear();
}
function commitSessionUrl(handle, nextUrl, options) {
  const trimmed = nextUrl.trim();
  if (!trimmed || handle.record.url === trimmed) {
    return false;
  }
  handle.record.url = trimmed;
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  void persistCdpManifest(handle.record);
  if (options?.broadcast !== false) {
    broadcastBrowserUrlChanged({
      conversationId: handle.record.conversationId,
      sessionId: handle.record.sessionId,
      url: trimmed
    });
  }
  for (const subscriber of handle.urlSubscribers) {
    subscriber(trimmed);
  }
  return true;
}
function bindPageNavigationWatcher(handle) {
  if (handle.navigationBound) {
    return;
  }
  handle.navigationBound = true;
  handle.page.on("framenavigated", (frame) => {
    if (frame !== handle.page.mainFrame()) {
      return;
    }
    try {
      commitSessionUrl(handle, handle.page.url());
    } catch {
    }
  });
}
async function disposeSession(handle) {
  stopScreencast(handle);
  sessions.delete(handle.record.sessionId);
  sessionsByConversation.delete(handle.record.conversationId);
  try {
    await handle.browser.close();
  } catch {
  }
  handle.record.status = "closed";
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  await clearCdpManifest();
}
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
async function createBrowserSession(input) {
  const conversationId = input.conversationId?.trim() || "default";
  const url = sanitizePlaywrightNavigationUrl(input.url);
  const interactive = Boolean(input.interactive);
  const existingId = sessionsByConversation.get(conversationId);
  if (existingId) {
    const existing = sessions.get(existingId);
    if (existing && existing.record.status === "ready") {
      if (existing.record.interactive !== interactive) {
        await disposeSession(existing);
      } else {
        await navigateBrowserSession(existingId, url);
        return { session: existing.record, created: false };
      }
    }
  }
  const cdpPort = await allocatePort();
  const cdpEndpoint = `http://127.0.0.1:${cdpPort}`;
  const sessionId = generateSessionId();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const record = {
    sessionId,
    conversationId,
    url,
    status: "starting",
    createdAt: now,
    updatedAt: now,
    cdpEndpoint,
    renderMode: "screencast",
    controlMode: interactive ? "user" : "agent",
    viewportWidth: DEFAULT_VIEWPORT.width,
    viewportHeight: DEFAULT_VIEWPORT.height,
    interactive,
    error: null
  };
  try {
    const browser = await chromium.launch({
      headless: !interactive,
      args: [`--remote-debugging-port=${cdpPort}`]
    });
    const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 6e4 });
    record.status = "ready";
    record.url = page.url();
    record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const handle = {
      record,
      browser,
      page,
      lastFrameBase64: null,
      screencastTimer: null,
      streamSubscribers: /* @__PURE__ */ new Set(),
      urlSubscribers: /* @__PURE__ */ new Set(),
      navigationBound: false
    };
    sessions.set(sessionId, handle);
    sessionsByConversation.set(conversationId, sessionId);
    bindPageNavigationWatcher(handle);
    startScreencast(handle);
    await persistCdpManifest(record);
    const initialFrame = await page.screenshot({ type: "jpeg", quality: 72 });
    handle.lastFrameBase64 = initialFrame.toString("base64");
    return { session: record, created: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start browser session";
    record.status = "error";
    record.error = message;
    throw new Error(message);
  }
}
async function navigateBrowserSession(sessionId, url) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }
  const normalized = sanitizePlaywrightNavigationUrl(url);
  await handle.page.goto(normalized, { waitUntil: "domcontentloaded", timeout: 6e4 });
  commitSessionUrl(handle, handle.page.url());
  return handle.record;
}
async function refreshBrowserSession(sessionId) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }
  await handle.page.reload({ waitUntil: "domcontentloaded", timeout: 6e4 });
  commitSessionUrl(handle, handle.page.url());
  return handle.record;
}
function getBrowserSession(sessionId) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    return null;
  }
  try {
    const liveUrl = handle.page.url();
    commitSessionUrl(handle, liveUrl, { broadcast: false });
  } catch {
  }
  return handle.record;
}
function getBrowserSessionForConversation(conversationId) {
  const sessionId = sessionsByConversation.get(conversationId);
  if (!sessionId) {
    return null;
  }
  return getBrowserSession(sessionId);
}
async function closeBrowserSession(sessionId) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    return false;
  }
  const { conversationId, sessionId: closedSessionId } = handle.record;
  await disposeSession(handle);
  broadcastBrowserSessionClosed({ conversationId, sessionId: closedSessionId });
  return true;
}
async function readBrowserCdpManifest() {
  try {
    const dir = await sessionsDir();
    const raw = await readFile(join(dir, "browser-cdp.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function subscribeBrowserScreencast(sessionId, onFrame) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    return null;
  }
  if (handle.lastFrameBase64) {
    onFrame(handle.lastFrameBase64);
  }
  handle.streamSubscribers.add(onFrame);
  return () => {
    handle.streamSubscribers.delete(onFrame);
  };
}
function subscribeBrowserUrl(sessionId, onUrl) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    return null;
  }
  if (handle.record.url) {
    onUrl(handle.record.url);
  }
  handle.urlSubscribers.add(onUrl);
  return () => {
    handle.urlSubscribers.delete(onUrl);
  };
}
async function setBrowserControlMode(sessionId, mode) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }
  handle.record.controlMode = mode;
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  await persistCdpManifest(handle.record);
  return handle.record;
}
async function performBrowserClick(sessionId, x, y) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }
  if (handle.record.controlMode !== "user") {
    throw new Error("Browser control is with the agent — switch to User control to click");
  }
  await handle.page.mouse.click(x, y);
  try {
    await handle.page.evaluate(
      (coords) => {
        const element = document.elementFromPoint(coords.x, coords.y);
        if (element instanceof HTMLElement) {
          element.focus();
        }
      },
      { x, y }
    );
  } catch {
  }
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
}
async function enableUserBrowserWindow(sessionId) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }
  if (handle.record.interactive) {
    return handle.record;
  }
  const { url, conversationId } = handle.record;
  await disposeSession(handle);
  const { session } = await createBrowserSession({ url, conversationId, interactive: true });
  return session;
}
async function performBrowserType(sessionId, text) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }
  if (handle.record.controlMode !== "user") {
    throw new Error("Browser control is with the agent — switch to User control to type");
  }
  if (!text) {
    return;
  }
  await handle.page.keyboard.type(text);
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
}
async function performBrowserKeyPress(sessionId, key) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }
  if (handle.record.controlMode !== "user") {
    throw new Error("Browser control is with the agent — switch to User control to type");
  }
  await handle.page.keyboard.press(key);
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
}
async function performBrowserScroll(sessionId, x, y, deltaX, deltaY) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }
  await handle.page.mouse.move(x, y);
  await handle.page.mouse.wheel(deltaX, deltaY);
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
}

export { performBrowserType as a, performBrowserKeyPress as b, performBrowserScroll as c, readBrowserCdpManifest as d, enableUserBrowserWindow as e, closeBrowserSession as f, getBrowserSession as g, getBrowserSessionForConversation as h, createBrowserSession as i, subscribeBrowserScreencast as j, subscribeBrowserUrl as k, navigateBrowserSession as n, performBrowserClick as p, refreshBrowserSession as r, setBrowserControlMode as s };
