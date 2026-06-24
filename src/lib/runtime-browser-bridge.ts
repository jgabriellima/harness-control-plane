import { createServer } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';

import { resolveHarnessBinding } from './harness-binding';
import { resolveAppRoot } from './app-root';

export type BrowserSessionStatus = 'starting' | 'ready' | 'closed' | 'error';
export type BrowserControlMode = 'user' | 'agent';

export interface RuntimeBrowserSession {
  sessionId: string;
  conversationId: string;
  url: string;
  status: BrowserSessionStatus;
  createdAt: string;
  updatedAt: string;
  cdpEndpoint: string;
  renderMode: 'screencast';
  controlMode: BrowserControlMode;
  error: string | null;
}

interface BrowserSessionHandle {
  record: RuntimeBrowserSession;
  browser: Browser;
  page: Page;
  lastFrameBase64: string | null;
  screencastTimer: ReturnType<typeof setInterval> | null;
  streamSubscribers: Set<(frame: string) => void>;
}

const sessions = new Map<string, BrowserSessionHandle>();
const sessionsByConversation = new Map<string, string>();

const SCREENCAST_INTERVAL_MS = 500;

async function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to allocate CDP port'));
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
    server.on('error', reject);
  });
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'about:blank';
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('about:')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function generateSessionId(): string {
  return `browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function sessionsDir(): Promise<string> {
  const binding = await resolveHarnessBinding({ workspaceRoot: resolveAppRoot() });
  const dir = join(binding.harnessRoot, 'runtime-sessions');
  await mkdir(dir, { recursive: true });
  return dir;
}

async function persistCdpManifest(session: RuntimeBrowserSession): Promise<void> {
  const dir = await sessionsDir();
  const manifestPath = join(dir, 'browser-cdp.json');
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    active: {
      sessionId: session.sessionId,
      conversationId: session.conversationId,
      cdpEndpoint: session.cdpEndpoint,
      url: session.url,
      controlMode: session.controlMode,
    },
    mcpHint: {
      server: 'user-playwright',
      args: ['@playwright/mcp@latest', `--cdp-endpoint=${session.cdpEndpoint}`],
    },
  };
  await writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function clearCdpManifest(): Promise<void> {
  const dir = await sessionsDir();
  const manifestPath = join(dir, 'browser-cdp.json');
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

function startScreencast(handle: BrowserSessionHandle): void {
  if (handle.screencastTimer) {
    return;
  }

  handle.screencastTimer = setInterval(() => {
    void (async () => {
      try {
        const buffer = await handle.page.screenshot({ type: 'jpeg', quality: 72 });
        const frame = buffer.toString('base64');
        handle.lastFrameBase64 = frame;
        for (const subscriber of handle.streamSubscribers) {
          subscriber(frame);
        }
      } catch {
        // Page may be navigating — skip frame.
      }
    })();
  }, SCREENCAST_INTERVAL_MS);
}

function stopScreencast(handle: BrowserSessionHandle): void {
  if (handle.screencastTimer) {
    clearInterval(handle.screencastTimer);
    handle.screencastTimer = null;
  }
  handle.streamSubscribers.clear();
}

async function disposeSession(handle: BrowserSessionHandle): Promise<void> {
  stopScreencast(handle);
  sessions.delete(handle.record.sessionId);
  sessionsByConversation.delete(handle.record.conversationId);
  try {
    await handle.browser.close();
  } catch {
    // Browser may already be closed.
  }
  handle.record.status = 'closed';
  handle.record.updatedAt = new Date().toISOString();
  await clearCdpManifest();
}

export async function createBrowserSession(input: {
  url: string;
  conversationId?: string;
}): Promise<RuntimeBrowserSession> {
  const conversationId = input.conversationId?.trim() || 'default';
  const url = normalizeUrl(input.url);

  const existingId = sessionsByConversation.get(conversationId);
  if (existingId) {
    const existing = sessions.get(existingId);
    if (existing && existing.record.status === 'ready') {
      await navigateBrowserSession(existingId, url);
      return existing.record;
    }
  }

  const cdpPort = await allocatePort();
  const cdpEndpoint = `http://127.0.0.1:${cdpPort}`;
  const sessionId = generateSessionId();
  const now = new Date().toISOString();

  const record: RuntimeBrowserSession = {
    sessionId,
    conversationId,
    url,
    status: 'starting',
    createdAt: now,
    updatedAt: now,
    cdpEndpoint,
    renderMode: 'screencast',
    controlMode: 'agent',
    error: null,
  };

  try {
    const browser = await chromium.launch({
      headless: true,
      args: [`--remote-debugging-port=${cdpPort}`],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    record.status = 'ready';
    record.url = page.url();
    record.updatedAt = new Date().toISOString();

    const handle: BrowserSessionHandle = {
      record,
      browser,
      page,
      lastFrameBase64: null,
      screencastTimer: null,
      streamSubscribers: new Set(),
    };

    sessions.set(sessionId, handle);
    sessionsByConversation.set(conversationId, sessionId);
    startScreencast(handle);
    await persistCdpManifest(record);

    const initialFrame = await page.screenshot({ type: 'jpeg', quality: 72 });
    handle.lastFrameBase64 = initialFrame.toString('base64');

    return record;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start browser session';
    record.status = 'error';
    record.error = message;
    throw new Error(message);
  }
}

export async function navigateBrowserSession(sessionId: string, url: string): Promise<RuntimeBrowserSession> {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }

  const normalized = normalizeUrl(url);
  await handle.page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  handle.record.url = handle.page.url();
  handle.record.updatedAt = new Date().toISOString();
  await persistCdpManifest(handle.record);
  return handle.record;
}

export async function refreshBrowserSession(sessionId: string): Promise<RuntimeBrowserSession> {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }

  await handle.page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  handle.record.url = handle.page.url();
  handle.record.updatedAt = new Date().toISOString();
  await persistCdpManifest(handle.record);
  return handle.record;
}

