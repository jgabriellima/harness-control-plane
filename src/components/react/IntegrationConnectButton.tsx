'use client';

import React, { useEffect, useState } from 'react';

interface IntegrationConnectButtonProps {
  slotId: string;
  label?: string;
  compact?: boolean;
  onConnected?: () => void;
}

export default function IntegrationConnectButton({
  slotId,
  label = 'Connect',
  compact = false,
  onConnected,
}: IntegrationConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingReturn, setAwaitingReturn] = useState(false);

  useEffect(() => {
    if (!awaitingReturn || !onConnected) {
      return;
    }

    function handleFocus(): void {
      setAwaitingReturn(false);
      onConnected();
    }

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [awaitingReturn, onConnected]);

  async function handleConnect(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/integrations/${encodeURIComponent(slotId)}/connect`, {
        method: 'POST',
      });
      const payload = (await response.json()) as { redirect_url?: string; error?: string };
      if (!response.ok || !payload.redirect_url) {
        throw new Error(payload.error ?? 'Connect failed');
      }
      window.open(payload.redirect_url, '_blank', 'noopener,noreferrer');
      if (onConnected) {
        setAwaitingReturn(true);
      }
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : 'Connect failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const buttonClassName = compact
    ? 'rounded bg-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-violet-700 disabled:opacity-50'
    : 'rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50';

  return (
    <div data-testid={`integration-connect-${slotId}`} className={compact ? 'shrink-0' : undefined}>
      <button
        type="button"
        className={buttonClassName}
        disabled={loading}
        onClick={() => {
          void handleConnect();
        }}
      >
        {loading ? '…' : label}
      </button>
      {error && !compact ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
