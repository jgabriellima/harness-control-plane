'use client';

import React from 'react';

interface DesignHarnessPageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export default function DesignHarnessPageHeader({
  title,
  description,
  children,
}: DesignHarnessPageHeaderProps) {
  return (
    <header className="harness-page-header" data-testid="design-harness-page-header">
      <div className="harness-page-header__copy">
        <h1 className="harness-page-header__title">{title}</h1>
        {description ? (
          <p className="harness-page-header__description">{description}</p>
        ) : null}
      </div>
      {children ? <div className="harness-page-header__actions">{children}</div> : null}
    </header>
  );
}
