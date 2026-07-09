import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveAppRoot } from './app-root';
import { resolveHarnessBinding } from './harness-binding';
import { callCuaDriverTool } from './runtime-computer-use-bridge';
import { syncComputerUseAgentInputBlocked } from './runtime-computer-use-control-gate';
import {
  clearSandboxManifest,
  ensureSandboxVncStream,
  readSandboxManifest,
  resetSandboxBootstrapState,
  type SandboxLoadPhase,
} from './runtime-computer-use-sandbox-bridge';
import type { ComputerUseControlMode } from './runtime-computer-use-panel-types';
import type { ComputerUseTargetMode } from './runtime-computer-use-types';
import { computerUseTargetModeLabel } from './runtime-computer-use-types';

export type ComputerUsePreviewStreamKind = 'host_screencast' | 'sandbox_vnc';

export type ComputerUsePreviewStatus = 'starting' | 'ready' | 'closed' | 'error';

export interface RuntimeComputerUsePreviewSession {
  sessionId: string;
  conversationId: string;
  targetMode: ComputerUseTargetMode;
  streamKind: ComputerUsePreviewStreamKind;
  status: ComputerUsePreviewStatus;
  controlMode: ComputerUseControlMode;
  viewportWidth: number;
  viewportHeight: number;
  label: string;
  vncUrl: string | null;
  sandboxPhase: SandboxLoadPhase | null;
  sandboxMessage: string | null;
  sandboxPreflightChecks: import('./runtime-computer-use-sandbox-preflight').SandboxPreflightCheck[] | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

interface PreviewSessionHandle {
  record: RuntimeComputerUsePreviewSession;
  lastFrameBase64: string | null;
  lastFrameMime: 'image/png' | 'image/jpeg';
  screencastTimer: ReturnType<typeof setInterval> | null;
  streamSubscribers: Set<(frame: string, mime: string) => void>;
  captureInFlight: boolean;
  lastClickX: number | null;
  lastClickY: number | null;
}

const sessions = new Map<string, PreviewSessionHandle>();
const sessionsByConversation = new Map<string, string>();

const SCREENCAST_INTERVAL_MS = 750;
const DESKTOP_CAPTURE_SCOPE = 'desktop';

function generateSessionId(): string {
  return `cua-preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractStructuredContent(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) {
    return null;
  }
  if (isRecord(data.structuredContent)) {
    return data.structuredContent;
  }
  return data;
}

function extractScreenshotFromState(data: unknown): {
  frameBase64: string;
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
} | null {
  const structured = extractStructuredContent(data);
  if (!structured) {
    return null;
  }

  const pngB64 = structured.screenshot_png_b64;
  if (typeof pngB64 === 'string' && pngB64.length > 0) {
    const width =
      typeof structured.screenshot_width === 'number'
        ? structured.screenshot_width
        : typeof structured.screen_width === 'number'
          ? structured.screen_width
          : 1280;
    const height =
      typeof structured.screenshot_height === 'number'
        ? structured.screenshot_height
        : typeof structured.screen_height === 'number'
          ? structured.screen_height
          : 720;
    return { frameBase64: pngB64, mime: 'image/png', width, height };
  }

  const jpegB64 = structured.screenshot_jpeg_b64 ?? structured.screenshot_base64;
  if (typeof jpegB64 === 'string' && jpegB64.length > 0) {
    const width = typeof structured.screenshot_width === 'number' ? structured.screenshot_width : 1280;
    const height =
      typeof structured.screenshot_height === 'number' ? structured.screenshot_height : 720;
    return { frameBase64: jpegB64, mime: 'image/jpeg', width, height };
  }

  return null;
}

async function sessionsDir(): Promise<string> {
  const binding = await resolveHarnessBinding({ workspaceRoot: resolveAppRoot() });
  const dir = join(binding.harnessRoot, 'runtime-sessions');
  await mkdir(dir, { recursive: true });
  return dir;
}

async function persistPreviewManifest(session: RuntimeComputerUsePreviewSession): Promise<void> {
  const dir = await sessionsDir();
  const manifestPath = join(dir, 'computer-use-preview.json');
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    active: {
      sessionId: session.sessionId,
      conversationId: session.conversationId,
      controlMode: session.controlMode,
      viewportWidth: session.viewportWidth,
      viewportHeight: session.viewportHeight,
      label: session.label,
    },
    agentHint: {
      previewActive: true,
      controlMode: session.controlMode,
      note:
        'Operator may take control via the Computer Use preview panel. While controlMode is user, defer desktop actions until control returns to agent.',
    },
  };
  await writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function clearPreviewManifest(): Promise<void> {
  const dir = await sessionsDir();
  const manifestPath = join(dir, 'computer-use-preview.json');
  try {
    await writeFile(
      manifestPath,
      `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), active: null }, null, 2)}\n`,
      'utf8',
    );
  } catch {
    // Best-effort cleanup.
  }
}

async function ensureDesktopCaptureScope(): Promise<void> {
  await callCuaDriverTool('set_config', { capture_scope: DESKTOP_CAPTURE_SCOPE });
}

async function resolveFrontmostWindow(): Promise<{ pid: number; windowId: number } | null> {
  const result = await callCuaDriverTool('list_windows', {});
  if (!result.ok) {
    return null;
  }

  const structured = extractStructuredContent(result.data);
  const windows = structured?.windows;
  if (!Array.isArray(windows) || windows.length === 0) {
    return null;
  }

  const frontmost = windows.find((entry) => isRecord(entry) && entry.is_frontmost === true);
  const candidate = (frontmost ?? windows[0]) as Record<string, unknown>;
  const pid = typeof candidate.pid === 'number' ? candidate.pid : null;
  const windowId =
    typeof candidate.window_id === 'number'
      ? candidate.window_id
      : typeof candidate.id === 'number'
        ? candidate.id
        : null;

  if (pid === null || windowId === null) {
    return null;
  }

  return { pid, windowId };
}

async function captureDesktopFrame(handle: PreviewSessionHandle): Promise<void> {
  if (
    handle.captureInFlight ||
    handle.record.status === 'closed' ||
    handle.record.status === 'error'
  ) {
    return;
  }

  handle.captureInFlight = true;
  try {
    const dir = await sessionsDir();
    const screenshotPath = join(dir, `${handle.record.sessionId}-latest.png`);
    const result = await callCuaDriverTool('get_desktop_state', {
      session: handle.record.sessionId,
      screenshot_out_file: screenshotPath,
    });

    if (!result.ok) {
      handle.record.error = result.error;
      handle.record.updatedAt = new Date().toISOString();
      return;
    }

    const structured = extractStructuredContent(result.data);
    const filePath =
      typeof structured?.screenshot_file_path === 'string'
        ? structured.screenshot_file_path
        : screenshotPath;

    let frameBase64: string | null = null;
    try {
      const buffer = await readFile(filePath);
      frameBase64 = buffer.toString('base64');
    } catch {
      const inline = extractScreenshotFromState(result.data);
      if (inline) {
        frameBase64 = inline.frameBase64;
      }
    }

    if (!frameBase64) {
      return;
    }

    const width =
      typeof structured?.screenshot_width === 'number'
        ? structured.screenshot_width
        : typeof structured?.screen_width === 'number'
          ? structured.screen_width
          : 1280;
    const height =
      typeof structured?.screenshot_height === 'number'
        ? structured.screenshot_height
        : typeof structured?.screen_height === 'number'
          ? structured.screen_height
          : 720;

    handle.lastFrameBase64 = frameBase64;
    handle.lastFrameMime = 'image/png';
    handle.record.viewportWidth = width;
    handle.record.viewportHeight = height;
    handle.record.error = null;
    handle.record.updatedAt = new Date().toISOString();

    for (const subscriber of handle.streamSubscribers) {
      subscriber(frameBase64, 'image/png');
    }
  } finally {
    handle.captureInFlight = false;
  }
}

function startScreencast(handle: PreviewSessionHandle): void {
  if (handle.screencastTimer) {
    return;
  }

  handle.screencastTimer = setInterval(() => {
    void captureDesktopFrame(handle);
  }, SCREENCAST_INTERVAL_MS);
}

function stopScreencast(handle: PreviewSessionHandle): void {
  if (handle.screencastTimer) {
    clearInterval(handle.screencastTimer);
    handle.screencastTimer = null;
  }
  handle.streamSubscribers.clear();
}

async function disposeSession(handle: PreviewSessionHandle): Promise<void> {
  stopScreencast(handle);
  sessions.delete(handle.record.sessionId);
  sessionsByConversation.delete(handle.record.conversationId);
  handle.record.status = 'closed';
  handle.record.updatedAt = new Date().toISOString();
  syncAgentInputBlockedFromSessions();
  await clearPreviewManifest();
}

function syncAgentInputBlockedFromSessions(): void {
  let userControlCount = 0;
  for (const handle of sessions.values()) {
    if (handle.record.status === 'ready' && handle.record.controlMode === 'user') {
      userControlCount += 1;
    }
  }
  syncComputerUseAgentInputBlocked(userControlCount);
}

function applySandboxManifestToHandle(
  handle: PreviewSessionHandle,
  manifest: Awaited<ReturnType<typeof readSandboxManifest>>,
): void {
  if (!manifest) {
    return;
  }
  handle.record.sandboxPhase = manifest.phase;
  handle.record.sandboxMessage = manifest.message;
  handle.record.sandboxPreflightChecks = manifest.preflightChecks;
  handle.record.updatedAt = new Date().toISOString();

  if (manifest.phase === 'ready' && manifest.vncUrl) {
    handle.record.vncUrl = manifest.vncUrl;
    handle.record.status = 'ready';
    handle.record.error = null;
    return;
  }

  if (manifest.phase === 'error') {
    handle.record.status = 'error';
    handle.record.error = manifest.error ?? manifest.message ?? 'Sandbox failed to start';
  }
}

async function startSandboxVncBootstrap(handle: PreviewSessionHandle): Promise<void> {
  const binding = await resolveHarnessBinding({ workspaceRoot: resolveAppRoot() });
  const workspaceRoot = binding.workspaceRoot;

  void ensureSandboxVncStream({
    conversationId: handle.record.conversationId,
    workspaceRoot,
  }).then((manifest) => {
    applySandboxManifestToHandle(handle, manifest);
    void persistPreviewManifest(handle.record);
  });

  const existing = await readSandboxManifest(handle.record.conversationId, workspaceRoot);
  applySandboxManifestToHandle(handle, existing);
}

export async function resetComputerUsePreviewState(input: {
  conversationId: string;
  workspaceRoot?: string;
}): Promise<void> {
  const conversationId = input.conversationId.trim() || 'default';
  const existingId = sessionsByConversation.get(conversationId);
  if (existingId) {
    const existing = sessions.get(existingId);
    if (existing) {
      await disposeSession(existing);
    }
  }
  resetSandboxBootstrapState(conversationId);
  await clearSandboxManifest(conversationId, input.workspaceRoot);
}

export async function createComputerUsePreviewSession(input: {
  conversationId?: string;
  targetMode?: ComputerUseTargetMode;
  forceRestart?: boolean;
  workspaceRoot?: string;
}): Promise<RuntimeComputerUsePreviewSession> {
  const conversationId = input.conversationId?.trim() || 'default';
  const targetMode = input.targetMode ?? 'host';
  const streamKind: ComputerUsePreviewStreamKind =
    targetMode === 'sandbox' ? 'sandbox_vnc' : 'host_screencast';

  if (input.forceRestart) {
    const binding = await resolveHarnessBinding({ workspaceRoot: resolveAppRoot() });
    await resetComputerUsePreviewState({
      conversationId,
      workspaceRoot: input.workspaceRoot ?? binding.workspaceRoot,
    });
  }

  const existingId = sessionsByConversation.get(conversationId);
  if (existingId) {
    const existing = sessions.get(existingId);
    if (
      existing &&
      existing.record.targetMode === targetMode &&
      existing.record.status === 'ready' &&
      !input.forceRestart
    ) {
      return existing.record;
    }
    if (existing) {
      await disposeSession(existing);
    }
  }

  const sessionId = generateSessionId();
  const now = new Date().toISOString();

  const record: RuntimeComputerUsePreviewSession = {
    sessionId,
    conversationId,
    targetMode,
    streamKind,
    status: 'starting',
    controlMode: 'agent',
    viewportWidth: 1280,
    viewportHeight: 720,
    label: computerUseTargetModeLabel(targetMode),
    vncUrl: null,
    sandboxPhase: targetMode === 'sandbox' ? 'preflight' : null,
    sandboxMessage: targetMode === 'sandbox' ? 'Running sandbox pre-flight checks' : null,
    sandboxPreflightChecks: null,
    createdAt: now,
    updatedAt: now,
    error: null,
  };

  const handle: PreviewSessionHandle = {
    record,
    lastFrameBase64: null,
    lastFrameMime: 'image/png',
    screencastTimer: null,
    streamSubscribers: new Set(),
    captureInFlight: false,
    lastClickX: null,
    lastClickY: null,
  };

  sessions.set(sessionId, handle);
  sessionsByConversation.set(conversationId, sessionId);

  try {
    if (targetMode === 'sandbox') {
      await startSandboxVncBootstrap(handle);
      syncAgentInputBlockedFromSessions();
      await persistPreviewManifest(record);
      return record;
    }

    await ensureDesktopCaptureScope();
    await captureDesktopFrame(handle);

    if (!handle.lastFrameBase64) {
      throw new Error('Desktop capture returned no screenshot — verify cua-driver permissions');
    }

    record.status = 'ready';
    record.updatedAt = new Date().toISOString();
    startScreencast(handle);
    syncAgentInputBlockedFromSessions();
    await persistPreviewManifest(record);
    return record;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start computer-use preview';
    record.status = 'error';
    record.error = message;
    throw new Error(message);
  }
}

export async function refreshSandboxPreviewSession(
  sessionId: string,
): Promise<RuntimeComputerUsePreviewSession | null> {
  const handle = sessions.get(sessionId);
  if (!handle || handle.record.streamKind !== 'sandbox_vnc') {
    return handle?.record ?? null;
  }

  const binding = await resolveHarnessBinding({ workspaceRoot: resolveAppRoot() });
  const manifest = await readSandboxManifest(handle.record.conversationId, binding.workspaceRoot);
  applySandboxManifestToHandle(handle, manifest);
  await persistPreviewManifest(handle.record);
  return handle.record;
}

export function getComputerUsePreviewSession(sessionId: string): RuntimeComputerUsePreviewSession | null {
  const handle = sessions.get(sessionId);
  return handle?.record ?? null;
}

export function getComputerUsePreviewSessionForConversation(
  conversationId: string,
): RuntimeComputerUsePreviewSession | null {
  const sessionId = sessionsByConversation.get(conversationId);
  if (!sessionId) {
    return null;
  }
  return getComputerUsePreviewSession(sessionId);
}

export async function closeComputerUsePreviewSession(sessionId: string): Promise<boolean> {
  const handle = sessions.get(sessionId);
  if (!handle) {
    return false;
  }
  await disposeSession(handle);
  return true;
}

export function getComputerUsePreviewControlMode(sessionId: string): ComputerUseControlMode | null {
  const handle = sessions.get(sessionId);
  return handle?.record.controlMode ?? null;
}

export async function setComputerUsePreviewControlMode(
  sessionId: string,
  mode: ComputerUseControlMode,
): Promise<RuntimeComputerUsePreviewSession> {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Computer-use preview session ${sessionId} not found`);
  }

  handle.record.controlMode = mode;
  handle.record.updatedAt = new Date().toISOString();
  syncAgentInputBlockedFromSessions();
  await persistPreviewManifest(handle.record);
  return handle.record;
}

