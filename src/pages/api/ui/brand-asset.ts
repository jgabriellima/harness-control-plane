import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { jsonError } from '../../../lib/api-json';
import { resolveProjectAssetPath } from '../../../lib/presentation-assets';
import { resolveProjectRoot } from '../../../lib/project-root';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export const GET: APIRoute = async ({ url }) => {
  const assetPath = url.searchParams.get('path')?.trim();
  if (!assetPath) {
    return jsonError('path query parameter is required', 400);
  }

  const projectRoot = resolveProjectRoot();
  const absolutePath = resolveProjectAssetPath(projectRoot, assetPath);
  if (!absolutePath) {
    return jsonError('Asset not found', 404);
  }

  try {
    const bytes = await readFile(absolutePath);
    const ext = extname(absolutePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream';

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return jsonError('Failed to read asset', 500);
  }
};
