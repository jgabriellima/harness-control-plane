import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';
import { a as assertDistributedRuntimeWorkspace } from './workspace-runtime-guard_BsJvssmK.mjs';
import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}
const POST = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const projectId = formData.get("project_id");
    if (!(file instanceof File)) {
      return jsonError("file is required", 400);
    }
    if (file.size > 10 * 1024 * 1024) {
      return jsonError("file must be 10MB or smaller", 400);
    }
    const { workspaceRoot } = await resolveRequestWorkspace(
      request,
      typeof projectId === "string" ? projectId : null
    );
    assertDistributedRuntimeWorkspace(workspaceRoot, "runtime.upload");
    const binding = await resolveHarnessBinding({ workspaceRoot });
    const uploadDir = join(binding.workspaceRoot, ".uploads");
    await mkdir(uploadDir, { recursive: true });
    const stamp = Date.now();
    const safeName = sanitizeFilename(file.name || "upload.bin");
    const storedName = `${stamp}-${safeName}`;
    const storedPath = join(uploadDir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storedPath, buffer);
    return jsonOk({
      name: file.name,
      path: storedPath,
      content_type: file.type || "application/octet-stream",
      size: file.size
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload file";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
