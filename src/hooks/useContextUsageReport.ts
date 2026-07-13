'use client';

import { useEffect, useMemo, useState } from 'react';

import { useSdkObservability, type SdkObservabilitySnapshot } from '@/hooks/useSdkObservability';
import {
  buildContextUsageReport,
  buildContextUsageReportFromSdk,
} from '@/lib/context-usage';
import type {
  ContextUsageReport,
  InstructionCorpusSnapshot,
  RuntimeOverheadEstimate,
  SdkContextUsagePayload,
} from '@/lib/context-usage-types';
import type { ChatMessage } from '@/lib/runtime-hub-types';
import { toUserFacingErrorMessage } from '@/lib/user-facing-error';

export interface ContextUsageReportSnapshot {
  report: ContextUsageReport | null;
  loading: boolean;
  error: string | null;
}

export function useContextUsageReport(input: {
  agentId: string | null;
  projectId: string;
  conversationId: string;
  title: string | null;
  messages: ChatMessage[];
  refreshRevision?: number;
  observability?: SdkObservabilitySnapshot | null;
}): ContextUsageReportSnapshot {
  const fetchedObservability = useSdkObservability({
    agentId: input.observability ? null : input.agentId,
    projectId: input.projectId,
    conversationId: input.conversationId,
    refreshRevision: input.refreshRevision,
  });
  const observability = input.observability ?? fetchedObservability;

  const [fallbackCorpus, setFallbackCorpus] = useState<InstructionCorpusSnapshot | null>(null);
  const [fallbackOverhead, setFallbackOverhead] = useState<RuntimeOverheadEstimate | null>(null);
  const [fallbackError, setFallbackError] = useState<string | null>(null);

  useEffect(() => {
    if (input.agentId) {
      setFallbackCorpus(null);
      setFallbackOverhead(null);
      setFallbackError(null);
      return;
    }

    let cancelled = false;

    async function loadCorpusFallback(): Promise<void> {
      setFallbackError(null);
      try {
        const params = new URLSearchParams();
        if (input.projectId) {
          params.set('project_id', input.projectId);
        }
        const query = params.toString();
        const response = await fetch(
          query.length > 0 ? `/api/runtime/context-usage?${query}` : '/api/runtime/context-usage',
        );

        const rawBody = await response.text();
        let payload: {
          corpus?: InstructionCorpusSnapshot;
          overhead?: RuntimeOverheadEstimate;
          error?: string;
        };

        try {
          payload = JSON.parse(rawBody) as typeof payload;
        } catch {
          throw new Error(
            response.ok
              ? 'Context usage API returned invalid JSON'
              : `Context usage API failed (${response.status})`,
          );
        }

        if (!response.ok) {
          throw new Error(
            toUserFacingErrorMessage(
              payload.error ?? 'Failed to load context usage',
              'Unable to load context usage right now.',
            ),
          );
        }

        if (!cancelled) {
          setFallbackCorpus(payload.corpus ?? null);
          setFallbackOverhead(payload.overhead ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          const message = toUserFacingErrorMessage(error, 'Unable to load context usage right now.');
          setFallbackError(message);
        }
      }
    }

    void loadCorpusFallback();

    return () => {
      cancelled = true;
    };
  }, [input.agentId, input.projectId]);

  const corpus =
    (observability.contextUsage?.corpus as InstructionCorpusSnapshot | undefined) ?? fallbackCorpus;
  const overhead =
    (observability.contextUsage?.overhead as RuntimeOverheadEstimate | undefined) ?? fallbackOverhead;
  const sdkUsage =
    (observability.contextUsage?.sdkUsage as SdkContextUsagePayload | null | undefined) ?? null;
  const loadError = observability.error ?? fallbackError;

  const report: ContextUsageReport | null = useMemo(() => {
    if (!corpus) {
      return null;
    }

    if (sdkUsage && input.agentId) {
      return buildContextUsageReportFromSdk({
        conversationId: input.conversationId,
        title: input.title,
        agentId: input.agentId,
        corpus,
        sdkUsage,
      });
    }

    if (!overhead) {
      return null;
    }

    return buildContextUsageReport({
      conversationId: input.conversationId,
      title: input.title,
      messages: input.messages,
      corpus,
      overhead,
      agentId: input.agentId,
    });
  }, [
    corpus,
    input.agentId,
    input.conversationId,
    input.messages,
    input.title,
    overhead,
    sdkUsage,
  ]);

  const loading =
    observability.loading || (!report && !loadError && Boolean(input.agentId || !corpus));

  return {
    report,
    loading,
    error: loadError,
  };
}
