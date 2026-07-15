'use client';

import React, { useEffect, useRef, useState } from 'react';

import { openExternalUrl } from '../../lib/open-external-url';
import { isTauriDesktopShell } from '../../lib/runtime-surface';

interface IntegrationConnectButtonProps {
  slotId: string;
  provider?: string;
  projectId?: string;
  label?: string;
  compact?: boolean;
  onConnected?: () => void;
}

interface PollResult {
  connected: boolean;
  verified: boolean;
  failureReason?: string | null;
  expectedSubdomain?: string | null;
  error?: string;
}

function subdomainFailureMessage(expectedSubdomain: string | null | undefined): string {
  if (expectedSubdomain) {
    return `On the Composio page, enter only "${expectedSubdomain}" as subdomain — not the full .atlassian.net URL. Then click Reconnect.`;
  }
  return 'On the Composio page, enter only the site slug before .atlassian.net — not the full URL. Then click Reconnect.';
}

export default function IntegrationConnectButton({
  slotId,
  provider,
  projectId = 'default',
  label = 'Connect',
  compact = false,
  onConnected,
}: IntegrationConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subdomainHint, setSubdomainHint] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRedirectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  async function pollConnection(): Promise<PollResult> {
    const params = new URLSearchParams({ slot: slotId, project_id: projectId });
    if (provider) {
      params.set('provider', provider);
    }
    const response = await fetch(`/api/integrations/composio/callback?${params.toString()}`);
    const payload = (await response.json()) as {
      connected?: boolean;
      verified?: boolean;
      needs_reconnect?: boolean;
      failure_reason?: string | null;
      expected_subdomain?: string | null;
      error?: string;
      code?: string;
      received_subdomain?: string;
    };

    if (!response.ok) {
      if (payload.code === 'composio_subdomain_malformed') {
        return {
          connected: false,
          verified: false,
          failureReason: 'subdomain_malformed',
          expectedSubdomain: payload.expected_subdomain,
          error: payload.error,
        };
      }
      return { connected: false, verified: false, error: payload.error };
    }

    return {
      connected: Boolean(payload.connected),
      verified: Boolean(payload.verified),
      failureReason: payload.failure_reason,
      expectedSubdomain: payload.expected_subdomain,
    };
  }

  function notifyOAuthComplete(slot: string, verified: boolean): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const channel = new BroadcastChannel('composio-oauth-complete');
      channel.postMessage({ slotId: slot, projectId, verified });
      channel.close();
    } catch {
      // BroadcastChannel unavailable — focus reload still applies.
    }
  }

  function stopPolling(): void {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
  }

  function startPolling(expectedSubdomain: string | null): void {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }
    setPolling(true);
    let attempts = 0;
    pollTimerRef.current = setInterval(() => {
      attempts += 1;
      void pollConnection().then((result) => {
        if (result.failureReason === 'subdomain_malformed') {
          stopPolling();
          setError(subdomainFailureMessage(result.expectedSubdomain ?? expectedSubdomain));
          onConnected?.();
          return;
        }

        if (result.connected && result.verified) {
          stopPolling();
          setError(null);
          notifyOAuthComplete(slotId, true);
          onConnected?.();
          return;
        }

        if (result.connected && !result.verified) {
          stopPolling();
          setError(subdomainFailureMessage(result.expectedSubdomain ?? expectedSubdomain));
          notifyOAuthComplete(slotId, false);
          onConnected?.();
          return;
        }

        if (attempts >= 45) {
          stopPolling();
          setError(
            'OAuth is taking longer than expected. Complete authorization in the browser tab, then return here.',
          );
        }
      });
    }, 2000);
  }

  async function handleConnect(): Promise<void> {
    if (polling && lastRedirectUrlRef.current) {
      setError(null);
      const reopened = await openExternalUrl(lastRedirectUrlRef.current);
      if (!reopened) {
        setError('Could not open the system browser — try again.');
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ project_id: projectId });
      if (provider) {
        params.set('provider', provider);
      }
      const response = await fetch(`/api/integrations/${encodeURIComponent(slotId)}/connect?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const payload = (await response.json()) as {
        redirect_url?: string;
        error?: string;
        subdomain_hint?: string | null;
        connection_data?: { subdomain?: string } | null;
      };
      if (!response.ok || !payload.redirect_url) {
        throw new Error(payload.error ?? 'Connect failed');
      }

      const hint = payload.subdomain_hint ?? payload.connection_data?.subdomain ?? null;
      setSubdomainHint(hint);
      lastRedirectUrlRef.current = payload.redirect_url;
      const opened = await openExternalUrl(payload.redirect_url);
      if (!opened) {
        throw new Error(
          isTauriDesktopShell()
            ? 'Could not open the system browser. Restart the desktop app and try again.'
            : 'Popup blocked — allow popups for this site or open the authorization link manually.',
        );
      }

      startPolling(hint);
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : 'Connect failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const buttonClassName = compact
    ? 'rounded bg-gray-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-gray-800 disabled:opacity-50'
    : 'rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50';

  const busy = loading;

  return (
    <div data-testid={`integration-connect-${slotId}`} className={compact ? 'shrink-0' : 'mb-3'}>
      <button
        type="button"
        className={buttonClassName}
        disabled={busy}
        onClick={() => {
          void handleConnect();
        }}
      >
        {loading ? '…' : polling ? 'Open authorization' : label}
      </button>
      {subdomainHint ? (
        <p
          className={`text-xs font-medium text-amber-800 ${compact ? 'mt-1 max-w-[220px] text-right' : 'mt-2'}`}
          role="status"
        >
          Composio subdomain: enter only <span className="font-mono">{subdomainHint}</span>
        </p>
      ) : null}
      {error ? (
        <p
          className={`text-xs text-red-600 ${compact ? 'mt-1 max-w-[220px] text-right' : 'mt-1'}`}
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {!compact ? (
        <p className="mt-2 text-xs text-gray-500">
          {isTauriDesktopShell()
            ? 'Opens Composio authorization in your default browser. Connection is stored in the OS keychain after approval.'
            : 'Opens Composio authorization in a new tab. Connection is stored in the OS keychain after approval.'}
        </p>
      ) : null}
    </div>
  );
}
