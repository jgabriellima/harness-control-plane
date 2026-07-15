import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { c as callCuaDriverTool, s as syncComputerUseAgentInputBlocked } from './runtime-computer-use-bridge_jpMJ_r7H.mjs';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { c as readSandboxManifest, d as requireProjectWorkspaceRoot, f as resetSandboxBootstrapState, g as clearSandboxManifest, e as ensureSandboxVncStream } from './runtime-computer-use-sandbox-bridge_AD0l_YFn.mjs';
import { c as computerUseTargetModeLabel } from './runtime-computer-use-types_BWl7pttb.mjs';

const sessions = /* @__PURE__ */ new Map();
const sessionsByConversation = /* @__PURE__ */ new Map();
const SCREENCAST_INTERVAL_MS = 750;
const DESKTOP_CAPTURE_SCOPE = "desktop";
function generateSessionId() {
  return `cua-preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function extractStructuredContent(data) {
  if (!isRecord(data)) {
    return null;
  }
  if (isRecord(data.structuredContent)) {
    return data.structuredContent;
  }
  return data;
}
function extractScreenshotFromState(data) {
  const structured = extractStructuredContent(data);
  if (!structured) {
    return null;
  }
  const pngB64 = structured.screenshot_png_b64;
  if (typeof pngB64 === "string" && pngB64.length > 0) {
    const width = typeof structured.screenshot_width === "number" ? structured.screenshot_width : typeof structured.screen_width === "number" ? structured.screen_width : 1280;
    const height = typeof structured.screenshot_height === "number" ? structured.screenshot_height : typeof structured.screen_height === "number" ? structured.screen_height : 720;
    return { frameBase64: pngB64, mime: "image/png", width, height };
  }
  const jpegB64 = structured.screenshot_jpeg_b64 ?? structured.screenshot_base64;
  if (typeof jpegB64 === "string" && jpegB64.length > 0) {
    const width = typeof structured.screenshot_width === "number" ? structured.screenshot_width : 1280;
    const height = typeof structured.screenshot_height === "number" ? structured.screenshot_height : 720;
    return { frameBase64: jpegB64, mime: "image/jpeg", width, height };
  }
  return null;
}
async function sessionsDir(workspaceRoot) {
  const binding = await resolveHarnessBinding({ workspaceRoot });
  const dir = join(binding.harnessRoot, "runtime-sessions");
  await mkdir(dir, { recursive: true });
  return dir;
}
async function persistPreviewManifest(session, workspaceRoot) {
  const dir = await sessionsDir(workspaceRoot);
  const manifestPath = join(dir, "computer-use-preview.json");
  const payload = {
    version: 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    active: {
      sessionId: session.sessionId,
      conversationId: session.conversationId,
      controlMode: session.controlMode,
      viewportWidth: session.viewportWidth,
      viewportHeight: session.viewportHeight,
      label: session.label
    },
    agentHint: {
      previewActive: true,
      controlMode: session.controlMode,
      note: "Operator may take control via the Computer Use preview panel. While controlMode is user, defer desktop actions until control returns to agent."
    }
  };
  await writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}
`, "utf8");
}
async function clearPreviewManifest(workspaceRoot) {
  const dir = await sessionsDir(workspaceRoot);
  const manifestPath = join(dir, "computer-use-preview.json");
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
async function ensureDesktopCaptureScope() {
  await callCuaDriverTool("set_config", { capture_scope: DESKTOP_CAPTURE_SCOPE });
}
async function resolveFrontmostWindow() {
  const result = await callCuaDriverTool("list_windows", {});
  if (!result.ok) {
    return null;
  }
  const structured = extractStructuredContent(result.data);
  const windows = structured?.windows;
  if (!Array.isArray(windows) || windows.length === 0) {
    return null;
  }
  const frontmost = windows.find((entry) => isRecord(entry) && entry.is_frontmost === true);
  const candidate = frontmost ?? windows[0];
  const pid = typeof candidate.pid === "number" ? candidate.pid : null;
  const windowId = typeof candidate.window_id === "number" ? candidate.window_id : typeof candidate.id === "number" ? candidate.id : null;
  if (pid === null || windowId === null) {
    return null;
  }
  return { pid, windowId };
}
async function captureDesktopFrame(handle) {
  if (handle.captureInFlight || handle.record.status === "closed" || handle.record.status === "error") {
    return;
  }
  handle.captureInFlight = true;
  try {
    const dir = await sessionsDir(handle.workspaceRoot);
    const screenshotPath = join(dir, `${handle.record.sessionId}-latest.png`);
    const result = await callCuaDriverTool("get_desktop_state", {
      session: handle.record.sessionId,
      screenshot_out_file: screenshotPath
    });
    if (!result.ok) {
      handle.record.error = result.error;
      handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      return;
    }
    const structured = extractStructuredContent(result.data);
    const filePath = typeof structured?.screenshot_file_path === "string" ? structured.screenshot_file_path : screenshotPath;
    let frameBase64 = null;
    try {
      const buffer = await readFile(filePath);
      frameBase64 = buffer.toString("base64");
    } catch {
      const inline = extractScreenshotFromState(result.data);
      if (inline) {
        frameBase64 = inline.frameBase64;
      }
    }
    if (!frameBase64) {
      return;
    }
    const width = typeof structured?.screenshot_width === "number" ? structured.screenshot_width : typeof structured?.screen_width === "number" ? structured.screen_width : 1280;
    const height = typeof structured?.screenshot_height === "number" ? structured.screenshot_height : typeof structured?.screen_height === "number" ? structured.screen_height : 720;
    handle.lastFrameBase64 = frameBase64;
    handle.lastFrameMime = "image/png";
    handle.record.viewportWidth = width;
    handle.record.viewportHeight = height;
    handle.record.error = null;
    handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    for (const subscriber of handle.streamSubscribers) {
      subscriber(frameBase64, "image/png");
    }
  } finally {
    handle.captureInFlight = false;
  }
}
function startScreencast(handle) {
  if (handle.screencastTimer) {
    return;
  }
  handle.screencastTimer = setInterval(() => {
    void captureDesktopFrame(handle);
  }, SCREENCAST_INTERVAL_MS);
}
function stopScreencast(handle) {
  if (handle.screencastTimer) {
    clearInterval(handle.screencastTimer);
    handle.screencastTimer = null;
  }
  handle.streamSubscribers.clear();
}
async function disposeSession(handle) {
  stopScreencast(handle);
  sessions.delete(handle.record.sessionId);
  sessionsByConversation.delete(handle.record.conversationId);
  handle.record.status = "closed";
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  syncAgentInputBlockedFromSessions();
  await clearPreviewManifest(handle.workspaceRoot);
}
function syncAgentInputBlockedFromSessions() {
  let userControlCount = 0;
  for (const handle of sessions.values()) {
    if (handle.record.status === "ready" && handle.record.controlMode === "user") {
      userControlCount += 1;
    }
  }
  syncComputerUseAgentInputBlocked(userControlCount);
}
function applySandboxManifestToHandle(handle, manifest) {
  if (!manifest) {
    return;
  }
  handle.record.sandboxPhase = manifest.phase;
  handle.record.sandboxMessage = manifest.message;
  handle.record.sandboxPreflightChecks = manifest.preflightChecks;
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (manifest.phase === "ready" && manifest.vncUrl) {
    handle.record.vncUrl = manifest.vncUrl;
    handle.record.status = "ready";
    handle.record.error = null;
    return;
  }
  if (manifest.phase === "error") {
    handle.record.status = "error";
    handle.record.error = manifest.error ?? manifest.message ?? "Sandbox failed to start";
  }
}
async function startSandboxVncBootstrap(handle) {
  const workspaceRoot = handle.workspaceRoot;
  const normalizedProjectId = handle.projectId;
  void ensureSandboxVncStream({
    projectId: normalizedProjectId,
    conversationId: handle.record.conversationId,
    workspaceRoot
  }).then((manifest) => {
    applySandboxManifestToHandle(handle, manifest);
    void persistPreviewManifest(handle.record, workspaceRoot);
  });
  const existing = await readSandboxManifest(normalizedProjectId, workspaceRoot);
  applySandboxManifestToHandle(handle, existing);
}
async function resetComputerUsePreviewState(input) {
  const conversationId = input.conversationId.trim() || "default";
  const projectId = input.projectId?.trim() || "default";
  const workspaceRoot = requireProjectWorkspaceRoot(input.workspaceRoot);
  const existingId = sessionsByConversation.get(conversationId);
  if (existingId) {
    const existing = sessions.get(existingId);
    if (existing) {
      await disposeSession(existing);
    }
  }
  resetSandboxBootstrapState(projectId);
  await clearSandboxManifest(projectId, workspaceRoot);
}
async function createComputerUsePreviewSession(input) {
  const conversationId = input.conversationId?.trim() || "default";
  const projectId = input.projectId?.trim() || "default";
  const workspaceRoot = requireProjectWorkspaceRoot(input.workspaceRoot);
  const targetMode = input.targetMode ?? "host";
  const streamKind = targetMode === "sandbox" ? "sandbox_vnc" : "host_screencast";
  if (input.forceRestart) {
    await resetComputerUsePreviewState({
      conversationId,
      projectId,
      workspaceRoot
    });
  }
  const existingId = sessionsByConversation.get(conversationId);
  if (existingId) {
    const existing = sessions.get(existingId);
    if (existing && existing.record.targetMode === targetMode && existing.record.status === "ready" && !input.forceRestart) {
      return existing.record;
    }
    if (existing) {
      await disposeSession(existing);
    }
  }
  const sessionId = generateSessionId();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const record = {
    sessionId,
    conversationId,
    targetMode,
    streamKind,
    status: "starting",
    controlMode: "agent",
    viewportWidth: 1280,
    viewportHeight: 720,
    label: computerUseTargetModeLabel(targetMode),
    vncUrl: null,
    sandboxPhase: targetMode === "sandbox" ? "preflight" : null,
    sandboxMessage: targetMode === "sandbox" ? "Running sandbox pre-flight checks" : null,
    sandboxPreflightChecks: null,
    createdAt: now,
    updatedAt: now,
    error: null
  };
  const handle = {
    record,
    workspaceRoot,
    projectId,
    lastFrameBase64: null,
    lastFrameMime: "image/png",
    screencastTimer: null,
    streamSubscribers: /* @__PURE__ */ new Set(),
    captureInFlight: false,
    lastClickX: null,
    lastClickY: null
  };
  sessions.set(sessionId, handle);
  sessionsByConversation.set(conversationId, sessionId);
  try {
    if (targetMode === "sandbox") {
      await startSandboxVncBootstrap(handle);
      syncAgentInputBlockedFromSessions();
      await persistPreviewManifest(record, workspaceRoot);
      return record;
    }
    await ensureDesktopCaptureScope();
    await captureDesktopFrame(handle);
    if (!handle.lastFrameBase64) {
      throw new Error("Desktop capture returned no screenshot — verify cua-driver permissions");
    }
    record.status = "ready";
    record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    startScreencast(handle);
    syncAgentInputBlockedFromSessions();
    await persistPreviewManifest(record, workspaceRoot);
    return record;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start computer-use preview";
    record.status = "error";
    record.error = message;
    throw new Error(message);
  }
}
async function refreshSandboxPreviewSession(sessionId) {
  const handle = sessions.get(sessionId);
  if (!handle || handle.record.streamKind !== "sandbox_vnc") {
    return handle?.record ?? null;
  }
  const manifest = await readSandboxManifest(handle.projectId, handle.workspaceRoot);
  applySandboxManifestToHandle(handle, manifest);
  await persistPreviewManifest(handle.record, handle.workspaceRoot);
  return handle.record;
}
function getComputerUsePreviewSession(sessionId) {
  const handle = sessions.get(sessionId);
  return handle?.record ?? null;
}
function getComputerUsePreviewSessionForConversation(conversationId) {
  const sessionId = sessionsByConversation.get(conversationId);
  if (!sessionId) {
    return null;
  }
  return getComputerUsePreviewSession(sessionId);
}
async function closeComputerUsePreviewSession(sessionId) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    return false;
  }
  await disposeSession(handle);
  return true;
}
async function setComputerUsePreviewControlMode(sessionId, mode) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Computer-use preview session ${sessionId} not found`);
  }
  handle.record.controlMode = mode;
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  syncAgentInputBlockedFromSessions();
  await persistPreviewManifest(handle.record, handle.workspaceRoot);
  return handle.record;
}
async function performComputerUsePreviewClick(sessionId, x, y) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Computer-use preview session ${sessionId} not found`);
  }
  if (handle.record.targetMode === "sandbox") {
    throw new Error("Sandbox preview input uses noVNC Take Control — host click relay not available");
  }
  if (handle.record.controlMode !== "user") {
    throw new Error("Control is with the agent — switch to Take control to click");
  }
  const result = await callCuaDriverTool("click", {
    x,
    y,
    scope: "desktop",
    session: sessionId
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  handle.lastClickX = x;
  handle.lastClickY = y;
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  await captureDesktopFrame(handle);
}
async function performComputerUsePreviewType(sessionId, text) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Computer-use preview session ${sessionId} not found`);
  }
  if (handle.record.targetMode === "sandbox") {
    throw new Error("Sandbox preview input uses noVNC Take Control — host typing relay not available");
  }
  if (handle.record.controlMode !== "user") {
    throw new Error("Control is with the agent — switch to Take control to type");
  }
  if (!text) {
    return;
  }
  const frontmost = await resolveFrontmostWindow();
  if (!frontmost) {
    throw new Error("Could not resolve frontmost window for typing");
  }
  const typeArgs = {
    text,
    pid: frontmost.pid,
    window_id: frontmost.windowId,
    delivery_mode: "foreground",
    session: sessionId
  };
  if (handle.lastClickX !== null && handle.lastClickY !== null) {
    typeArgs.x = handle.lastClickX;
    typeArgs.y = handle.lastClickY;
  }
  const result = await callCuaDriverTool("type_text", typeArgs);
  if (!result.ok) {
    throw new Error(result.error);
  }
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  await captureDesktopFrame(handle);
}
async function performComputerUsePreviewKeyPress(sessionId, key) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Computer-use preview session ${sessionId} not found`);
  }
  if (handle.record.targetMode === "sandbox") {
    throw new Error("Sandbox preview input uses noVNC Take Control — host keyboard relay not available");
  }
  if (handle.record.controlMode !== "user") {
    throw new Error("Control is with the agent — switch to Take control for keyboard input");
  }
  const frontmost = await resolveFrontmostWindow();
  if (!frontmost) {
    throw new Error("Could not resolve frontmost window for key press");
  }
  const keyArgs = {
    key,
    pid: frontmost.pid,
    window_id: frontmost.windowId,
    delivery_mode: "foreground",
    session: sessionId
  };
  if (handle.lastClickX !== null && handle.lastClickY !== null) {
    keyArgs.x = handle.lastClickX;
    keyArgs.y = handle.lastClickY;
  }
  const result = await callCuaDriverTool("press_key", keyArgs);
  if (!result.ok) {
    throw new Error(result.error);
  }
  handle.record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  await captureDesktopFrame(handle);
}
function subscribeComputerUsePreviewStream(sessionId, onFrame) {
  const handle = sessions.get(sessionId);
  if (!handle) {
    return null;
  }
  if (handle.lastFrameBase64) {
    onFrame(handle.lastFrameBase64, handle.lastFrameMime);
  }
  handle.streamSubscribers.add(onFrame);
  return () => {
    handle.streamSubscribers.delete(onFrame);
  };
}
async function readComputerUsePreviewManifest(workspaceRoot) {
  try {
    const dir = await sessionsDir(requireProjectWorkspaceRoot(workspaceRoot));
    const raw = await readFile(join(dir, "computer-use-preview.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export { performComputerUsePreviewType as a, performComputerUsePreviewKeyPress as b, closeComputerUsePreviewSession as c, refreshSandboxPreviewSession as d, getComputerUsePreviewSessionForConversation as e, createComputerUsePreviewSession as f, getComputerUsePreviewSession as g, subscribeComputerUsePreviewStream as h, performComputerUsePreviewClick as p, readComputerUsePreviewManifest as r, setComputerUsePreviewControlMode as s };
