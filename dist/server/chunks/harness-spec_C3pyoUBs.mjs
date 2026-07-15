import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const GET = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
    const specsDir = join(binding.harnessRoot, "workflows");
    const indexPath = join(binding.harnessRoot, "INDEX.md");
    let indexExcerpt = "";
    try {
      const raw = await readFile(indexPath, "utf8");
      indexExcerpt = raw.split("\n").slice(0, 24).join("\n");
    } catch {
      indexExcerpt = "Harness index unavailable";
    }
    return jsonOk({
      harnessRoot: binding.harnessRoot,
      workflowsPath: specsDir,
      indexExcerpt,
      operatorNote: "Business harness specs — invoke /business:hydrate before workflow runs."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load harness specs";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
