'use client';

import { useCallback, useEffect, useState } from 'react';

import type {
  SdkAgentObservability,
  SdkGeneratedFileRecord,
  SdkToolCallRecord,
} from '@/lib/sdk-agent-observability-types';

interface ObservabilityPayload {
  source?: string;
  agentId?: string;
  toolCalls?: SdkToolCallRecord[];
  generatedFiles?: SdkGeneratedFileRecord[];
  contextUsage?: {
    corpus?: unknown;
    overhead?: unknown;
    sdkUsage?: unknown;
  };
  error?: string;
}

export interface SdkObservabilitySnapshot {
  toolCalls: SdkToolCallRecord[];
  generatedFiles: SdkGeneratedFileRecord[];
  contextUsage: ObservabilityPayload['contextUsage'] | null;
  loading: boolean;
  error: string | null;
  revision: number;
}

export function useSdkObservability(input: {
  agentId: string | null;
  projectId: string;
  conversationId: string;
  refreshRevision?: number;
}): SdkObservabilitySnapshot {
  const [toolCalls, setToolCalls] = useState<SdkToolCallRecord[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<SdkGeneratedFileRecord[]>([]);
  const [contextUsage, setContextUsage] = useState<ObservabilityPayload['contextUsage'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!input.agentId) {
      setToolCalls([]);
      setGeneratedFiles([]);
      setContextUsage(null);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          agent_id: input.agentId as string,
          project_id: input.projectId,
          conversation_id: input.conversationId,
        });
        const response = await fetch(`/api/runtime/observability?${params.toString()}`);
        const rawBody = await response.text();
        let payload: ObservabilityPayload;

        try {
          payload = JSON.parse(rawBody) as ObservabilityPayload;
        } catch {
          throw new Error(
            response.ok ? 'Observability API returned invalid JSON' : `Observability failed (${response.status})`,
          );
        }

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load SDK observability');
        }

        if (!cancelled) {
          setToolCalls(payload.toolCalls ?? []);
          setGeneratedFiles(payload.generatedFiles ?? []);
          setContextUsage(payload.contextUsage ?? null);
          setRevision((current) => current + 1);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to load SDK observability';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [input.agentId, input.projectId, input.conversationId, input.refreshRevision]);

  return {
    toolCalls,
    generatedFiles,
    contextUsage,
    loading,
    error,
    revision,
  };
}

export function mergeToolCallsWithLiveMessages(
  sdkToolCalls: SdkToolCallRecord[],
  liveMessages: Array<{
    id: string;
    role: string;
    content: string;
    recordedAt?: string;
    toolInput?: string;
    toolOutput?: string;
    streaming?: boolean;
  }>,
): SdkToolCallRecord[] {
  const merged = new Map<string, SdkToolCallRecord>();

  for (const call of sdkToolCalls) {
    merged.set(call.callId, call);
  }

  for (const message of liveMessages) {
    if (message.role !== 'tool') {
      continue;
    }

    const callId = message.id.startsWith('tool-') ? message.id.slice(5) : message.id;
    const [tool = 'tool', status = 'running'] = message.content.split(' · ');

    let args: unknown;
    let result: unknown;
    if (message.toolInput) {
      try {
        args = JSON.parse(message.toolInput) as unknown;
      } catch {
        args = message.toolInput;
      }
    }
    if (message.toolOutput) {
      try {
        result = JSON.parse(message.toolOutput) as unknown;
      } catch {
        result = message.toolOutput;
      }
    }

    const existing = merged.get(callId);
    merged.set(callId, {
      callId,
      runId: existing?.runId ?? 'live',
      turnNumber: existing?.turnNumber ?? 0,
      tool: tool.trim(),
      status: message.streaming ? 'running' : status.trim(),
      args: args ?? existing?.args,
      result: result ?? existing?.result,
      startedAt: existing?.startedAt ?? message.recordedAt ?? new Date().toISOString(),
      recordedAt: message.recordedAt ?? existing?.recordedAt ?? new Date().toISOString(),
      durationMs: existing?.durationMs,
    });
  }

  return [...merged.values()].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}
