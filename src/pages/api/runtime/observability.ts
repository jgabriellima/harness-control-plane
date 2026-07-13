import type { APIRoute } from 'astro';

import { handleApiError } from '../../../lib/api-error';
import { jsonError, jsonOk } from '../../../lib/api-json';
import { collectInstructionCorpus, estimateRuntimeOverhead } from '../../../lib/context-usage-corpus';
import { readSdkAgentObservability } from '../../../lib/sdk-agent-observability';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ request, url }) => {
  const projectId = url.searchParams.get('project_id')?.trim();
  const agentId = url.searchParams.get('agent_id')?.trim();
  const conversationId = url.searchParams.get('conversation_id')?.trim();

  if (!agentId) {
    return jsonError('agent_id is required', 400);
  }

  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const observability = await readSdkAgentObservability({
      workspaceRoot,
      agentId,
    });

    if (!observability) {
      const corpus = await collectInstructionCorpus(workspaceRoot);
      const overhead = estimateRuntimeOverhead(corpus);
      return jsonOk({
        source: 'sdk_agent_store',
        agentId,
        conversationId: conversationId ?? null,
        updatedAt: new Date().toISOString(),
        runs: [],
        toolCalls: [],
        generatedFiles: [],
        contextUsage: {
          corpus,
          overhead,
          sdkUsage: null,
        },
      });
    }

    const corpus = await collectInstructionCorpus(workspaceRoot);
    const overhead = estimateRuntimeOverhead(corpus);

    const sdkUsage = observability.contextUsage
      ? {
          usedTokens: observability.contextUsage.usedTokens,
          maxTokens: observability.contextUsage.maxTokens,
          categories: observability.contextUsage.categories
            .filter((node) => node.id && typeof node.tokens === 'number' && node.tokens > 0)
            .map((node) => ({
              id: node.id as string,
              label: node.label ?? (node.id as string),
              tokens: node.tokens as number,
              children: (node.children ?? [])
                .filter((child) => child.id && typeof child.tokens === 'number' && child.tokens > 0)
                .map((child) => ({
                  id: child.id as string,
                  label: child.label ?? (child.id as string),
                  tokens: child.tokens as number,
                  contentPreview: child.contentPreview,
                })),
            })),
          agentId: observability.contextUsage.agentId,
          checkpointBlobId: observability.contextUsage.checkpointBlobId,
          updatedAt: observability.contextUsage.updatedAt,
        }
      : null;

    return jsonOk({
      source: observability.source,
      agentId: observability.agentId,
      conversationId: conversationId ?? null,
      updatedAt: observability.updatedAt,
      runs: observability.runs,
      toolCalls: observability.toolCalls,
      generatedFiles: observability.generatedFiles,
      contextUsage: {
        corpus,
        overhead,
        sdkUsage,
      },
    });
  } catch (error) {
    return handleApiError(
      'runtime.observability',
      error,
      'Unable to load runtime observability right now.',
      500,
      { agent_id: agentId, conversation_id: conversationId ?? null, project_id: projectId ?? null },
    );
  }
};
