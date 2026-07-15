'use client';

import React from 'react';

interface DesignHarnessSurfaceProps {
  children: React.ReactNode;
  testId?: string;
}

export default function DesignHarnessSurface({ children, testId }: DesignHarnessSurfaceProps) {
  return (
    <div
      className="design-harness-surface h-full min-h-0 flex flex-col bg-[var(--tw-paper,var(--bg))] text-[var(--text)]"
      data-testid={testId}
    >
      {children}
    </div>
  );
}
