import { c as collectContextWidgets } from './context-widgets_DO20VoYs.mjs';
import { f as listProjects, h as listConversations, b as loadReadinessSnapshot } from './harness-reader_xurzrbMU.mjs';
import { D as DEFAULT_WORKSPACE_ID } from './workspace-constants_DFgBwlV3.mjs';

const GET = async ({ url }) => {
  const projectId = url.searchParams.get("project_id")?.trim() || DEFAULT_WORKSPACE_ID;
  const [projects, allConversations, widgets, readiness] = await Promise.all([
    listProjects(),
    listConversations(),
    collectContextWidgets(),
    loadReadinessSnapshot()
  ]);
  const conversations = allConversations.filter(
    (conversation) => conversation.projectId === projectId
  );
  return new Response(
    JSON.stringify({
      projects,
      conversations,
      widgets,
      readiness,
      projectId
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120"
      }
    }
  );
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
