'use client';

import { X } from 'lucide-react';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ArtifactFullscreenOverlayProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function ArtifactFullscreenOverlay({
  title,
  onClose,
  children,
}: ArtifactFullscreenOverlayProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black"
      data-testid="chat-artifact-fullscreen-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Fullscreen preview: ${title}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/90 px-4 py-2">
        <p className="truncate text-sm font-medium text-white">{title}</p>
        <button
          type="button"
          className="rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Close fullscreen preview"
          data-testid="chat-artifact-fullscreen-close"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>,
    document.body,
  );
}
