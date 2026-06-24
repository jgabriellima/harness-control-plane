import type { APIRoute } from 'astro';

import { collectContextWidgets } from '../../../lib/context-widgets';
import { listConversations, listProjects, loadReadinessSnapshot } from '../../../lib/harness-reader';
import { DEFAULT_WORKSPACE_ID } from '../../../lib/workspace-constants';

export const GET: APIRoute = async ({ url }) => {
  const projectId = url.searchParams.get('project_id')?.trim() || DEFAULT_WORKSPACE_ID;

  const [projects, allConversations, widgets, readiness] = await Promise.all([
    listProjects(),
    listConversations(),
    collectContextWidgets(),
    loadReadinessSnapshot(),
  ]);

  const conversations = allConversations.filter(
    (conversation) => conversation.projectId === projectId,
  );

  return new Response(
    JSON.stringify({
      projects,
      conversations,
      widgets,
      readiness,
      projectId,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      },
    },
  );
};
