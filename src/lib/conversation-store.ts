import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveHarnessBinding } from './harness-binding';
import { resolveAppRoot } from './app-root';
import type { ConversationSummary } from './harness-types';
import {
  bindSession,
  readSessionIndex,
  rebuildSessionIndex,
} from './runtime-session-registry';
import { loadConversationMessages } from './runtime-orchestrator';
import { isPlaceholderSessionTitle } from './session-title';
import { DEFAULT_WORKSPACE_ID } from './workspace-manager';

export interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'thinking';
  content: string;
  toolName?: string;
  toolStatus?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
}

function resolveWorkspaceRoot(workspaceRoot?: string): string {
  return workspaceRoot?.trim() || resolveAppRoot();
}

function generateConversationId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `conv-${stamp}-${suffix}`;
}

async function writeSessionIndex(
  conversations: ConversationSummary[],
  workspaceRoot?: string,
): Promise<void> {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const { harnessRoot } = await resolveHarnessBinding({ workspaceRoot: root });
  const sessionsDir = join(harnessRoot, 'runtime-sessions');
  const indexPath = join(sessionsDir, 'index.json');
  await mkdir(sessionsDir, { recursive: true });
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    conversations: conversations.map(({ active: _active, ...conversation }) => ({
      ...conversation,
      ...(conversation.agentId ? { agentId: conversation.agentId } : {}),
    })),
  };
  await writeFile(indexPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readIndexConversations(workspaceRoot?: string): Promise<ConversationSummary[]> {
  const index = await readSessionIndex(resolveWorkspaceRoot(workspaceRoot));
  return index.conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    projectId: conversation.projectId,
    updatedAt: conversation.updatedAt,
    active: false,
    agentId: conversation.agentId,
  }));
}

const LEGACY_MOCK_CONVERSATION_IDS = new Set([
  'conv-2',
  'conv-3',
  'conv-4',
  'conv-5',
]);

export async function listProfileConversations(
  workspaceRoot?: string,
  projectId?: string,
  options?: { includeArchived?: boolean },
): Promise<ConversationSummary[]> {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const sessionIndex = await readSessionIndex(root);
  const [conversations, bindings] = await Promise.all([
    readIndexConversations(root),
    import('./runtime-session-registry').then((module) => module.readLatestBindings(root)),
  ]);

  const archivedById = new Map(
    sessionIndex.conversations.map((entry) => [entry.id, entry.archived === true]),
  );

  const activeSessions: ConversationSummary[] = [];

  for (const conversation of conversations) {
    if (LEGACY_MOCK_CONVERSATION_IDS.has(conversation.id)) {
      continue;
    }

    if (projectId && conversation.projectId !== projectId) {
      continue;
    }

    if (!options?.includeArchived && archivedById.get(conversation.id)) {
      continue;
    }

    const boundAgentId = bindings.get(conversation.id)?.vendorAgentId;
    const agentId = conversation.agentId ?? boundAgentId;

    if (isPlaceholderSessionTitle(conversation.title) && !agentId) {
      continue;
    }

    activeSessions.push({
      ...conversation,
      agentId,
      active: false,
    });
  }

  const filtered = activeSessions;

  return filtered.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function touchConversation(
  workspaceRoot: string,
  conversationId: string,
): Promise<void> {
  const conversations = await readIndexConversations(workspaceRoot);
  let touched = false;

  const updated = conversations.map((conversation) => {
    if (conversation.id !== conversationId) {
      return conversation;
    }
    touched = true;
    return {
      ...conversation,
      updatedAt: new Date().toISOString(),
    };
  });

  if (touched) {
    await writeSessionIndex(updated, workspaceRoot);
  }
}

export async function createConversation(
  workspaceRoot: string,
  input: {
    title?: string;
    projectId?: string;
  },
): Promise<ConversationSummary> {
  const conversations = await readIndexConversations(workspaceRoot);
  const now = new Date().toISOString();
  const conversation: ConversationSummary = {
    id: generateConversationId(),
    title: input.title?.trim() || 'New chat',
    projectId: input.projectId?.trim() || DEFAULT_WORKSPACE_ID,
    updatedAt: now,
    active: true,
  };

  await writeSessionIndex(
    [conversation, ...conversations.map((item) => ({ ...item, active: false }))],
    workspaceRoot,
  );

  return { ...conversation, agentId: undefined };
}

export async function updateConversationAgent(
  workspaceRoot: string,
  conversationId: string,
  agentId: string,
): Promise<ConversationSummary | null> {
  await bindSession({
    harnessConversationId: conversationId,
    vendorAgentId: agentId,
    workspaceRoot: resolveWorkspaceRoot(workspaceRoot),
  });

  const index = await rebuildSessionIndex(resolveWorkspaceRoot(workspaceRoot));
  const conversation = index.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    return null;
  }

  return {
    id: conversation.id,
    title: conversation.title,
    projectId: conversation.projectId,
    updatedAt: conversation.updatedAt,
    active: false,
    agentId: conversation.agentId,
  };
}

