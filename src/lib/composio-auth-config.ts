/** Normalize slot id to COMPOSIO_AUTH_CONFIG env suffix (e.g. slot.jira → SLOT_JIRA). */
export function composioAuthConfigEnvKey(slotId: string): string {
  const normalized = slotId.replace(/\./g, '_').replace(/-/g, '_').toUpperCase();
  return `COMPOSIO_AUTH_CONFIG_${normalized}`;
}

export function composioAuthConfigId(slotId: string): string | undefined {
  const value = process.env[composioAuthConfigEnvKey(slotId)]?.trim();
  return value || undefined;
}

/** True when server can broker Composio OAuth link for this slot. */
export function composioConnectAvailable(slotId: string): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim() && composioAuthConfigId(slotId));
}
