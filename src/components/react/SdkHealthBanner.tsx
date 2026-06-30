'use client';

import React from 'react';

import { Button } from '@/components/ui/button';

interface SdkHealthBannerProps {
  message: string;
  checking?: boolean;
  onRetry?: () => void;
}

export default function SdkHealthBanner({ message, checking = false, onRetry }: SdkHealthBannerProps) {
  return (
    <div
      className="mx-4 mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
      data-testid="sdk-health-banner"
      role="status"
    >
      <p className="font-medium">Runtime Cursor indisponível</p>
      <p className="mt-1 text-xs leading-relaxed">{message}</p>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-7 border-amber-400 bg-white text-xs"
          data-testid="sdk-health-retry"
          disabled={checking}
          onClick={onRetry}
        >
          {checking ? 'Verificando…' : 'Verificar novamente'}
        </Button>
      ) : null}
    </div>
  );
}
