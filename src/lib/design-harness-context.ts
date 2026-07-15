import type { OrchestratorWorkspaceMetadata } from './design-api';

export interface HarnessWorkspaceContext {
  harnessProjectId: string;
  workspaceRoot: string;
}

interface WorkspaceProjectRow {
  id: string;
  path?: string;
  active?: boolean;
}

function joinScratchDir(workspaceRoot: string): string {
  const normalized = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  return `${normalized}/scratch`;
}

export function buildOrchestratorProjectDefaults(
  context: HarnessWorkspaceContext,
): {
  baseDir: string;
  orchestratorWorkspace: OrchestratorWorkspaceMetadata;
} {
  return {
    baseDir: joinScratchDir(context.workspaceRoot),
    orchestratorWorkspace: {
      kind: 'scratch',
      sourceLabel: `harness:${context.harnessProjectId}`,
      writeback: 'external',
    },
  };
}

export async function fetchHarnessWorkspaceContext(): Promise<HarnessWorkspaceContext | null> {
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { projects?: WorkspaceProjectRow[] };
    const projects = payload.projects ?? [];
    const active =
      projects.find((project) => project.active) ??
      projects.find((project) => project.id === 'default') ??
      projects[0];

    if (!active?.id) {
      return null;
    }

    return {
      harnessProjectId: active.id,
      workspaceRoot: active.path?.trim() ?? '',
    };
  } catch {
    return null;
  }
}

const CONVERSATION_STORAGE_PREFIX = 'design-harness-conversation:';
export const DESIGN_PENDING_PROMPT_PREFIX = 'design-pending-prompt:';

export function storeDesignPendingPrompt(projectId: string, prompt: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const trimmed = prompt.trim();
  if (!trimmed) {
    return;
  }
  sessionStorage.setItem(`${DESIGN_PENDING_PROMPT_PREFIX}${projectId}`, trimmed);
}

export function consumeDesignPendingPrompt(projectId: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const key = `${DESIGN_PENDING_PROMPT_PREFIX}${projectId}`;
  const value = sessionStorage.getItem(key);
  if (value?.trim()) {
    sessionStorage.removeItem(key);
    return value.trim();
  }
  return null;
}

export function readStoredHarnessConversationId(projectId: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = sessionStorage.getItem(`${CONVERSATION_STORAGE_PREFIX}${projectId}`);
  return value?.trim() ? value.trim() : null;
}

export function storeHarnessConversationId(projectId: string, conversationId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.setItem(`${CONVERSATION_STORAGE_PREFIX}${projectId}`, conversationId);
}

export async function resolveOrCreateHarnessConversation(input: {
  projectId: string;
  projectName: string;
  harnessProjectId?: string;
  existingConversationId?: string | null;
}): Promise<string> {
  const stored =
    input.existingConversationId?.trim() ||
    readStoredHarnessConversationId(input.projectId);
  if (stored) {
    return stored;
  }

  const response = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.projectName,
      project_id: input.harnessProjectId,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create harness conversation for design project');
  }

  const payload = (await response.json()) as { conversation?: { id?: string } };
  const conversationId = payload.conversation?.id?.trim();
  if (!conversationId) {
    throw new Error('Conversation creation did not return an id');
  }

  storeHarnessConversationId(input.projectId, conversationId);
  return conversationId;
}
