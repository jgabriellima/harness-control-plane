import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { resolveAppRoot } from '../app-root';
import { loadSessionStoreBinding } from './resolve-binding';
import type {
  NormalizedMessage,
  NormalizedTranscript,
  RuntimeSessionAdapter,
  SessionRefs,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function expandHome(pathValue: string): string {
  return pathValue.startsWith('~/') ? join(homedir(), pathValue.slice(2)) : pathValue;
}

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function extractTextContent(message: Record<string, unknown>): string {
  const nested = message.message;
  if (!isRecord(nested) || !Array.isArray(nested.content)) {
    return '';
  }

  const parts: string[] = [];
  for (const block of nested.content) {
    if (!isRecord(block)) {
      continue;
    }
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
    if (block.type === 'tool_use' && typeof block.name === 'string') {
      parts.push(`[tool: ${block.name}]`);
    }
  }

  return parts.join('\n').trim();
}

function parseTranscriptLine(
  line: string,
  index: number,
  conversationId: string,
  vendorAgentId: string,
): NormalizedMessage[] {
  let raw: unknown;
  try {
    raw = JSON.parse(line) as unknown;
  } catch {
    return [];
  }

  if (!isRecord(raw)) {
    return [];
  }

  const roleRaw = raw.role;
  const id = `vendor-${vendorAgentId}-${index}`;

  if (roleRaw === 'user') {
    const content = extractTextContent(raw);
    return content.length > 0 ? [{ id, role: 'user', content }] : [];
  }

  if (roleRaw === 'assistant') {
    const nested = raw.message;
    const messages: NormalizedMessage[] = [];

    if (isRecord(nested) && Array.isArray(nested.content)) {
      const textParts: string[] = [];
      for (const block of nested.content) {
        if (!isRecord(block)) {
          continue;
        }
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
          textParts.push(block.text);
        }
        if (block.type === 'tool_use' && typeof block.name === 'string') {
          messages.push({
            id: `${id}-tool-${block.name}`,
            role: 'tool',
            content: `${block.name} · completed`,
            toolName: block.name,
            toolStatus: 'completed',
            toolArgs: block.input,
          });
        }
      }

      const text = textParts.join('\n').trim();
      if (text.length > 0) {
        messages.unshift({ id, role: 'assistant', content: text });
      }
    }

    return messages;
  }

  return [];
}

export class CursorLocalAdapter implements RuntimeSessionAdapter {
  readonly vendor = 'cursor-local';

  async resolveDataRoot(harnessRoot?: string): Promise<string> {
    const binding = await loadSessionStoreBinding(harnessRoot);

    if (binding.mode === 'explicit') {
      const explicit = process.env[binding.dataRootEnv]?.trim();
      if (!explicit) {
        throw new Error(`${binding.dataRootEnv} is required for explicit session_store mode`);
      }
      const resolved = expandHome(explicit);
      if (!(await pathExists(resolved))) {
        throw new Error(`explicit data root not found: ${resolved}`);
      }
      return resolved;
    }

    const envRoot = process.env[binding.dataRootEnv]?.trim();
    if (envRoot && (await pathExists(expandHome(envRoot)))) {
      return expandHome(envRoot);
    }

    const defaultRoot = join(homedir(), '.cursor');
    if (await pathExists(defaultRoot)) {
      return defaultRoot;
    }

    throw new Error('cursor-local data root not found');
  }

  workspaceCwd(): string {
    return resolveAppRoot();
  }

  async resolveSessionRefs(vendorAgentId: string, cwd: string): Promise<SessionRefs> {
    const dataRoot = await this.resolveDataRoot(cwd);
    const slug = await this.resolveProjectSlug(dataRoot, vendorAgentId);
    const transcriptRef = `projects/${slug}/agent-transcripts/${vendorAgentId}/${vendorAgentId}.jsonl`;
    const transcriptPath = join(dataRoot, transcriptRef);

    if (!(await pathExists(transcriptPath))) {
      throw new Error(`transcript missing: ${transcriptPath}`);
    }

    const storeRef = await this.resolveStoreRef(dataRoot, slug, vendorAgentId);

    return {
      vendorAgentId,
      vendorDataRoot: dataRoot,
      vendorProjectSlug: slug,
      cwd,
      transcriptRef,
      storeRef,
    };
  }

  async resolveProjectSlug(dataRoot: string, vendorAgentId: string): Promise<string> {
    const projectsRoot = join(dataRoot, 'projects');
    const entries = await readdir(projectsRoot, { withFileTypes: true });
    const matches: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const transcriptPath = join(
        projectsRoot,
        entry.name,
        'agent-transcripts',
        vendorAgentId,
        `${vendorAgentId}.jsonl`,
      );
      if (await pathExists(transcriptPath)) {
        matches.push(entry.name);
      }
    }

    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      throw new Error(`ambiguous project slug for ${vendorAgentId}`);
    }
    throw new Error(`no transcript project for ${vendorAgentId}`);
  }

  async resolveStoreRef(dataRoot: string, slug: string, vendorAgentId: string): Promise<string> {
    const storeRoot = join(dataRoot, 'projects', slug, 'sdk-agent-store');
    const hashDirs = await readdir(storeRoot, { withFileTypes: true });

    for (const entry of hashDirs) {
      if (!entry.isDirectory()) {
        continue;
      }
      const indexDb = join(storeRoot, entry.name, 'index.db');
      if (!(await pathExists(indexDb))) {
        continue;
      }
      // Store ref validation deferred to Python registry validate; TS only needs path contract.
      const storeRef = `projects/${slug}/sdk-agent-store/${entry.name}/`;
      const agentsDir = join(storeRoot, entry.name, 'agents');
      if (await pathExists(agentsDir)) {
        return storeRef;
      }
    }

    // Fallback: first hash dir with index.db (validate script checks agent row)
    for (const entry of hashDirs) {
      if (!entry.isDirectory()) {
        continue;
      }
      const indexDb = join(storeRoot, entry.name, 'index.db');
      if (await pathExists(indexDb)) {
        return `projects/${slug}/sdk-agent-store/${entry.name}/`;
      }
    }

    throw new Error(`no store index for ${vendorAgentId}`);
  }

  async getTranscript(vendorAgentId: string, refs: SessionRefs): Promise<NormalizedTranscript> {
    const transcriptPath = join(refs.vendorDataRoot, refs.transcriptRef);
    const raw = await readFile(transcriptPath, 'utf8');
    const lines = raw.split('\n').filter((line) => line.trim().length > 0);

    const messages: NormalizedMessage[] = [];
    lines.forEach((line, index) => {
      const parsed = parseTranscriptLine(line, index, refs.vendorAgentId, vendorAgentId);
      messages.push(...parsed);
    });

    return {
      conversationId: refs.vendorAgentId,
      vendorAgentId,
      messages,
    };
  }
}

let cachedAdapter: CursorLocalAdapter | undefined;

export function getCursorLocalAdapter(): CursorLocalAdapter {
  if (!cachedAdapter) {
    cachedAdapter = new CursorLocalAdapter();
  }
  return cachedAdapter;
}
