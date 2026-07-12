import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { collectInstructionCorpus, estimateRuntimeOverhead } from '../../../lib/context-usage-corpus';
import {
  readSdkContextUsageSnapshot,
} from '../../../lib/sdk-context-usage-reader';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ request, url }) => {
  const projectId = url.searchParams.get('project_id')?.trim();
  const agentId = url.searchParams.get('agent_id')?.trim();

  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const corpus = await collectInstructionCorpus(workspaceRoot);
    const overhead = estimateRuntimeOverhead(corpus);

    if (agentId) {
      const sdkSnapshot = await readSdkContextUsageSnapshot({
        workspaceCwd: workspaceRoot,
        agentId,
      });

      if (sdkSnapshot) {
        return jsonOk({
          corpus,
          overhead,
          sdkUsage: {
            usedTokens: sdkSnapshot.usedTokens,
            maxTokens: sdkSnapshot.maxTokens,
            categories: sdkSnapshot.categories
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
            agentId: sdkSnapshot.agentId,
            checkpointBlobId: sdkSnapshot.checkpointBlobId,
            updatedAt: sdkSnapshot.updatedAt,
          },
        });
      }
    }

    return jsonOk({
      corpus,
      overhead,
      sdkUsage: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to collect context usage corpus';
    return jsonError(message, 500);
  }
};
