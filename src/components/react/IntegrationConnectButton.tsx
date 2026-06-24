'use client';

import React, { useState } from 'react';

interface IntegrationConnectButtonProps {
  slotId: string;
  label?: string;
}

export default function IntegrationConnectButton({
  slotId,
  label = 'Connect',
}: IntegrationConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : 'Connect failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-testid={`integration-connect-${slotId}`}>
      <button
        type="button"
        className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        disabled={loading}
        onClick={() => {
          void handleConnect();
        }}
      >
        {loading ? 'Connecting…' : label}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
