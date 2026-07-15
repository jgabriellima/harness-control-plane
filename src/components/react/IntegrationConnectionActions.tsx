'use client';

import React, { useState } from 'react';

import IntegrationConnectButton from './IntegrationConnectButton';

interface IntegrationConnectionActionsProps {
  slotId: string;
  provider?: string;
  projectId?: string;
  compact?: boolean;
  verified?: boolean;
  needsReconnect?: boolean;
  failureReason?: string | null;
  expectedSubdomain?: string | null;
  onStateChange?: () => void;
}

function reconnectMessage(
  failureReason: string | null | undefined,
  expectedSubdomain: string | null | undefined,
): string {
  if (failureReason === 'subdomain_malformed') {
    if (expectedSubdomain) {
      return `Composio stored an invalid subdomain. Reconnect and enter only "${expectedSubdomain}" — not the full .atlassian.net URL.`;
    }
    return 'Composio stored an invalid subdomain. Reconnect and enter only the site slug before .atlassian.net.';
  }
  if (failureReason === 'credential_invalid') {
    return (
      'OAuth completed, but the token lacks required Confluence scopes (401). ' +
      'Disconnect, revoke the Composio app at id.atlassian.com → Authorized apps, then reconnect in a private window.'
    );
  }
  if (failureReason === 'remote_inactive') {
    return 'Composio connection is incomplete or refreshing. Reconnect to finish authorization.';
  }
  return 'Connection stored locally but Composio cannot use it — disconnect and connect again.';
}

export default function IntegrationConnectionActions({
  slotId,
  provider,
  projectId = 'default',
  compact = false,
  verified = true,
  needsReconnect = false,
  failureReason = null,
  expectedSubdomain = null,
  onStateChange,
}: IntegrationConnectionActionsProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect(): Promise<void> {
    setDisconnecting(true);
    setError(null);
    try {
      const params = new URLSearchParams({ project_id: projectId });
      if (provider) {
        params.set('provider', provider);
      }
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(slotId)}/disconnect?${params.toString()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Disconnect failed');
      }
      onStateChange?.();
    } catch (disconnectError) {
      const message = disconnectError instanceof Error ? disconnectError.message : 'Disconnect failed';
      setError(message);
    } finally {
      setDisconnecting(false);
    }
  }

  const buttonClassName = compact
    ? 'rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-50 disabled:opacity-50'
    : 'rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';

  return (
    <div
      data-testid={`integration-connection-actions-${slotId}`}
      className={compact ? 'flex shrink-0 flex-col items-end gap-2' : 'mb-3'}
    >
      {needsReconnect ? (
        <p
          className={`text-xs text-amber-700 ${compact ? 'max-w-[240px] text-right' : 'mb-2'}`}
          role="status"
        >
          {reconnectMessage(failureReason, expectedSubdomain)}
        </p>
      ) : null}
      {!verified && !needsReconnect ? (
        <p className={`text-xs text-amber-700 ${compact ? 'max-w-[200px] text-right' : 'mb-2'}`}>
          Verifying connection with Composio…
        </p>
      ) : null}
      <div className={`flex flex-wrap gap-2 ${compact ? 'justify-end' : ''}`}>
        {needsReconnect ? (
          <IntegrationConnectButton
            slotId={slotId}
            provider={provider}
            label="Reconnect"
            compact={compact}
            onConnected={onStateChange}
          />
        ) : null}
        <button
          type="button"
          className={buttonClassName}
          disabled={disconnecting}
          onClick={() => {
            void handleDisconnect();
          }}
        >
          {disconnecting ? '…' : 'Disconnect'}
        </button>
      </div>
      {error ? (
        <p
          className={`text-xs text-red-600 ${compact ? 'mt-1 max-w-[200px] text-right' : 'mt-1'}`}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
