import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import {
  composioConnectAvailable,
  createComposioConnectLink,
  toolkitSlugFromSlotId,
} from '../../../../lib/composio-auth-config';

export const GET: APIRoute = async ({ params, url }) => {
  const slotId = params.slotId?.trim();
  if (!slotId) {
    return jsonError('slotId is required', 400);
  }

  const toolkitSlug =
    url.searchParams.get('toolkit')?.trim().toLowerCase() ?? toolkitSlugFromSlotId(slotId);

  return jsonOk({
    slot_id: slotId,
    toolkit: toolkitSlug,
    connect_available: composioConnectAvailable(toolkitSlug),
  });
};

export const POST: APIRoute = async ({ params, url }) => {
  const slotId = params.slotId?.trim();
  if (!slotId) {
    return jsonError('slotId is required', 400);
  }

  const toolkitSlug =
    url.searchParams.get('toolkit')?.trim().toLowerCase() ??
    toolkitSlugFromSlotId(slotId);

  if (!composioConnectAvailable(toolkitSlug)) {
    return jsonError('COMPOSIO_API_KEY is not configured on the server', 503);
  }

  const callbackUrl =
    url.searchParams.get('callback_url')?.trim() ||
    `${url.origin}/?connected=${encodeURIComponent(slotId)}`;
  const userId = url.searchParams.get('user_id')?.trim() || 'operator';

  try {
    const redirectUrl = await createComposioConnectLink({
      toolkitSlug,
      userId,
      callbackUrl,
    });

    return jsonOk({ redirect_url: redirectUrl, slot_id: slotId, toolkit: toolkitSlug });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Composio connect failed';
    return jsonError(message, 502);
  }
};
