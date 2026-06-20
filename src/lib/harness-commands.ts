import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveHarnessBinding } from './harness-binding';
import type { HarnessCommand } from './harness-types';

export type { HarnessCommand };

const SLASH_COMMAND_RE = /^\/[\w:.-]+/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const H1_COMMAND_RE = /^#\s+(\/[\w:.-]+)/m;

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

export async function listHarnessCommands(workspaceRoot?: string): Promise<HarnessCommand[]> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const commandsDir = binding.commandsDir;
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
    const command = parseSlashCommand(
      raw,
      binding.commandNamespace.lifecycle,
      binding.cliPrefix,
    );
    if (!command) {
      continue;
    }

    commands.push({
      command,
      description: parseDescription(raw),
      sourceFile: entry,
    });
  }

  return commands.sort((left, right) => left.command.localeCompare(right.command));
}

export { isKnownSlashCommand, isUnknownSlashCommand } from './slash-command';