export function getBrowserSession(sessionId: string): RuntimeBrowserSession | null {
  return sessions.get(sessionId)?.record ?? null;
}

export function getBrowserSessionForConversation(conversationId: string): RuntimeBrowserSession | null {
  const sessionId = sessionsByConversation.get(conversationId);
  if (!sessionId) {
    return null;
  }
  return getBrowserSession(sessionId);
}

export async function closeBrowserSession(sessionId: string): Promise<boolean> {
  const handle = sessions.get(sessionId);
  if (!handle) {
    return false;
  }
  await disposeSession(handle);
  return true;
}

export async function readBrowserCdpManifest(): Promise<Record<string, unknown> | null> {
  try {
    const dir = await sessionsDir();
    const raw = await readFile(join(dir, 'browser-cdp.json'), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function subscribeBrowserScreencast(
  sessionId: string,
  onFrame: (frameBase64: string) => void,
): (() => void) | null {
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

export function getBrowserControlMode(sessionId: string): BrowserControlMode | null {
  const handle = sessions.get(sessionId);
  return handle?.record.controlMode ?? null;
}

export async function setBrowserControlMode(
  sessionId: string,
  mode: BrowserControlMode,
): Promise<RuntimeBrowserSession> {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }
  handle.record.controlMode = mode;
  handle.record.updatedAt = new Date().toISOString();
  await persistCdpManifest(handle.record);
  return handle.record;
}

export async function performBrowserClick(
  sessionId: string,
  x: number,
  y: number,
): Promise<void> {
  const handle = sessions.get(sessionId);
  if (!handle) {
    throw new Error(`Browser session ${sessionId} not found`);
  }
  if (handle.record.controlMode !== 'user') {
    throw new Error('Browser control is with the agent — switch to User control to click');
  }
  await handle.page.mouse.click(x, y);
  handle.record.updatedAt = new Date().toISOString();
}

export function isBrowserToolName(tool: string): boolean {
  return tool.startsWith('browser_') || tool.startsWith('browser');
}

export function extractBrowserNavigateUrl(args: unknown): string | null {
  if (typeof args !== 'object' || args === null) {
    return null;
  }
  const record = args as Record<string, unknown>;
  const url = record.url ?? record.href ?? record.link;
  return typeof url === 'string' && url.trim().length > 0 ? normalizeUrl(url) : null;
}
