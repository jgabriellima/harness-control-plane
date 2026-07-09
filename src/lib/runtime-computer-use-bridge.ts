import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { SDKCustomTool, SDKJsonValue } from '@cursor/sdk';

import { isComputerUseAgentInputBlocked } from './runtime-computer-use-control-gate';
import { loadUIConfig } from './ui-config.ts';
import { resolveProjectRoot } from './project-root.ts';

const execFileAsync = promisify(execFile);

const DEFAULT_HOST_BUNDLE_ID = 'ai.jambu.control-plane';

let resolvedHostBundleId: string | null = null;
let hostBundleIdPromise: Promise<string> | null = null;

/**
 * macOS bundle id for the control plane host — echoed in driver permission reports.
 * Resolved from ui.config distribution.desktop.identifier at runtime (ADR-048).
 */
export async function resolveHostBundleId(): Promise<string> {
  if (resolvedHostBundleId) {
    return resolvedHostBundleId;
  }

  if (!hostBundleIdPromise) {
    hostBundleIdPromise = (async () => {
      const envOverride = process.env.JAMBU_HOST_BUNDLE_ID?.trim();
      if (envOverride) {
        resolvedHostBundleId = envOverride;
        return envOverride;
      }

      try {
        const config = await loadUIConfig(resolveProjectRoot());
        const identifier = config.distribution?.desktop?.identifier?.trim();
        if (identifier) {
          resolvedHostBundleId = identifier;
          return identifier;
        }
      } catch {
        // fall through to default
      }

      resolvedHostBundleId = DEFAULT_HOST_BUNDLE_ID;
      return DEFAULT_HOST_BUNDLE_ID;
    })();
  }

  return hostBundleIdPromise;
}

/** Synchronous read — prefers env injection from Tauri sidecar; otherwise default until async resolve completes. */
export function getHostBundleIdSync(): string {
  return (
    process.env.JAMBU_HOST_BUNDLE_ID?.trim() ??
    resolvedHostBundleId ??
    DEFAULT_HOST_BUNDLE_ID
  );
}

/** @deprecated Use resolveHostBundleId() — retained for transitional imports */
export const JAMBU_HOST_BUNDLE_ID = DEFAULT_HOST_BUNDLE_ID;

const CATALOG_TTL_MS = 300_000;
const DEFAULT_CALL_TIMEOUT_MS = 45_000;
const HEALTH_PROBE_TIMEOUT_MS = 8_000;

interface CuaMcpToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, SDKJsonValue>;
}

let catalogCache: { tools: CuaMcpToolDefinition[]; loadedAt: number } | null = null;
let customToolsCache: Record<string, SDKCustomTool> | null = null;

function driverExecEnv(): NodeJS.ProcessEnv {
  const localBin = join(homedir(), '.local/bin');
  const pathValue = process.env.PATH ?? '';
  const augmented = pathValue.includes(localBin) ? pathValue : `${localBin}:${pathValue}`;
  return { ...process.env, PATH: augmented };
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function callCuaDriverTool(
  toolName: string,
  args: Record<string, SDKJsonValue> = {},
  options: { timeoutMs?: number } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const jsonArgs = JSON.stringify(args);

  try {
    const result = await execFileAsync('cua-driver', ['call', toolName, jsonArgs], {
      env: driverExecEnv(),
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });

    const stdout = String(result.stdout);
    const parsed = extractJsonObject(stdout);
    if (parsed) {
      return { ok: true, data: parsed };
    }

    if (stdout.trim().length > 0) {
      return { ok: true, data: stdout.trim() };
    }

    return { ok: false, error: 'cua-driver call returned empty output' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

export interface ComputerUseHealthProbe {
  ok: boolean;
  latencyMs: number;
  daemonReachable: boolean;
  error: string | null;
}

export async function probeComputerUseHealth(): Promise<ComputerUseHealthProbe> {
  const startedAt = Date.now();
  const result = await callCuaDriverTool('list_apps', {}, { timeoutMs: HEALTH_PROBE_TIMEOUT_MS });
  const latencyMs = Date.now() - startedAt;

  if (result.ok) {
    return {
      ok: true,
      latencyMs,
      daemonReachable: true,
      error: null,
    };
  }

  return {
    ok: false,
    latencyMs,
    daemonReachable: false,
    error: result.error,
  };
}

async function loadCuaToolCatalog(): Promise<CuaMcpToolDefinition[]> {
  if (catalogCache && Date.now() - catalogCache.loadedAt < CATALOG_TTL_MS) {
    return catalogCache.tools;
  }

  const result = await execFileAsync('cua-driver', ['dump-docs', '--type', 'json'], {
    env: driverExecEnv(),
    timeout: 20_000,
    maxBuffer: 8 * 1024 * 1024,
  });

  const parsed = JSON.parse(String(result.stdout)) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.mcp) || !Array.isArray(parsed.mcp.tools)) {
    throw new Error('cua-driver dump-docs did not return mcp.tools');
  }

  const tools = parsed.mcp.tools
    .filter((entry): entry is CuaMcpToolDefinition => {
      return (
        isRecord(entry) &&
        typeof entry.name === 'string' &&
        typeof entry.description === 'string' &&
        isRecord(entry.input_schema)
      );
    })
    .map((entry) => ({
      name: entry.name,
      description: entry.description,
      input_schema: entry.input_schema as Record<string, SDKJsonValue>,
    }));

  catalogCache = { tools, loadedAt: Date.now() };
  return tools;
}

function formatToolResult(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  return JSON.stringify(data, null, 2);
}

/**
 * SDK custom tools that proxy to cua-driver via the harness Node process.
 * Avoids sandboxed shell invocation and keeps TCC on CuaDriver, not Cursor SDK.
 */
export async function buildComputerUseCustomTools(): Promise<Record<string, SDKCustomTool>> {
  if (customToolsCache) {
    return customToolsCache;
  }

  const catalog = await loadCuaToolCatalog();
  const tools: Record<string, SDKCustomTool> = {};

  for (const definition of catalog) {
    tools[definition.name] = {
      description: `${definition.description}\n\n(Jambu computer-use bridge → CuaDriver daemon)`,
      inputSchema: definition.input_schema,
      execute: async (args) => {
        if (isComputerUseAgentInputBlocked()) {
          return {
            content: [
              {
                type: 'text',
                text: 'Computer use paused — operator has Take control in the preview panel. Ask them to return control to the agent, then retry.',
              },
            ],
            isError: true,
          };
        }

        const result = await callCuaDriverTool(definition.name, args);
        if (!result.ok) {
          return {
            content: [{ type: 'text', text: `Computer use error: ${result.error}` }],
            isError: true,
          };
        }
        return formatToolResult(result.data);
      },
    };
  }

  customToolsCache = tools;
  return tools;
}

export function clearComputerUseBridgeCache(): void {
  catalogCache = null;
  customToolsCache = null;
}
