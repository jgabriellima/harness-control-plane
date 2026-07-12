import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { InstructionCorpusEntry, InstructionCorpusSnapshot } from './context-usage-types';

const INSTRUCTION_SCOPES: Record<
  string,
  { extensions: string[]; loadContext: string; globName: string }
> = {
  '.cursor/rules': { extensions: ['.mdc', '.md'], loadContext: 'always_injected', globName: 'rules' },
  '.cursor/memories': {
    extensions: ['.md'],
    loadContext: 'always_injected',
    globName: 'memories',
  },
  '.cursor/skills': { extensions: ['.md'], loadContext: 'on_invocation', globName: 'skills' },
  '.cursor/commands': { extensions: ['.md'], loadContext: 'on_invocation', globName: 'commands' },
  '.cursor/agents': { extensions: ['.md'], loadContext: 'on_invocation', globName: 'agents' },
};

const EXCLUDE_BASENAMES = new Set(['README.md', 'ADR-000-template.md']);

function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function extractInstructionMetadata(text: string): {
  title?: string;
  description?: string;
  contentPreview?: string;
} {
  let body = text;
  let description: string | undefined;

  const frontmatterMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatterMatch) {
    body = text.slice(frontmatterMatch[0].length);
    const descriptionMatch = frontmatterMatch[1].match(/^description:\s*(.+)$/m);
    if (descriptionMatch) {
      description = descriptionMatch[1]
        .trim()
        .replace(/^['"]|['"]$/g, '');
    }
  }

  const headingMatch = body.match(/^#\s+(.+)$/m);
  const title = headingMatch?.[1]?.trim();
  const normalized = body.replace(/\s+/g, ' ').trim();
  const contentPreview =
    normalized.length > 0
      ? `${normalized.slice(0, 420)}${normalized.length > 420 ? '…' : ''}`
      : undefined;

  return {
    title: title && title.length > 0 ? title : undefined,
    description,
    contentPreview,
  };
}

async function walkFiles(dir: string, extensions: string[]): Promise<string[]> {
  if (!existsSync(dir)) {
    return [];
  }

  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkFiles(fullPath, extensions);
      results.push(...nested);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = entry.name.includes('.') ? `.${entry.name.split('.').pop()}` : '';
    if (extensions.includes(ext) && !EXCLUDE_BASENAMES.has(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

async function readScopeEntries(
  workspaceRoot: string,
  scopePath: string,
  meta: (typeof INSTRUCTION_SCOPES)[string],
): Promise<InstructionCorpusEntry[]> {
  const fullScope = join(workspaceRoot, scopePath);
  const files = await walkFiles(fullScope, meta.extensions);
  const entries: InstructionCorpusEntry[] = [];

  for (const filePath of files) {
    try {
      const text = await readFile(filePath, 'utf8');
      const metadata = extractInstructionMetadata(text);
      entries.push({
        path: relative(workspaceRoot, filePath),
        scope: scopePath,
        tokens: estimateTokens(text),
        loadContext: meta.loadContext,
        title: metadata.title,
        description: metadata.description,
        contentPreview: metadata.contentPreview,
      });
    } catch {
      continue;
    }
  }

  return entries;
}

function resolveRepositoryLabel(workspaceRoot: string): string {
  const parts = workspaceRoot.split(/[/\\]/);
  const leaf = parts[parts.length - 1] ?? 'workspace';
  const parent = parts[parts.length - 2];
  if (parent && parent !== 'workspaces') {
    return parent;
  }
  return leaf;
}

export async function collectInstructionCorpus(
  workspaceRoot: string,
): Promise<InstructionCorpusSnapshot> {
  const entries: InstructionCorpusEntry[] = [];

  for (const [scopePath, meta] of Object.entries(INSTRUCTION_SCOPES)) {
    const scopeEntries = await readScopeEntries(workspaceRoot, scopePath, meta);
    entries.push(...scopeEntries);
  }

  const scopeTotals: Record<string, number> = {};
  for (const entry of entries) {
    scopeTotals[entry.scope] = (scopeTotals[entry.scope] ?? 0) + entry.tokens;
  }

  return {
    repository: resolveRepositoryLabel(workspaceRoot),
    workspaceRoot,
    tokenizer: 'heuristic:char/4',
    entries,
    scopeTotals,
    updatedAt: new Date().toISOString(),
  };
}

export function estimateRuntimeOverhead(corpus: InstructionCorpusSnapshot): {
  systemPromptTokens: number;
  toolDefinitionTokens: number;
  mcpToolTokens: number;
  subagentDefinitionTokens: number;
  toolCount: number;
  mcpServerCount: number;
  subagentCount: number;
} {
  const agentEntries = corpus.entries.filter((entry) => entry.scope === '.cursor/agents');
  const subagentDefinitionTokens = agentEntries.reduce((sum, entry) => sum + entry.tokens, 0);
  const subagentCount = agentEntries.length;

  const toolCount = 20;
  const mcpServerCount = 5;
  const tokensPerTool = 420;
  const tokensPerMcpServer = 520;

  return {
    systemPromptTokens: 476,
    toolDefinitionTokens: toolCount * tokensPerTool,
    mcpToolTokens: mcpServerCount * tokensPerMcpServer,
    subagentDefinitionTokens: subagentDefinitionTokens > 0 ? subagentDefinitionTokens : 1500,
    toolCount,
    mcpServerCount,
    subagentCount: subagentCount > 0 ? subagentCount : 12,
  };
}
