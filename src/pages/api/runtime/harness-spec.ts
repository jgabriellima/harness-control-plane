import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { resolveHarnessBinding } from '../../../lib/harness-binding';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const GET: APIRoute = async () => {
  try {
    const binding = await resolveHarnessBinding();
    const specsDir = join(binding.harnessRoot, 'workflows');
    const indexPath = join(binding.harnessRoot, 'INDEX.md');

    let indexExcerpt = '';
    try {
      const raw = await readFile(indexPath, 'utf8');
      indexExcerpt = raw.split('\n').slice(0, 24).join('\n');
    } catch {
      indexExcerpt = 'Harness index unavailable';
    }

    return jsonOk({
      harnessRoot: binding.harnessRoot,
      workflowsPath: specsDir,
      indexExcerpt,
      operatorNote: 'Business harness specs — invoke /business:hydrate before workflow runs.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load harness specs';
    return jsonError(message, 500);
  }
};