export async function performComputerUsePreviewClick(
  sessionId: string,
  x: number,
  y: number,
): Promise<void> {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Computer-use preview session ${sessionId} not found`);
  }
  if (handle.record.targetMode === 'sandbox') {
    throw new Error('Sandbox preview input uses noVNC Take Control — host click relay not available');
  }
  if (handle.record.controlMode !== 'user') {
    throw new Error('Control is with the agent — switch to Take control to click');
  }

  const result = await callCuaDriverTool('click', {
    x,
    y,
    scope: 'desktop',
    session: sessionId,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  handle.lastClickX = x;
  handle.lastClickY = y;
  handle.record.updatedAt = new Date().toISOString();
  await captureDesktopFrame(handle);
}

export async function performComputerUsePreviewType(
  sessionId: string,
  text: string,
): Promise<void> {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Computer-use preview session ${sessionId} not found`);
  }
  if (handle.record.targetMode === 'sandbox') {
    throw new Error('Sandbox preview input uses noVNC Take Control — host typing relay not available');
  }
  if (handle.record.controlMode !== 'user') {
    throw new Error('Control is with the agent — switch to Take control to type');
  }
  if (!text) {
    return;
  }

  const frontmost = await resolveFrontmostWindow();
  if (!frontmost) {
    throw new Error('Could not resolve frontmost window for typing');
  }

  const typeArgs: Record<string, unknown> = {
    text,
    pid: frontmost.pid,
    window_id: frontmost.windowId,
    delivery_mode: 'foreground',
    session: sessionId,
  };
  if (handle.lastClickX !== null && handle.lastClickY !== null) {
    typeArgs.x = handle.lastClickX;
    typeArgs.y = handle.lastClickY;
  }

  const result = await callCuaDriverTool('type_text', typeArgs);

  if (!result.ok) {
    throw new Error(result.error);
  }

  handle.record.updatedAt = new Date().toISOString();
  await captureDesktopFrame(handle);
}

