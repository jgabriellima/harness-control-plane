import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { resolveBindingFromStamp } from './harness-binding-stamp';
import type { HarnessBinding, RuntimeBindingStamp } from './harness-binding-types';
import { resolvePlatformAppRoot } from './repo-root';

const RUNTIME_BINDING_REL = join('.cursor', 'runtime-binding.yaml');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function runtimeBindingPath(workspaceRoot: string): string {
  return join(workspaceRoot, RUNTIME_BINDING_REL);
}

export function hasRuntimeBindingStamp(workspaceRoot: string): boolean {
  return existsSync(runtimeBindingPath(workspaceRoot));
}

function parseRuntimeBindingStamp(raw: unknown): RuntimeBindingStamp {
  if (!isRecord(raw)) {
    throw new Error('Invalid runtime-binding.yaml root');
  }
  if (raw.apiVersion !== 'proc.jambu/v1' || raw.kind !== 'RuntimeBinding') {
    throw new Error('runtime-binding.yaml must be proc.jambu/v1 RuntimeBinding');
  }
  return raw as RuntimeBindingStamp;
}

async function loadRuntimeBindingStamp(workspaceRoot: string): Promise<RuntimeBindingStamp> {
  const stampPath = runtimeBindingPath(workspaceRoot);
  const raw = await readFile(stampPath, 'utf8');
  return parseRuntimeBindingStamp(parseYaml(raw));
}

export interface ResolveHarnessBindingOptions {
  /** Preferred ADR-040 root input. */
  projectRoot?: string;
  /** Backward-compatible alias for projectRoot. */
  workspaceRoot?: string;
}

/**
 * Canonical harness path resolver (ADR-039 §2, dev cutover: stamp-only).
 * Requires `{workspaceRoot}/.cursor/runtime-binding.yaml` — no legacy synthesizer.
 */
export async function resolveHarnessBinding(
  options: ResolveHarnessBindingOptions = {},
): Promise<HarnessBinding> {
  const workspaceRoot =
    options.workspaceRoot?.trim() ||
    options.projectRoot?.trim() ||
    resolvePlatformAppRoot(options.projectRoot);

  if (!hasRuntimeBindingStamp(workspaceRoot)) {
    throw new Error(
      `No harness binding for workspace ${workspaceRoot}: missing ${RUNTIME_BINDING_REL}`,
    );
  }

  const stamp = await loadRuntimeBindingStamp(workspaceRoot);
  return resolveBindingFromStamp(workspaceRoot, stamp);
}

export type { HarnessBinding, HarnessBindingSource, HarnessCommandNamespace } from './harness-binding-types';
