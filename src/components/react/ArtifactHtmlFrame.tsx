'use client';

import React from 'react';

interface ArtifactHtmlFrameProps {
  title: string;
  previewUrl: string;
  testId: string;
}

/** Native browser preview via served workspace file URL (not srcDoc). */
export default function ArtifactHtmlFrame({ title, previewUrl, testId }: ArtifactHtmlFrameProps) {
  return (
    <iframe
      title={title}
      className="h-full w-full border-0 bg-white"
      src={previewUrl}
      data-testid={testId}
    />
  );
}
