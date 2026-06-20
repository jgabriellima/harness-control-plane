import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { loadReadinessSnapshot } from '../../../lib/harness-reader';
import { ensureWorkspacesContainer } from '../../../lib/workspaces-root';

export const GET: APIRoute = async () => {
  try {
    await ensureWorkspacesContainer();
    const snapshot = await loadReadinessSnapshot();

    if (!snapshot) {
      return jsonError(
        'Readiness snapshot not found. Run business_sync_reconcile.py or doctor --write-snapshot.',
        404,
      );
    }

    return jsonOk(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load readiness snapshot';
    return jsonError(message, 500);
  }
};