export async function getConversationById(
  workspaceRoot: string,
  conversationId: string,
): Promise<ConversationSummary | null> {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const [conversations, bindings] = await Promise.all([
    readIndexConversations(root),
    import('./runtime-session-registry').then((module) => module.readLatestBindings(root)),
  ]);
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    return null;
  }

  const boundAgentId = bindings.get(conversation.id)?.vendorAgentId;
  return {
    ...conversation,
    agentId: conversation.agentId ?? boundAgentId,
  };
}

export async function loadConversationTranscript(
  workspaceRoot: string,
  conversationId: string,
): Promise<StoredChatMessage[]> {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const conversation = await getConversationById(root, conversationId);
  if (!conversation?.agentId) {
    return [];
  }

  const messages = await loadConversationMessages(root, conversationId, conversation.agentId);
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    toolName: message.toolName,
    toolStatus: message.toolStatus,
    toolArgs: message.toolArgs,
    toolResult: message.toolResult,
  }));
}

export async function deriveAndUpdateSessionTitle(
  workspaceRoot: string,
  conversationId: string,
  message: string | undefined,
  agentId?: string | null,
): Promise<void> {
  try {
    const root = resolveWorkspaceRoot(workspaceRoot);
    const index = await readSessionIndex(root);
    const conv = index.conversations.find((c) => c.id === conversationId);
    const updatedConversations = index.conversations.map((c) => ({ ...c }));

    if (conv && message && message.trim().length > 0) {
      const title = message.trim().split('\n')[0].slice(0, 120);
      const idx = updatedConversations.findIndex((c) => c.id === conversationId);
      if (idx >= 0) {
        updatedConversations[idx].title = title;
        await writeSessionIndex(updatedConversations as ConversationSummary[], root);
      }
    }

    if (agentId) {
      await bindSession({
        harnessConversationId: conversationId,
        vendorAgentId: agentId,
        workspaceRoot: root,
      });
      await rebuildSessionIndex(root);
    }
  } catch (err) {
    console.warn('deriveAndUpdateSessionTitle failed', err);
  }
}

export async function patchConversation(
  workspaceRoot: string,
  conversationId: string,
  input: { title?: string | undefined; archived?: boolean | undefined; projectId?: string | undefined },
): Promise<ConversationSummary | null> {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const index = await readSessionIndex(root);
  const idx = index.conversations.findIndex((c) => c.id === conversationId);
  if (idx === -1) return null;
  const conv = { ...index.conversations[idx] };
  if (typeof input.title === 'string') conv.title = input.title;
  if (typeof input.archived === 'boolean') conv.archived = input.archived;
  if (typeof input.projectId === 'string') conv.projectId = input.projectId;

  const updatedConversations = index.conversations.slice();
  updatedConversations[idx] = conv;
  await writeSessionIndex(updatedConversations as ConversationSummary[], root);

  return {
    id: conv.id,
    title: conv.title,
    projectId: conv.projectId,
    updatedAt: conv.updatedAt,
    active: false,
    agentId: conv.agentId,
  };
}

export async function deleteConversation(
  workspaceRoot: string,
  conversationId: string,
): Promise<boolean> {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const index = await readSessionIndex(root);
  const idx = index.conversations.findIndex((c) => c.id === conversationId);
  if (idx === -1) return false;
  const updated = index.conversations.slice();
  updated.splice(idx, 1);
  await writeSessionIndex(updated as ConversationSummary[], root);
  await rebuildSessionIndex(root);
  return true;
}
