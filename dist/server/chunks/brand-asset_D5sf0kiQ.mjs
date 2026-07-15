import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { r as resolveProjectAssetPath } from './presentation-assets_bMGCp9w3.mjs';
import { r as resolveProjectRoot } from './project-root_D7dTqIZJ.mjs';

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
const GET = async ({ url }) => {
  const assetPath = url.searchParams.get("path")?.trim();
  if (!assetPath) {
    return jsonError("path query parameter is required", 400);
  }
  const projectRoot = resolveProjectRoot();
  const absolutePath = resolveProjectAssetPath(projectRoot, assetPath);
  if (!absolutePath) {
    return jsonError("Asset not found", 404);
  }
  try {
    const bytes = await readFile(absolutePath);
    const ext = extname(absolutePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch {
    return jsonError("Failed to read asset", 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
