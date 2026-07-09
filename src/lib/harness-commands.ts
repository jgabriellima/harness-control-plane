import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import { hasRuntimeBindingStamp, resolveHarnessBinding } from './harness-binding';
import type { HarnessCommand } from './harness-types';
import { resolveHostRepoRoot, resolvePlatformAppRoot } from './repo-root';

export type { HarnessCommand };

const SLASH_COMMAND_RE = /^\/[\w:.-]+/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const H1_COMMAND_RE = /^#\s+(\/[\w:.-]+)/m;

export type HarnessCommandScope = 'global' | 'local';

function parseFrontmatter(raw: string): Record<string, string> {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    return {};
  }

  const frontmatter: Record<string, string> = {};

  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key.length > 0) {
      frontmatter[key] = value;
    }
  }

  return frontmatter;
}

function parseSlashCommand(
  raw: string,
  lifecyclePrefix: string,
  cliPrefix: string,
): string | null {
  const h1Match = H1_COMMAND_RE.exec(raw);
  if (h1Match) {
    const candidate = h1Match[1].trim();
    if (SLASH_COMMAND_RE.test(candidate)) {
      return candidate;
    }
  }

  const frontmatter = parseFrontmatter(raw);
  const name = frontmatter.name?.trim();
  const commandPrefix = `${cliPrefix}-`;
  if (!name || !name.startsWith(commandPrefix)) {
    return null;
  }

  const suffix = name.slice(commandPrefix.length);
  if (suffix.length === 0) {
    return null;
  }

  const lifecycle = lifecyclePrefix.endsWith(':')
    ? lifecyclePrefix.slice(0, -1)
    : lifecyclePrefix;
  return `${lifecycle}:${suffix}`;
}

function parseDescription(raw: string): string {
  const frontmatter = parseFrontmatter(raw);
  return frontmatter.description?.trim() ?? '';
}

/**
 * Platform shell root for inherited global commands (ADR-047).
 * Returns null when workspaceRoot already is the platform shell.
 */
export function resolveGlobalCommandsWorkspaceRoot(workspaceRoot: string): string | null {
  const normalizedLocal = resolve(workspaceRoot);

  const explicitOverride =
    process.env.BUSINESS_PLATFORM_ROOT?.trim() ??
    process.env.CONTROL_PLANE_PLATFORM_ROOT?.trim();
  if (explicitOverride) {
    const normalizedOverride = resolve(explicitOverride);
    if (
      normalizedOverride !== normalizedLocal &&
      hasRuntimeBindingStamp(normalizedOverride)
    ) {
      return normalizedOverride;
    }
  }

  const workspacesMarker = `${sep}workspaces${sep}`;
  if (normalizedLocal.includes(workspacesMarker)) {
    const hostRepo = normalizedLocal.split(workspacesMarker)[0];
    const appCandidate = join(hostRepo, 'app');
    if (hasRuntimeBindingStamp(appCandidate)) {
      return resolve(appCandidate);
    }
  }

  const candidates: string[] = [];
  try {
    candidates.push(resolvePlatformAppRoot());
  } catch {
    // continue to host-repo fallback
  }

  const hostRepo = resolveHostRepoRoot();
  candidates.push(join(hostRepo, 'app'));

  for (const candidate of candidates) {
    const normalizedCandidate = resolve(candidate);
    if (normalizedCandidate === normalizedLocal) {
      continue;
    }
    if (hasRuntimeBindingStamp(normalizedCandidate)) {
      return normalizedCandidate;
    }
  }

  return null;
}

async function scanCommandsDir(
  commandsDir: string,
  scope: HarnessCommandScope,
  lifecyclePrefix: string,
  cliPrefix: string,
): Promise<HarnessCommand[]> {
  let entries: string[];

  try {
    entries = await readdir(commandsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const commands: HarnessCommand[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.md') || entry === 'README.md') {
      continue;
    }

    const filePath = join(commandsDir, entry);
    const raw = await readFile(filePath, 'utf8');
    const command = parseSlashCommand(raw, lifecyclePrefix, cliPrefix);
    if (!command) {
      continue;
    }

    commands.push({
      command,
      description: parseDescription(raw),
      sourceFile: entry,
      scope,
    });
  }

  return commands;
}

function mergeHarnessCommands(global: HarnessCommand[], local: HarnessCommand[]): HarnessCommand[] {
  const merged = new Map<string, HarnessCommand>();
  for (const item of global) {
    merged.set(item.command, item);
  }
  for (const item of local) {
    merged.set(item.command, item);
  }
  return [...merged.values()].sort((left, right) => left.command.localeCompare(right.command));
}

export async function listHarnessCommands(workspaceRoot?: string): Promise<HarnessCommand[]> {
  const localBinding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const localCommands = await scanCommandsDir(
    localBinding.commandsDir,
    'local',
    localBinding.commandNamespace.lifecycle,
    localBinding.cliPrefix,
  );

  const globalRoot = workspaceRoot
    ? resolveGlobalCommandsWorkspaceRoot(workspaceRoot)
    : null;

  if (!globalRoot) {
    return localCommands.sort((left, right) => left.command.localeCompare(right.command));
  }

  const globalBinding = await resolveHarnessBinding({ workspaceRoot: globalRoot });
  const globalCommands = await scanCommandsDir(
    globalBinding.commandsDir,
    'global',
    globalBinding.commandNamespace.lifecycle,
    globalBinding.cliPrefix,
  );

  return mergeHarnessCommands(globalCommands, localCommands);
}

export { isKnownSlashCommand, isUnknownSlashCommand } from './slash-command';
