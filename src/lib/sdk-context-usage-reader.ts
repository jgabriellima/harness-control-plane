import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getDefaultSdkStateRoot } from '@cursor/sdk';

import {
  decodePromptContextUsageSnapshot,
  type SdkPromptContextUsageSnapshot,
  type SdkUsageTreeNode,
} from './sdk-context-usage-decode';

const execFileAsync = promisify(execFile);

export interface SdkContextUsageSnapshot extends SdkPromptContextUsageSnapshot {
  agentId: string;
  checkpointBlobId: string;
  source: 'sdk_checkpoint';
  updatedAt: string;
}

function agentStoreDirectory(agentId: string): string {
  const digest = createHash('sha256').update(agentId, 'utf8').digest('hex');
  return `agent-${digest}`;
}

async function querySqlite(databasePath: string, sql: string): Promise<string> {
  const { stdout } = await execFileAsync('sqlite3', [databasePath, sql], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}

async function readSystemPromptContent(storeDbPath: string): Promise<string | null> {
  const hex = await querySqlite(
    storeDbPath,
    `SELECT hex(data) FROM blobs WHERE instr(CAST(data AS TEXT), '"role":"system"') > 0 ORDER BY length(data) ASC LIMIT 1;`,
  );

  if (!hex) {
    return null;
  }

  const bytes = Buffer.from(hex, 'hex');
  const text = bytes.toString('utf8');

  try {
    const payload = JSON.parse(text) as { role?: string; content?: string };
    if (payload.role === 'system' && typeof payload.content === 'string' && payload.content.trim().length > 0) {
      return payload.content.trim();
    }
  } catch {
    return null;
  }

  return null;
}

function attachSystemPromptChild(
  categories: SdkPromptContextUsageSnapshot['categories'],
  systemPromptContent: string,
): void {
  const systemCategory = categories.find((entry) => entry.id === 'system_prompt');
  if (!systemCategory || systemCategory.children && systemCategory.children.length > 0) {
    return;
  }

  systemCategory.children = [
    {
      id: 'system:runtime',
      label: 'Runtime base prompt',
      tag: 'system:runtime',
      tokens: systemCategory.tokens ?? 0,
      contentPreview: systemPromptContent,
    },
  ];
}

async function readCheckpointBlob(
  stateRoot: string,
  agentId: string,
  blobId: string,
): Promise<Uint8Array | null> {
  const storeDbPath = `${stateRoot}/agents/${agentStoreDirectory(agentId)}/store.db`;
  const escapedBlobId = blobId.replace(/'/g, "''");
  const hex = await querySqlite(
    storeDbPath,
    `SELECT hex(data) FROM blobs WHERE id='${escapedBlobId}' LIMIT 1;`,
  );

  if (!hex) {
    return null;
  }

  const bytes = Buffer.from(hex, 'hex');
  return new Uint8Array(bytes);
}

export async function readSdkContextUsageSnapshot(input: {
  workspaceCwd: string;
  agentId: string;
}): Promise<SdkContextUsageSnapshot | null> {
  const agentId = input.agentId.trim();
  const workspaceCwd = input.workspaceCwd.trim();

  if (!agentId || !workspaceCwd) {
    return null;
  }

  const stateRoot = getDefaultSdkStateRoot(workspaceCwd);
  const indexDbPath = `${stateRoot}/index.db`;
  const escapedAgentId = agentId.replace(/'/g, "''");
  const checkpointRefJson = await querySqlite(
    indexDbPath,
    `SELECT latest_checkpoint_ref_json FROM agents WHERE agent_id='${escapedAgentId}' LIMIT 1;`,
  );

  if (!checkpointRefJson) {
    return null;
  }

  const checkpointRef = JSON.parse(checkpointRefJson) as { blobId?: string };
  const blobId = checkpointRef.blobId?.trim();
  if (!blobId) {
    return null;
  }

  const blob = await readCheckpointBlob(stateRoot, agentId, blobId);
  if (!blob) {
    return null;
  }

  const decoded = decodePromptContextUsageSnapshot(blob);
  if (!decoded) {
    return null;
  }

  const storeDbPath = `${stateRoot}/agents/${agentStoreDirectory(agentId)}/store.db`;
  const systemPromptContent = await readSystemPromptContent(storeDbPath);
  if (systemPromptContent) {
    attachSystemPromptChild(decoded.categories, systemPromptContent);
  }

  return {
    ...decoded,
    agentId,
    checkpointBlobId: blobId,
    source: 'sdk_checkpoint',
    updatedAt: new Date().toISOString(),
  };
}

export function flattenSdkUsageNodes(
  nodes: SdkUsageTreeNode[],
): Array<{ id: string; label: string; tokens: number }> {
  const flattened: Array<{ id: string; label: string; tokens: number }> = [];

  function visit(node: SdkUsageTreeNode): void {
    if (node.id && typeof node.tokens === 'number' && node.tokens > 0) {
      flattened.push({
        id: node.id,
        label: node.label ?? node.id,
        tokens: node.tokens,
      });
    }

    for (const child of node.children ?? []) {
      visit(child);
    }
  }

  for (const node of nodes) {
    visit(node);
  }

  return flattened;
}
