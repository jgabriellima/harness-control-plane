'use client';

import React from 'react';

export interface AmrGuidanceProps {
  onActivate: () => void;
}

export default function AmrGuidance({ onActivate }: AmrGuidanceProps) {
  return (
    <div className="amr-card amr-card--switch" data-testid="amr-guidance">
      <div className="amr-card__head">
        <span className="amr-card__icon" aria-hidden="true">
          !
        </span>
        <strong className="amr-card__title">Switch to Open Design Cloud</strong>
      </div>
      <p className="amr-card__body">
        Your local agent hit a limit. Use the hosted model for reliable execution without local CLI setup.
      </p>
      <div className="amr-card__chips" aria-hidden="true">
        <span className="amr-card__chip">Official</span>
        <span className="amr-card__chip">No API key</span>
        <span className="amr-card__chip">Auto-retry</span>
      </div>
      <div className="amr-card__actions">
        <button type="button" className="amr-card__cta" onClick={onActivate} data-testid="amr-guidance-cta">
          Switch to Open Design Cloud &amp; retry
        </button>
      </div>
    </div>
  );
}
