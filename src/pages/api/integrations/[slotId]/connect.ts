import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import { composioAuthConfigId, composioConnectAvailable } from '../../../../lib/composio-auth-config';

export const GET: APIRoute = async ({ params }) => {
  const slotId = params.slotId?.trim();
  if (!slotId) {
    return jsonError('slotId is required', 400);
  }

  return jsonOk({
    slot_id: slotId,
    connect_available: composioConnectAvailable(slotId),
    auth_config_configured: Boolean(composioAuthConfigId(slotId)),
  });
};

export const POST: APIRoute = async ({ params, url }) => {
  const slotId = params.slotId?.trim();
  if (!slotId) {
    return jsonError('slotId is required', 400);
  }

  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  const authConfigId = composioAuthConfigId(slotId);

  if (!apiKey) {
    return jsonError('COMPOSIO_API_KEY is not configured on the server', 503);
  }
  if (!authConfigId) {
    return jsonError(`COMPOSIO_AUTH_CONFIG for slot ${slotId} is not configured`, 503);
  }

  const callbackUrl =
    url.searchParams.get('callback_url')?.trim() ||
    `${url.origin}/settings?connected=${encodeURIComponent(slotId)}`;
  const userId = url.searchParams.get('user_id')?.trim() || 'operator';

  try {
    const response = await fetch('https://backend.composio.dev/api/v3/connected_accounts/link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        auth_config_id: authConfigId,
        user_id: userId,
        callback_url: callbackUrl,
      }),
    });

    const body = (await response.json()) as { redirect_url?: string; error?: string };
    if (!response.ok || !body.redirect_url) {
      return jsonError(body.error ?? 'Composio link failed', response.status || 502);
    }

    return jsonOk({ redirect_url: body.redirect_url, slot_id: slotId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Composio connect failed';
    return jsonError(message, 502);
  }
};
