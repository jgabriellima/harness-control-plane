import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import {
  groupSecretsBySlot,
  loadCredentialManifest,
} from '../../../../lib/credential-manifest';
import { probeCredentialPresence, storeCredential } from '../../../../lib/credential-store';

export const GET: APIRoute = async ({ params }) => {
  const slotId = params.slotId;
  if (!slotId) {
    return jsonError('slotId is required', 400);
  }

  try {
    const manifest = await loadCredentialManifest();
    if (!manifest) {
      return jsonOk([]);
    }
    const grouped = groupSecretsBySlot(manifest);
    const entries = grouped.get(slotId) ?? [];
    const provider = entries[0]?.provider ?? '';
    const presence = await probeCredentialPresence(
      entries.map((entry) => ({
        env_var: entry.env_var,
        storage: entry.storage,
        required: entry.required,
        description: entry.description,
      })),
      provider,
    );
    return jsonOk(presence);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to probe credentials';
    return jsonError(message, 500);
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  const slotId = params.slotId;
  if (!slotId) {
    return jsonError('slotId is required', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).env_var !== 'string' ||
    typeof (body as Record<string, unknown>).value !== 'string'
  ) {
    return jsonError('env_var and value are required', 400);
  }

  const { env_var: envVar, value } = body as { env_var: string; value: string };

  try {
    const manifest = await loadCredentialManifest();
    const entry = manifest?.secrets.find(
      (secret) => secret.slot_id === slotId && secret.env_var === envVar,
    );
    if (!entry) {
      return jsonError('Unknown credential for slot', 400);
    }
    if (entry.storage === 'cli_session') {
      return jsonError('CLI session credentials cannot be stored via API', 400);
    }
    await storeCredential(envVar, value);
    return jsonOk({ env_var: envVar, present: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to store credential';
    return jsonError(message, 500);
  }
};
