'use client';

import React from 'react';

export type PluginTrustTier = 'official' | 'trusted' | 'restricted';

interface PluginTrustBadgeProps {
  trust: PluginTrustTier | string;
  label?: string;
}

export function normalizePluginTrust(trust: string): PluginTrustTier {
  if (trust === 'bundled' || trust === 'official') return 'official';
  if (trust === 'trusted') return 'trusted';
  return 'restricted';
}

const TRUST_LABELS: Record<PluginTrustTier, string> = {
  official: 'Official',
  trusted: 'Trusted',
  restricted: 'Restricted',
};

export default function PluginTrustBadge({ trust, label }: PluginTrustBadgeProps) {
  const tier = normalizePluginTrust(trust);
  const text = label ?? TRUST_LABELS[tier];

  return (
    <span
      className={`plugin-trust-badge plugin-trust-badge--${tier}`}
      data-trust-tier={tier}
      title={text}
      aria-label={text}
    >
      <span className="plugin-trust-badge__dot" aria-hidden />
      <span>{text}</span>
    </span>
  );
}
