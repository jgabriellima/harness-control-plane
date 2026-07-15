import { c as collectInstructionCorpus, e as estimateRuntimeOverhead, r as readSdkContextUsageSnapshot, h as handleApiError } from './sdk-context-usage-reader_foPKFTT8.mjs';
import { a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const GET = async ({ request, url }) => {
  const projectId = url.searchParams.get("project_id")?.trim();
  const agentId = url.searchParams.get("agent_id")?.trim();
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const corpus = await collectInstructionCorpus(workspaceRoot);
    const overhead = estimateRuntimeOverhead(corpus);
    if (agentId) {
      const sdkSnapshot = await readSdkContextUsageSnapshot({
        workspaceCwd: workspaceRoot,
        agentId
      });
      if (sdkSnapshot) {
        return jsonOk({
          corpus,
          overhead,
          sdkUsage: {
            usedTokens: sdkSnapshot.usedTokens,
            maxTokens: sdkSnapshot.maxTokens,
            categories: sdkSnapshot.categories.filter((node) => node.id && typeof node.tokens === "number" && node.tokens > 0).map((node) => ({
              id: node.id,
              label: node.label ?? node.id,
              tokens: node.tokens,
              children: (node.children ?? []).filter((child) => child.id && typeof child.tokens === "number" && child.tokens > 0).map((child) => ({
                id: child.id,
                label: child.label ?? child.id,
                tokens: child.tokens,
                contentPreview: child.contentPreview
              }))
            })),
            agentId: sdkSnapshot.agentId,
            checkpointBlobId: sdkSnapshot.checkpointBlobId,
            updatedAt: sdkSnapshot.updatedAt
          }
        });
      }
    }
    return jsonOk({
      corpus,
      overhead,
      sdkUsage: null
    });
  } catch (error) {
    return handleApiError(
      "runtime.context_usage",
      error,
      "Unable to load context usage right now.",
      500,
      { agent_id: agentId ?? null, project_id: projectId ?? null }
    );
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