export async function performComputerUsePreviewKeyPress(
  sessionId: string,
  key: string,
): Promise<void> {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Computer-use preview session ${sessionId} not found`);
  }
  if (handle.record.targetMode === 'sandbox') {
    throw new Error('Sandbox preview input uses noVNC Take Control — host keyboard relay not available');
  }
  if (handle.record.controlMode !== 'user') {
    throw new Error('Control is with the agent — switch to Take control for keyboard input');
  }

  const frontmost = await resolveFrontmostWindow();
  if (!frontmost) {
    throw new Error('Could not resolve frontmost window for key press');
  }

  const keyArgs: Record<string, unknown> = {
    key,
    pid: frontmost.pid,
    window_id: frontmost.windowId,
    delivery_mode: 'foreground',
    session: sessionId,
  };
  if (handle.lastClickX !== null && handle.lastClickY !== null) {
    keyArgs.x = handle.lastClickX;
    keyArgs.y = handle.lastClickY;
  }

  const result = await callCuaDriverTool('press_key', keyArgs);

  if (!result.ok) {
    throw new Error(result.error);
  }

  handle.record.updatedAt = new Date().toISOString();
  await captureDesktopFrame(handle);
}

export function subscribeComputerUsePreviewStream(
  sessionId: string,
  onFrame: (frameBase64: string, mime: string) => void,
): (() => void) | null {
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

export async function readComputerUsePreviewManifest(): Promise<Record<string, unknown> | null> {
  try {
    const dir = await sessionsDir();
    const raw = await readFile(join(dir, 'computer-use-preview.json'), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
