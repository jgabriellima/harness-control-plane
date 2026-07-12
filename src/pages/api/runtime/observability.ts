import type { APIRoute } from 'astro';

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
      return jsonError('No SDK observability data for agent', 404);
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
    const message = error instanceof Error ? error.message : 'Failed to read SDK observability';
    return jsonError(message, 500);
  }
};
