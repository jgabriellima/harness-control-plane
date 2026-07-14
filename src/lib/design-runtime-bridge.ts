import { mergeStreamingAssistantText } from './assistant-text';
import type { DesignProjectRecord } from './design-api';
import { subscribeRuntimeStream } from './sse-client';
import { toUserFacingRuntimeDispatchErrorMessage } from './user-facing-error';
import { DEFAULT_WORKSPACE_ID } from './workspace-constants';

export interface OrchestratorWorkspaceMetadata {
  kind: 'scratch';
  sourceLabel?: string;
  sourceRef?: string;
  baseRevision?: string;
  writeback?: 'external';
}

export interface OrchestratorChatDispatchInput {
  /** Design project id (OD project record). */
  projectId: string;
  message: string;
  /** Folder-backed scratch workspace root (metadata.baseDir). */
  workspaceRoot: string;
  conversationId?: string;
  agentId?: string | null;
  signal?: AbortSignal;
}

export interface OrchestratorChatStreamHandlers {
  onTextUpdate: (content: string) => void;
  onError: (error: Error) => void;
  onComplete?: () => void;
}

export interface OrchestratorChatDispatchResult {
  runId: string;
  agentId: string;
  streamUrl: string;
}

interface ChatDispatchResponseBody {
  run_id: string;
  agent_id: string;
  stream_url: string;
  conversation_id?: string;
  request_id?: string;
  error?: string;
  phase?: string;
  detail?: string;
}

function isOrchestratorWorkspaceMetadata(value: unknown): value is OrchestratorWorkspaceMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.kind === 'scratch';
}

export function isOrchestratorWorkspaceProject(project: DesignProjectRecord): boolean {
  const orchestratorWorkspace = project.metadata?.orchestratorWorkspace;
  const baseDir = project.metadata?.baseDir;
  return (
    isOrchestratorWorkspaceMetadata(orchestratorWorkspace) &&
    typeof baseDir === 'string' &&
    baseDir.trim().length > 0
  );
}

export function resolveOrchestratorWorkspaceRoot(project: DesignProjectRecord): string | null {
  const baseDir = project.metadata?.baseDir;
  if (typeof baseDir !== 'string') {
    return null;
  }
  const trimmed = baseDir.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Derive harness workspace project_id from a scratch workspace path. */
export function resolveOrchestratorHarnessProjectId(workspaceRoot: string): string {
  const normalized = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const workspacesMarker = '/workspaces/';
  const markerIndex = normalized.lastIndexOf(workspacesMarker);
  if (markerIndex !== -1) {
    const remainder = normalized.slice(markerIndex + workspacesMarker.length);
    const projectId = remainder.split('/')[0]?.trim();
    if (projectId) {
      return projectId;
    }
  }

  const lastSegment = normalized.split('/').filter((segment) => segment.length > 0).pop();
  return lastSegment ?? DEFAULT_WORKSPACE_ID;
}

export function buildOrchestratorChatRequestBody(
  input: OrchestratorChatDispatchInput,
): Record<string, unknown> {
  const harnessProjectId = resolveOrchestratorHarnessProjectId(input.workspaceRoot);

  return {
    project_id: harnessProjectId,
    message: input.message,
    mode: 'default',
    ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
    ...(input.agentId ? { agent_id: input.agentId } : {}),
    metadata: {
      orchestrator_workspace: true,
      workspace_root: input.workspaceRoot,
      design_project_id: input.projectId,
      dispatch_surface: 'design_studio',
    },
  };
}

async function postOrchestratorChat(
  input: OrchestratorChatDispatchInput,
  allowAuthRetry: boolean,
): Promise<Response> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: input.signal,
    body: JSON.stringify(
      buildOrchestratorChatRequestBody({
        ...input,
        agentId: allowAuthRetry ? null : input.agentId,
      }),
    ),
  });

  if (response.status === 503 && allowAuthRetry) {
    const harnessProjectId = resolveOrchestratorHarnessProjectId(input.workspaceRoot);
    await fetch(
      `/api/runtime/reconcile-auth?project_id=${encodeURIComponent(harnessProjectId)}`,
      { method: 'POST', signal: input.signal },
    );
    return postOrchestratorChat(input, false);
  }

  return response;
}

export async function dispatchOrchestratorChat(
  input: OrchestratorChatDispatchInput,
  handlers: OrchestratorChatStreamHandlers,
): Promise<OrchestratorChatDispatchResult> {
  const response = await postOrchestratorChat(input, true);
  const body = (await response.json()) as ChatDispatchResponseBody;

  if (!response.ok) {
    throw new Error(
      toUserFacingRuntimeDispatchErrorMessage(body.error ?? 'Runtime dispatch failed'),
    );
  }

  if (!body.stream_url || !body.run_id || !body.agent_id) {
    throw new Error('Runtime dispatch did not return stream metadata');
  }

  let assistantContent = '';

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };

    const unsubscribe = subscribeRuntimeStream(body.stream_url, {
      onEvent: (event) => {
        if (event.type === 'assistant' && typeof event.payload.text === 'string') {
          assistantContent = mergeStreamingAssistantText(assistantContent, event.payload.text);
          handlers.onTextUpdate(assistantContent);
        }
        if (event.type === 'error') {
          const message =
            typeof event.payload.message === 'string'
              ? event.payload.message
              : 'Runtime stream failed';
          const error = new Error(message);
          finish(() => {
            unsubscribe();
            handlers.onError(error);
            reject(error);
          });
        }
      },
      onError: (error) => {
        finish(() => {
          unsubscribe();
          handlers.onError(error);
          reject(error);
        });
      },
      onComplete: () => {
        finish(() => {
          unsubscribe();
          handlers.onComplete?.();
          resolve();
        });
      },
    });

    input.signal?.addEventListener(
      'abort',
      () => {
        finish(() => {
          unsubscribe();
          reject(new DOMException('Aborted', 'AbortError'));
        });
      },
      { once: true },
    );
  });

  return {
    runId: body.run_id,
    agentId: body.agent_id,
    streamUrl: body.stream_url,
  };
}
